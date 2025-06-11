import { initNativeHostListener } from './native-host';
import { initSemanticSimilarityListener } from './semantic-similarity';
import { initStorageManagerListener } from './storage-manager';
import { vectorSearchTabsContentTool } from './tools/browser/vector-search';
import { ERROR_MESSAGES } from '@/common/constants';
import { cleanupModelCache } from '@/utils/semantic-similarity-engine';

/**
 * Background script entry point
 * Initializes all background services and listeners
 */
export default defineBackground(() => {
  // Initialize core services
  initNativeHostListener();
  initSemanticSimilarityListener();
  initStorageManagerListener();

  // Initialize vector search tool and handle potential errors
  vectorSearchTabsContentTool.getIndexStats().catch((error) => {
    console.error(
      `${ERROR_MESSAGES.TOOL_EXECUTION_FAILED}: VectorSearchTabsContentTool initialization`,
      error,
    );
  });

  // Note: Semantic similarity engine initialization is now user-controlled via popup
  console.log('Background: Semantic similarity engine initialization is now user-controlled');

  // Set up periodic cache cleanup (every 24 hours)
  const CACHE_CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  // Initial cleanup on startup
  cleanupModelCache().catch((error) => {
    console.warn('Background: Initial cache cleanup failed:', error);
  });

  // Set up periodic cleanup
  setInterval(() => {
    cleanupModelCache().catch((error) => {
      console.warn('Background: Periodic cache cleanup failed:', error);
    });
  }, CACHE_CLEANUP_INTERVAL);

  console.log('Background: Periodic cache cleanup scheduled (every 24 hours)');
});
