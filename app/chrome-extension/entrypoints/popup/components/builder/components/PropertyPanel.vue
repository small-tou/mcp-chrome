<template>
  <aside class="panel">
    <div v-if="node">
      <div class="panel-title">属性面板</div>
      <div class="row">
        <label>节点名</label>
        <input v-model="node.name" />
      </div>
      <div class="row">
        <label>禁用</label>
        <input type="checkbox" v-model="node.disabled" />
      </div>
      <hr />

      <template v-if="node.type === 'click' || node.type === 'fill'">
        <div class="sub-title">选择器候选（按优先级）</div>
        <div class="cands" data-field="target.candidates">
          <div class="cand" v-for="(c, i) in node.config.target.candidates" :key="i">
            <select v-model="c.type">
              <option value="css">css</option>
              <option value="attr">attr</option>
              <option value="aria">aria</option>
              <option value="text">text</option>
              <option value="xpath">xpath</option>
            </select>
            <input v-model="c.value" />
            <button
              class="mini"
              @click="swapCand(node.config.target.candidates, i, i - 1)"
              :disabled="i === 0"
              >↑</button
            >
            <button
              class="mini"
              @click="swapCand(node.config.target.candidates, i, i + 1)"
              :disabled="i === node.config.target.candidates.length - 1"
              >↓</button
            >
            <button class="mini danger" @click="node.config.target.candidates.splice(i, 1)"
              >删</button
            >
          </div>
          <button
            class="mini"
            @click="node.config.target.candidates.push({ type: 'css', value: '' })"
            >添加候选</button
          >
        </div>
      </template>

      <template v-if="node.type === 'fill'">
        <div class="row" data-field="fill.value">
          <label>输入值</label>
          <input v-model="node.config.value" placeholder="支持 {var} 格式" />
        </div>
      </template>

      <template v-if="node.type === 'key'">
        <div class="row">
          <label>按键序列</label>
          <input v-model="node.config.keys" placeholder="例如: Backspace Enter 或 cmd+a" />
        </div>
      </template>

      <template v-if="node.type === 'delay'">
        <div class="row">
          <label>延迟(ms)</label>
          <input type="number" v-model.number="node.config.ms" min="0" />
        </div>
      </template>

      <template v-if="node.type === 'http'">
        <div class="row">
          <label>Method</label>
          <select v-model="node.config.method">
            <option>GET</option>
            <option>POST</option>
            <option>PUT</option>
            <option>PATCH</option>
            <option>DELETE</option>
          </select>
        </div>
        <div class="row" :class="{ invalid: !node.config.url }" data-field="http.url">
          <label>URL</label>
          <input v-model="node.config.url" />
        </div>
        <div class="row">
          <label>Headers(JSON)</label>
          <textarea v-model="headersJson"></textarea>
        </div>
        <div class="row">
          <label>Body(JSON)</label>
          <textarea v-model="bodyJson"></textarea>
        </div>
        <div class="row" data-field="http.saveAs">
          <label>保存为</label>
          <input v-model="node.config.saveAs" placeholder="变量名" />
        </div>
        <div class="section" data-field="http.assign">
          <div class="sub-title">映射结果字段到变量</div>
          <KeyValueEditor v-model="node.config.assign" />
        </div>
      </template>

      <template v-if="node.type === 'extract'">
        <div class="row" data-field="extract.selector">
          <label>选择器</label>
          <input v-model="node.config.selector" placeholder="CSS 选择器" />
        </div>
        <div class="row">
          <label>属性/文本</label>
          <input v-model="node.config.attr" placeholder="attr 名称 或 text/textContent" />
        </div>
        <div class="row">
          <label>自定义JS</label>
          <textarea v-model="node.config.js" placeholder="返回提取值的 JS 代码" rows="4"></textarea>
        </div>
        <div class="row" :class="{ invalid: !node.config.saveAs }" data-field="extract.saveAs">
          <label>保存为</label>
          <input v-model="node.config.saveAs" placeholder="变量名" />
        </div>
        <div v-if="extractErrors.length" class="errors">
          <div v-for="e in extractErrors" :key="e" class="error">⚠️ {{ e }}</div>
        </div>
      </template>

      <template v-if="node.type === 'openTab'">
        <div class="row" data-field="openTab.url">
          <label>URL</label>
          <input v-model="node.config.url" />
        </div>
        <div class="row">
          <label class="chk"><input type="checkbox" v-model="node.config.newWindow" />新窗口</label>
        </div>
      </template>

      <template v-if="node.type === 'switchTab'">
        <div class="row">
          <label>TabId</label>
          <input type="number" v-model.number="node.config.tabId" />
        </div>
        <div class="row">
          <label>URL包含</label>
          <input v-model="node.config.urlContains" />
        </div>
        <div class="row">
          <label>标题包含</label>
          <input v-model="node.config.titleContains" />
        </div>
        <div v-if="switchTabError" class="errors"
          ><div class="error">⚠️ 需填写 tabId 或 URL/标题包含</div></div
        >
      </template>

      <template v-if="node.type === 'closeTab'">
        <div class="row">
          <label>URL</label>
          <input v-model="node.config.url" placeholder="可留空以关闭当前标签页" />
        </div>
      </template>

      <template v-if="node.type === 'wait'">
        <div class="sub-title">等待条件</div>
        <div class="row">
          <label>JSON</label>
          <textarea v-model="waitJson" rows="5"></textarea>
        </div>
      </template>

      <template v-if="node.type === 'assert'">
        <div class="sub-title">断言</div>
        <div class="row">
          <label>JSON</label>
          <textarea v-model="assertJson" rows="5"></textarea>
        </div>
      </template>

      <template v-if="node.type === 'navigate'">
        <div class="row" data-field="navigate.url">
          <label>URL</label>
          <input v-model="node.config.url" />
        </div>
      </template>

      <template v-if="node.type === 'script'">
        <div class="row">
          <label>world</label>
          <select v-model="node.config.world">
            <option value="ISOLATED">ISOLATED</option>
            <option value="MAIN">MAIN</option>
          </select>
        </div>
        <div class="row" data-field="script.code">
          <label>代码</label>
          <textarea v-model="node.config.code" rows="6"></textarea>
        </div>
        <div class="row" data-field="script.saveAs">
          <label>保存为</label>
          <input v-model="node.config.saveAs" placeholder="变量名" />
        </div>
        <div class="row" data-field="script.assign">
          <label>映射(JSON)</label>
          <textarea
            v-model="scriptAssignJson"
            rows="4"
            placeholder='{"var":"path.in.result"}'
          ></textarea>
        </div>
      </template>
    </div>
    <div v-else class="empty">选择一个节点以编辑属性</div>
    <div v-if="node" class="errors" style="margin-top: 8px">
      <div v-for="e in nodeErrors" :key="e" class="error">⚠️ {{ e }}</div>
    </div>
  </aside>
</template>

<script lang="ts" setup>
import { computed, watch } from 'vue';
import type { NodeBase } from '@/entrypoints/background/record-replay/types';
import { validateNode } from '../model/validation';
import KeyValueEditor from './KeyValueEditor.vue';

const props = defineProps<{ node: NodeBase | null; highlightField?: string | null }>();

const waitJson = computed({
  get() {
    const n = props.node;
    if (!n || n.type !== 'wait') return '';
    try {
      return JSON.stringify(n.config?.condition || {}, null, 2);
    } catch {
      return '';
    }
  },
  set(v: string) {
    const n = props.node;
    if (!n || n.type !== 'wait') return;
    try {
      n.config = { ...(n.config || {}), condition: JSON.parse(v || '{}') };
    } catch {}
  },
});

const assertJson = computed({
  get() {
    const n = props.node;
    if (!n || n.type !== 'assert') return '';
    try {
      return JSON.stringify(n.config?.assert || {}, null, 2);
    } catch {
      return '';
    }
  },
  set(v: string) {
    const n = props.node;
    if (!n || n.type !== 'assert') return;
    try {
      n.config = { ...(n.config || {}), assert: JSON.parse(v || '{}') };
    } catch {}
  },
});

const nodeErrors = computed(() => (props.node ? validateNode(props.node) : []));
const extractErrors = computed(() => {
  const n = props.node;
  if (!n || n.type !== 'extract') return [] as string[];
  const errs: string[] = [];
  if (!n.config?.saveAs) errs.push('需填写保存变量名');
  if (!n.config?.selector && !n.config?.js) errs.push('需提供 selector 或 js');
  return errs;
});
const switchTabError = computed(() => {
  const n = props.node;
  if (!n || n.type !== 'switchTab') return false;
  return !(n.config?.tabId || n.config?.urlContains || n.config?.titleContains);
});

function swapCand(arr: any[], i: number, j: number) {
  if (j < 0 || j >= arr.length) return;
  const t = arr[i];
  arr[i] = arr[j];
  arr[j] = t;
}

// http json helpers
const headersJson = computed({
  get() {
    const n = props.node;
    if (!n || n.type !== 'http') return '';
    try {
      return JSON.stringify(n.config?.headers || {}, null, 2);
    } catch {
      return '';
    }
  },
  set(v: string) {
    const n = props.node;
    if (!n || n.type !== 'http') return;
    try {
      n.config.headers = JSON.parse(v || '{}');
    } catch {}
  },
});
const bodyJson = computed({
  get() {
    const n = props.node;
    if (!n || n.type !== 'http') return '';
    try {
      return JSON.stringify(n.config?.body ?? null, null, 2);
    } catch {
      return '';
    }
  },
  set(v: string) {
    const n = props.node;
    if (!n || n.type !== 'http') return;
    try {
      n.config.body = v ? JSON.parse(v) : null;
    } catch {}
  },
});

// script assign json helper
const scriptAssignJson = computed({
  get() {
    const n = props.node;
    if (!n || n.type !== 'script') return '';
    try {
      return JSON.stringify(n.config?.assign || {}, null, 2);
    } catch {
      return '';
    }
  },
  set(v: string) {
    const n = props.node;
    if (!n || n.type !== 'script') return;
    try {
      n.config.assign = JSON.parse(v || '{}');
    } catch {}
  },
});
// 高亮并滚动到指定字段
watch(
  () => props.highlightField,
  (field) => {
    if (!field) return;
    try {
      const root = (document?.querySelector?.('.panel') as HTMLElement) || null;
      const esc =
        (globalThis as any).CSS && typeof (globalThis as any).CSS.escape === 'function'
          ? (globalThis as any).CSS.escape(field)
          : String(field).replace(/["\\]/g, '\\$&');
      const el = (root || document).querySelector(`[data-field="${esc}"]`) as HTMLElement | null;
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (el) {
        el.classList.add('hl');
        setTimeout(() => el.classList.remove('hl'), 1200);
      }
    } catch {}
  },
);
</script>

<style scoped>
.panel {
  border-left: 1px solid #e5e7eb;
  padding: 10px;
  overflow: auto;
}
.panel-title {
  font-weight: 600;
  margin-bottom: 8px;
}
.sub-title {
  font-weight: 600;
  margin: 6px 0;
}
.row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 6px 0;
}
.row > label {
  width: 72px;
  color: #374151;
}
.row > input,
.row > textarea,
.row > select {
  flex: 1;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 6px;
}
.row.invalid > input,
.row.invalid > textarea,
.row.invalid > select {
  border-color: #ef4444;
  background: #fef2f2;
}
.cands {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cand {
  display: grid;
  grid-template-columns: 120px 1fr auto auto auto;
  gap: 6px;
  align-items: center;
}
.mini {
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
}
.mini.danger {
  background: #fee2e2;
  border-color: #fecaca;
}
.empty {
  color: #6b7280;
  padding: 12px;
}
.errors {
  color: #ef4444;
  font-size: 12px;
}
.errors .error {
  margin: 2px 0;
}
.panel :where([data-field].hl) {
  outline: 2px solid #f59e0b;
  background: #fffbeb;
  transition: outline-color 0.3s ease;
}
</style>
