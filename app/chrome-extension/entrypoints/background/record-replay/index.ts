import { BACKGROUND_MESSAGE_TYPES, TOOL_MESSAGE_TYPES } from '@/common/message-types';
import { Flow } from './types';
import {
  listFlows,
  saveFlow,
  getFlow,
  deleteFlow,
  publishFlow,
  unpublishFlow,
  exportFlow,
  exportAllFlows,
  importFlowFromJson,
  listSchedules,
  saveSchedule,
  removeSchedule,
  type FlowSchedule,
} from './flow-store';
import { runFlow } from './flow-runner';

// design note: background listener for record & replay; manages start/stop and storage

let currentRecording: { tabId: number; flow?: Flow } | null = null;
// 最近一次点击信息（用于导航富化）
let lastClickIdx: number | null = null;
let lastClickTime = 0;
let lastNavTaggedAt = 0;

// Alarm helpers for schedules
async function rescheduleAlarms() {
  const schedules = await listSchedules();
  // Clear existing rr_schedule_* alarms
  const alarms = await chrome.alarms.getAll();
  await Promise.all(
    alarms
      .filter((a) => a.name && a.name.startsWith('rr_schedule_'))
      .map((a) => chrome.alarms.clear(a.name)),
  );
  for (const s of schedules) {
    if (!s.enabled) continue;
    const name = `rr_schedule_${s.id}`;
    if (s.type === 'interval') {
      const minutes = Math.max(1, Math.floor(Number(s.when) || 0));
      await chrome.alarms.create(name, { periodInMinutes: minutes });
    } else if (s.type === 'once') {
      const whenMs = Date.parse(s.when);
      if (Number.isFinite(whenMs)) await chrome.alarms.create(name, { when: whenMs });
    } else if (s.type === 'daily') {
      // daily HH:mm local time
      const [hh, mm] = String(s.when || '00:00')
        .split(':')
        .map((x) => Number(x));
      const now = new Date();
      const next = new Date();
      next.setHours(hh || 0, mm || 0, 0, 0);
      if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
      await chrome.alarms.create(name, { when: next.getTime(), periodInMinutes: 24 * 60 });
    }
  }
}

async function ensureRecorderInjected(tabId: number): Promise<void> {
  // Inject helper and recorder scripts
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['inject-scripts/accessibility-tree-helper.js'],
    world: 'ISOLATED',
  } as any);
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['inject-scripts/recorder.js'],
    world: 'ISOLATED',
  } as any);
}

async function startRecording(meta?: Partial<Flow>): Promise<{ success: boolean; error?: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return { success: false, error: 'Active tab not found' };
  try {
    await ensureRecorderInjected(tab.id);
    currentRecording = { tabId: tab.id };
    await chrome.tabs.sendMessage(tab.id, {
      action: TOOL_MESSAGE_TYPES.RR_RECORDER_CONTROL,
      cmd: 'start',
      meta: {
        id: meta?.id,
        name: meta?.name,
        description: meta?.description,
      },
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

async function stopRecording(): Promise<{ success: boolean; flow?: Flow; error?: string }> {
  if (!currentRecording) return { success: false, error: 'No active recording' };
  try {
    const flowRes: any = await chrome.tabs.sendMessage(currentRecording.tabId, {
      action: TOOL_MESSAGE_TYPES.RR_RECORDER_CONTROL,
      cmd: 'stop',
    });
    const flowFromTab = (flowRes && flowRes.flow) as Flow | undefined;
    // 合并后台聚合的步骤（跨标签页）与内容脚本返回的步骤
    const aggregated = currentRecording.flow;
    const merged: Flow | undefined = (function merge() {
      if (aggregated && !flowFromTab) return aggregated;
      if (!aggregated && flowFromTab) return flowFromTab;
      if (!aggregated && !flowFromTab) return undefined;
      // both present: prefer元数据以 flowFromTab 为基，步骤采用 aggregated（包含跨标签页）
      return {
        ...(flowFromTab as Flow),
        steps: (aggregated as Flow).steps || [],
        variables: (aggregated as Flow).variables || (flowFromTab as Flow).variables,
        meta: {
          ...((flowFromTab as Flow).meta || {}),
          ...((aggregated as Flow).meta || {}),
          updatedAt: new Date().toISOString(),
        } as any,
      } as Flow;
    })();
    if (merged) {
      await saveFlow(merged);
    }
    const resp = { success: true, flow: merged };
    currentRecording = null;
    return resp;
  } catch (e: any) {
    const err = { success: false, error: e?.message || String(e) };
    currentRecording = null;
    return err;
  }
}

export function initRecordReplayListeners() {
  // On startup, re-schedule alarms
  rescheduleAlarms().catch(() => {});

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      if (message && message.type === 'rr_recorder_event') {
        if (currentRecording) {
          if (message.payload?.kind === 'start') {
            currentRecording.flow = message.payload.flow;
          } else if (message.payload?.kind === 'step') {
            // 记录最近一次 click/dblclick 的索引和时间，用于后续 tabs.onUpdated 导航富化
            const step = message.payload.step as any;
            if (step && (step.type === 'click' || step.type === 'dblclick')) {
              try {
                const idx = currentRecording.flow?.steps?.length ?? 0;
                lastClickIdx = idx;
                lastClickTime = Date.now();
              } catch {
                // ignore
              }
            }
            // 统一在后台累积步骤，便于跨标签页聚合
            try {
              if (!currentRecording.flow) {
                currentRecording.flow = {
                  id: `flow_${Date.now()}`,
                  name: '未命名录制',
                  version: 1,
                  steps: [],
                  variables: [],
                  meta: {
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  },
                } as Flow;
              }
              currentRecording.flow.steps.push(step);
              currentRecording.flow.meta = {
                ...(currentRecording.flow.meta || ({} as any)),
                updatedAt: new Date().toISOString(),
              } as any;
            } catch {
              // ignore
            }
          } else if (message.payload?.kind === 'stop') {
            currentRecording.flow = message.payload.flow || currentRecording.flow;
          }
        }
        sendResponse({ ok: true });
        return true;
      }

      switch (message?.type) {
        case BACKGROUND_MESSAGE_TYPES.RR_START_RECORDING: {
          startRecording(message.meta)
            .then(sendResponse)
            .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.RR_STOP_RECORDING: {
          stopRecording()
            .then(sendResponse)
            .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.RR_LIST_FLOWS: {
          listFlows()
            .then((flows) => sendResponse({ success: true, flows }))
            .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.RR_GET_FLOW: {
          getFlow(message.flowId)
            .then((flow) => sendResponse({ success: !!flow, flow }))
            .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.RR_DELETE_FLOW: {
          deleteFlow(message.flowId)
            .then(() => sendResponse({ success: true }))
            .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.RR_PUBLISH_FLOW: {
          getFlow(message.flowId)
            .then(async (flow) => {
              if (!flow) return sendResponse({ success: false, error: 'flow not found' });
              await publishFlow(flow, message.slug);
              sendResponse({ success: true });
            })
            .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.RR_UNPUBLISH_FLOW: {
          unpublishFlow(message.flowId)
            .then(() => sendResponse({ success: true }))
            .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.RR_RUN_FLOW: {
          getFlow(message.flowId)
            .then(async (flow) => {
              if (!flow) return sendResponse({ success: false, error: 'flow not found' });
              const result = await runFlow(flow, message.options || {});
              sendResponse({ success: true, result });
            })
            .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.RR_SAVE_FLOW: {
          const flow = message.flow as Flow;
          if (!flow || !flow.id) {
            sendResponse({ success: false, error: 'invalid flow' });
            return true;
          }
          saveFlow(flow)
            .then(() => sendResponse({ success: true }))
            .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.RR_EXPORT_FLOW: {
          exportFlow(message.flowId)
            .then((json) => sendResponse({ success: true, json }))
            .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.RR_EXPORT_ALL: {
          exportAllFlows()
            .then((json) => sendResponse({ success: true, json }))
            .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.RR_IMPORT_FLOW: {
          importFlowFromJson(message.json)
            .then((flows) => sendResponse({ success: true, imported: flows.length }))
            .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.RR_LIST_SCHEDULES: {
          listSchedules()
            .then((s) => sendResponse({ success: true, schedules: s }))
            .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.RR_SCHEDULE_FLOW: {
          const s = message.schedule as FlowSchedule;
          if (!s || !s.id || !s.flowId) {
            sendResponse({ success: false, error: 'invalid schedule' });
            return true;
          }
          saveSchedule(s)
            .then(async () => {
              await rescheduleAlarms();
              sendResponse({ success: true });
            })
            .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
          return true;
        }
        case BACKGROUND_MESSAGE_TYPES.RR_UNSCHEDULE_FLOW: {
          const scheduleId = String(message.scheduleId || '');
          if (!scheduleId) {
            sendResponse({ success: false, error: 'invalid scheduleId' });
            return true;
          }
          removeSchedule(scheduleId)
            .then(async () => {
              await rescheduleAlarms();
              sendResponse({ success: true });
            })
            .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
          return true;
        }
      }
    } catch (err) {
      sendResponse({ success: false, error: (err as any)?.message || String(err) });
    }
    return false;
  });
  // 监听 tab 更新，若点击后短时间发生导航则为该点击自动加上 after.waitForNavigation
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    try {
      if (!currentRecording || tabId !== currentRecording.tabId) return;
      if (!currentRecording.flow) return;
      const urlChanged = typeof changeInfo.url === 'string';
      const isLoading = changeInfo.status === 'loading';
      if (!urlChanged && !isLoading) return;
      if (lastClickIdx == null) return;
      const now = Date.now();
      if (now - lastClickTime > 5000) return; // 仅在最近5秒内的点击认为相关
      if (now - lastNavTaggedAt < 500) return; // 去抖
      const steps = currentRecording.flow.steps;
      if (!Array.isArray(steps) || !steps[lastClickIdx]) return;
      const st: any = steps[lastClickIdx];
      if (!st.after) st.after = {};
      if (!st.after.waitForNavigation) {
        st.after.waitForNavigation = true;
        lastNavTaggedAt = now;
      }
    } catch {
      // ignore
    }
  });

  // 全局录制：监听激活的标签页变化，追加“导航/切换”步骤，并确保在新标签页继续录制
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      if (!currentRecording) return;
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (!tab) return;
      // 确保该标签页注入并继续录制（不重置流）
      try {
        await ensureRecorderInjected(activeInfo.tabId);
        await chrome.tabs.sendMessage(activeInfo.tabId, {
          action: TOOL_MESSAGE_TYPES.RR_RECORDER_CONTROL,
          cmd: 'resume',
        } as any);
      } catch {
        /* ignore */
      }
      if (!currentRecording.flow) return;
      const url = typeof tab.url === 'string' ? tab.url : '';
      if (url) {
        currentRecording.flow.steps.push({
          id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'navigate',
          url,
        } as any);
        currentRecording.flow.meta = {
          ...(currentRecording.flow.meta || ({} as any)),
          updatedAt: new Date().toISOString(),
        } as any;
      }
    } catch {
      // ignore
    }
  });

  // 全局录制：监听顶级导航提交（含显式地址栏输入/刷新），在非链接点击触发时追加“导航”步骤
  chrome.webNavigation.onCommitted.addListener(async (details) => {
    try {
      if (!currentRecording) return;
      if (details.frameId !== 0) return; // 仅记录顶级 frame
      const tabId = details.tabId;
      // 对于点击触发的 link 导航，不追加 navigate（已有点击+waitForNavigation 富化）
      const t = details.transitionType as string | undefined;
      const isLink = t === 'link';
      if (isLink) {
        // 同时确保继续录制
        try {
          await ensureRecorderInjected(tabId);
          await chrome.tabs.sendMessage(tabId, {
            action: TOOL_MESSAGE_TYPES.RR_RECORDER_CONTROL,
            cmd: 'resume',
          } as any);
        } catch {
          /* ignore */
        }
        return;
      }
      // 显式导航/刷新/地址栏输入等
      const shouldRecord =
        t === 'reload' ||
        t === 'typed' ||
        t === 'generated' ||
        t === 'auto_bookmark' ||
        t === 'keyword';
      if (!shouldRecord) {
        // 仍确保脚本在该页活跃，用于持续录制
        try {
          await ensureRecorderInjected(tabId);
          await chrome.tabs.sendMessage(tabId, {
            action: TOOL_MESSAGE_TYPES.RR_RECORDER_CONTROL,
            cmd: 'resume',
          } as any);
        } catch {
          /* ignore */
        }
        return;
      }
      const tab = await chrome.tabs.get(tabId);
      const url = typeof tab.url === 'string' ? tab.url : details.url;
      if (!url || !currentRecording.flow) return;
      currentRecording.flow.steps.push({
        id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'navigate',
        url,
      } as any);
      currentRecording.flow.meta = {
        ...(currentRecording.flow.meta || ({} as any)),
        updatedAt: new Date().toISOString(),
      } as any;
      // 确保继续录制
      try {
        await ensureRecorderInjected(tabId);
        await chrome.tabs.sendMessage(tabId, {
          action: TOOL_MESSAGE_TYPES.RR_RECORDER_CONTROL,
          cmd: 'resume',
        } as any);
      } catch {
        /* ignore */
      }
    } catch {
      // ignore
    }
  });
}

// Alarm listener executes scheduled flows
chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    if (!alarm?.name || !alarm.name.startsWith('rr_schedule_')) return;
    const id = alarm.name.slice('rr_schedule_'.length);
    const schedules = await listSchedules();
    const s = schedules.find((x) => x.id === id && x.enabled);
    if (!s) return;
    const flow = await getFlow(s.flowId);
    if (!flow) return;
    await runFlow(flow, { args: s.args || {}, returnLogs: false });
  } catch (e) {
    // swallow to not spam logs
  }
});
