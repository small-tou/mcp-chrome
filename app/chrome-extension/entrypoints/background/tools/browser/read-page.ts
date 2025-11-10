import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { TOOL_MESSAGE_TYPES } from '@/common/message-types';
import { ERROR_MESSAGES } from '@/common/constants';
import { listMarkersForUrl } from '@/entrypoints/background/element-marker/element-marker-storage';

interface ReadPageParams {
  filter?: 'interactive'; // when omitted, return all visible elements
}

class ReadPageTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.READ_PAGE;

  // Execute read page
  async execute(args: ReadPageParams): Promise<ToolResult> {
    const { filter } = args || {};

    try {
      // Tip text returned to callers to guide next action
      const standardTips =
        "If the specific element you need is missing from the returned data, use the 'screenshot' tool to capture the current viewport and confirm the element's on-screen coordinates.";

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) return createErrorResponse(ERROR_MESSAGES.TAB_NOT_FOUND);
      const tab = tabs[0];
      if (!tab.id)
        return createErrorResponse(ERROR_MESSAGES.TAB_NOT_FOUND + ': Active tab has no ID');

      // Load any user-marked elements for this URL (priority hints)
      const currentUrl = String(tab.url || '');
      const userMarkers = currentUrl ? await listMarkersForUrl(currentUrl) : [];

      // Inject helper in ISOLATED world to enable chrome.runtime messaging
      // Inject into all frames to support same-origin iframe operations
      await this.injectContentScript(
        tab.id,
        ['inject-scripts/accessibility-tree-helper.js'],
        false,
        'ISOLATED',
        true,
      );

      // Ask content script to generate accessibility tree
      const resp = await this.sendMessageToTab(tab.id, {
        action: TOOL_MESSAGE_TYPES.GENERATE_ACCESSIBILITY_TREE,
        filter: filter || null,
      });

      // Evaluate tree result and decide whether to fallback
      const treeOk = resp && resp.success === true;
      const pageContent: string =
        resp && typeof resp.pageContent === 'string' ? resp.pageContent : '';
      const lines = pageContent
        ? pageContent.split('\n').filter((l: string) => l.trim().length > 0).length
        : 0;
      const refCount = Array.isArray(resp?.refMap) ? resp.refMap.length : 0;
      const isSparse = lines < 10 && refCount < 3; // heuristic threshold for sparse trees

      if (treeOk && !isSparse) {
        // Normal path: return tree
        const resultPayload = {
          success: true,
          filter: filter || 'all',
          pageContent: resp.pageContent,
          tips: standardTips,
          viewport: resp.viewport,
          refMapCount: refCount,
          sparse: false,
          // Include user-marked elements to guide callers
          markedElements: userMarkers.map((m) => ({
            name: m.name,
            selector: m.selector,
            selectorType: m.selectorType || 'css',
            urlMatch: { type: m.matchType, origin: m.origin, path: m.path },
            source: 'marker',
          })),
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(resultPayload) }],
          isError: false,
        };
      }

      // Fallback path: try get_interactive_elements once
      try {
        await this.injectContentScript(tab.id, ['inject-scripts/interactive-elements-helper.js']);
        const fallback = await this.sendMessageToTab(tab.id, {
          action: TOOL_MESSAGE_TYPES.GET_INTERACTIVE_ELEMENTS,
          includeCoordinates: true,
        });

        if (fallback && fallback.success && Array.isArray(fallback.elements)) {
          const limited = fallback.elements.slice(0, 150);
          // Merge user markers at the front, de-duplicated by selector
          const markerElements = userMarkers.map((m) => ({
            type: 'marker',
            selector: m.selector,
            text: m.name,
            selectorType: m.selectorType || 'css',
            isInteractive: true,
            source: 'marker',
          }));
          const seen = new Set(markerElements.map((e) => e.selector));
          const merged = [...markerElements, ...limited.filter((e: any) => !seen.has(e.selector))];
          const fallbackPayload = {
            success: true,
            fallbackUsed: true,
            fallbackSource: 'get_interactive_elements',
            reason: treeOk ? 'sparse_tree' : resp?.error || 'tree_failed',
            treeStats: { lines, refCount },
            elements: merged,
            count: fallback.elements.length,
            tips: standardTips,
          };

          return {
            content: [{ type: 'text', text: JSON.stringify(fallbackPayload) }],
            isError: false,
          };
        }
      } catch (fallbackErr) {
        console.warn('read_page fallback failed:', fallbackErr);
      }

      // If we reach here, both tree (usable) and fallback failed
      return createErrorResponse(
        treeOk
          ? 'Accessibility tree is too sparse and fallback failed'
          : resp?.error || 'Failed to generate accessibility tree and fallback failed',
      );
    } catch (error) {
      console.error('Error in read page tool:', error);
      return createErrorResponse(
        `Error generating accessibility tree: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const readPageTool = new ReadPageTool();
