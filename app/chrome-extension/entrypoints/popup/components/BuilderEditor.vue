<template>
  <div v-if="visible" class="builder-modal">
    <div class="builder">
      <div class="topbar">
        <div class="left">
          <strong>编排画布</strong>
          <span class="tip">基于 VueFlow（M1：串行 DAG）</span>
        </div>
        <div class="right">
          <input
            class="search"
            v-model="search"
            placeholder="搜索节点名或选择器... 回车定位"
            @keyup.enter="focusSearch"
          />
          <button class="btn" @click="store.undo" title="撤销 (⌘/Ctrl+Z)">撤销</button>
          <button class="btn" @click="store.redo" title="重做 (⌘/Ctrl+Shift+Z)">重做</button>
          <span class="status" :data-state="saveState">{{ saveLabel }}</span>
          <span class="status" v-if="errorsCount > 0" title="存在校验错误">{{
            `错误: ${errorsCount}`
          }}</span>
          <button class="btn" @click="importFromSteps" title="从线性步骤生成图">步骤→图</button>
          <button class="btn" @click="exportToSteps" title="用当前图覆盖步骤">图→步骤</button>
          <button class="btn" @click="store.layoutAuto" title="自动排版（简单拓扑布局）"
            >自动排版</button
          >
          <button class="btn" @click="fitAll" title="自适应视图">自适应</button>
          <button class="btn" @click="exportFlow" title="导出 JSON">导出</button>
          <label class="btn import">
            导入
            <input type="file" accept="application/json" @change="onImport" />
          </label>
          <button
            class="btn"
            :disabled="!selectedId"
            @click="runFromSelected"
            title="从选中节点回放"
            >从选中回放</button
          >
          <button v-if="errorsCount > 0" class="btn" @click="toggleErrors">错误列表</button>
          <button class="btn primary" @click="save">保存</button>
          <button class="btn" @click="$emit('close')">关闭</button>
        </div>
      </div>

      <div class="main">
        <Sidebar
          :flow="store.flowLocal"
          :palette-types="store.paletteTypes"
          @add-node="store.addNode"
        />
        <Canvas
          :nodes="store.nodes"
          :edges="store.edges"
          :focus-node-id="focusNodeId"
          :fit-seq="fitSeq"
          @select-node="store.selectNode"
          @duplicate-node="store.duplicateNode"
          @remove-node="store.removeNode"
          @connect-from="store.connectFrom"
          @connect="store.onConnect"
          @node-dragged="store.setNodePosition"
        />
        <PropertyPanel :node="activeNode" :highlight-field="highlightField" />
        <div v-if="showErrors && errorsCount > 0" class="error-panel">
          <div class="err-title">校验错误（点击定位）</div>
          <div class="err-list">
            <div
              v-for="(errs, nid) in validation.nodeErrors"
              :key="nid"
              class="err-item"
              @click="focusError(String(nid), errs[0])"
            >
              <div class="nid">{{ String(nid) }}</div>
              <div class="elist">
                <div v-for="e in errs" :key="e" class="e">• {{ e }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, watch, onMounted, onUnmounted, ref } from 'vue';
import type { Flow as FlowV2 } from '@/entrypoints/background/record-replay/types';
import { useBuilderStore } from './builder/store/useBuilderStore';
import { nodesToSteps } from './builder/model/transforms';
import { validateFlow } from './builder/model/validation';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import Canvas from './builder/components/Canvas.vue';
import Sidebar from './builder/components/Sidebar.vue';
import PropertyPanel from './builder/components/PropertyPanel.vue';

const props = defineProps<{ visible: boolean; flow: FlowV2 | null }>();
const emit = defineEmits(['close', 'save']);

const store = useBuilderStore();

watch(
  () => props.flow,
  (f) => {
    if (f) store.initFromFlow(f);
  },
  { immediate: true },
);

// 由于 store.activeNodeId 是一个 Ref，这里统一取其值避免 TS 比较报错
const selectedId = computed<string | null>(() => (store.activeNodeId as any)?.value ?? null);
const activeNode = computed(() => store.nodes.find((n) => n.id === selectedId.value) || null);
const validation = computed(() => validateFlow(store.nodes));
const errorsCount = computed(() => validation.value.totalErrors);
const showErrors = ref(false);
function toggleErrors() {
  showErrors.value = !showErrors.value;
}

// 搜索与聚焦
const search = ref('');
const focusNodeId = ref<string | null>(null);
const highlightField = ref<string | null>(null);
const fitSeq = ref(0);
function focusSearch() {
  const q = search.value.trim().toLowerCase();
  if (!q) return;
  const hit = store.nodes.find(
    (n) =>
      (n.name || '').toLowerCase().includes(q) ||
      (n.config?.target?.candidates?.[0]?.value || '').toLowerCase().includes(q),
  );
  if (hit) {
    store.selectNode(hit.id);
    focusNodeId.value = hit.id;
    setTimeout(() => (focusNodeId.value = null), 300);
  }
}

function importFromSteps() {
  store.importFromSteps();
}
function exportToSteps() {
  store.flowLocal.steps = nodesToSteps(store.nodes, store.edges);
}
function save() {
  store.flowLocal.steps = nodesToSteps(store.nodes, store.edges);
  const result = JSON.parse(
    JSON.stringify({ ...store.flowLocal, nodes: store.nodes, edges: store.edges }),
  );
  emit('save', result);
}

async function runFromSelected() {
  if (!selectedId.value || !store.flowLocal?.id) return;
  try {
    await save();
    const res = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.RR_RUN_FLOW,
      flowId: store.flowLocal.id,
      options: { returnLogs: true, startNodeId: selectedId.value },
    });
    if (!(res && res.success)) console.warn('从选中节点回放失败');
  } catch (e) {
    console.error('从选中节点回放失败:', e);
  }
}

function focusNode(id: string) {
  store.selectNode(id);
  focusNodeId.value = id;
  setTimeout(() => (focusNodeId.value = null), 300);
}

function focusError(nid: string, msg: string) {
  const node = store.nodes.find((n) => n.id === nid);
  if (!node) return focusNode(nid);
  focusNode(nid);
  const t = node.type;
  let field: string | null = null;
  if (t === 'http') field = 'http.url';
  else if (t === 'extract')
    field = msg.includes('保存变量名') ? 'extract.saveAs' : 'extract.selector';
  else if (t === 'switchTab') field = 'switchTab.match';
  else if (t === 'navigate') field = 'navigate.url';
  else if (t === 'fill') field = msg.includes('输入值') ? 'fill.value' : 'target.candidates';
  else if (t === 'click' || t === 'dblclick') field = 'target.candidates';
  else if (t === 'script') field = msg.includes('缺少代码') ? 'script.code' : 'script.assign';
  else field = null;
  highlightField.value = field;
  setTimeout(() => (highlightField.value = null), 1500);
}

function fitAll() {
  fitSeq.value++;
}

async function exportFlow() {
  try {
    await save();
    const res = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.RR_EXPORT_FLOW,
      flowId: store.flowLocal.id,
    });
    if (res && res.success) {
      const blob = new Blob([res.json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      await chrome.downloads.download({
        url,
        filename: `${store.flowLocal.name || 'flow'}.json`,
        saveAs: true,
      } as any);
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    console.error('导出失败:', e);
  }
}

async function onImport(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const txt = await file.text();
    const res = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.RR_IMPORT_FLOW,
      json: txt,
    });
    if (res && res.success) {
      if (Array.isArray(res.flows) && res.flows.length) {
        store.initFromFlow(res.flows[0]);
      }
    }
  } catch (err) {
    console.error('导入失败:', err);
  } finally {
    input.value = '';
  }
}

// 快捷键：Delete/Backspace 删除选中，Cmd/Ctrl+D 复制，Cmd/Ctrl+S 保存
function onKey(e: KeyboardEvent) {
  const id = selectedId.value;
  const isMeta = e.metaKey || e.ctrlKey;
  if ((e.key === 'Delete' || e.key === 'Backspace') && id) {
    e.preventDefault();
    store.removeNode(id);
  } else if (isMeta && e.key.toLowerCase?.() === 'd') {
    if (id) {
      e.preventDefault();
      store.duplicateNode(id);
    }
  } else if (isMeta && e.key.toLowerCase?.() === 'z') {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
  } else if (isMeta && e.key.toLowerCase?.() === 's') {
    e.preventDefault();
    save();
  }
}
onMounted(() => document.addEventListener('keydown', onKey));
onUnmounted(() => document.removeEventListener('keydown', onKey));

// 自动保存（去抖）
const saveState = ref<'idle' | 'saving' | 'saved'>('idle');
const saveLabel = computed(() =>
  saveState.value === 'saving' ? '保存中…' : saveState.value === 'saved' ? '已保存' : '',
);
let saveTimer: any = null;
let statusTimer: any = null;
function scheduleAutoSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      saveState.value = 'saving';
      await new Promise((r) => setTimeout(r, 0));
      save();
      saveState.value = 'saved';
      if (statusTimer) clearTimeout(statusTimer);
      statusTimer = setTimeout(() => (saveState.value = 'idle'), 1200);
    } catch {
      saveState.value = 'idle';
    }
  }, 800);
}
watch(
  () => [store.nodes, store.edges, store.flowLocal.name, (store.flowLocal as any).description],
  scheduleAutoSave,
  { deep: true },
);
</script>

<style scoped>
.builder-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 2147483646;
  display: flex;
  align-items: center;
  justify-content: center;
}
.builder {
  width: 96vw;
  height: 90vh;
  background: #fff;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.topbar {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid #e5e7eb;
}
.topbar .left {
  display: flex;
  gap: 8px;
  align-items: center;
}
.topbar .tip {
  color: #6b7280;
  font-size: 12px;
}
.topbar .right {
  display: flex;
  gap: 8px;
  align-items: center;
}
.btn {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
}
.btn.primary {
  background: #111;
  color: #fff;
  border-color: #111;
}

.main {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr 360px;
}
.topbar .search {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 6px 10px;
  margin-right: 8px;
  min-width: 240px;
}
.topbar .status {
  color: #6b7280;
  font-size: 12px;
  margin-right: 8px;
  min-width: 48px;
  display: inline-block;
}
.error-panel {
  position: absolute;
  right: 12px;
  top: 56px;
  width: 420px;
  max-height: 50vh;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  padding: 10px;
  overflow: auto;
}
.err-title {
  font-weight: 600;
  margin-bottom: 6px;
}
.err-item {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 6px;
  padding: 6px;
  border: 1px solid #f3f4f6;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 6px;
}
.err-item:hover {
  background: #f9fafb;
}
.err-item .nid {
  font-size: 12px;
  color: #374151;
}
.err-item .e {
  font-size: 12px;
  color: #ef4444;
}
.btn.import {
  position: relative;
  overflow: hidden;
}
.btn.import input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
</style>
