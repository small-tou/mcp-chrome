<template>
  <div v-if="visible" class="rr-modal">
    <div class="rr-dialog">
      <div class="rr-header">
        <div class="title">编辑录制流</div>
        <button class="close" @click="$emit('close')">✕</button>
      </div>
      <div class="rr-body">
        <div class="row">
          <label>名称</label>
          <input v-model="local.name" />
        </div>
        <div class="row">
          <label>描述</label>
          <input v-model="local.description" />
        </div>

        <div class="section">
          <div class="section-title">绑定</div>
          <div class="bindings">
            <div class="binding-row" v-for="(b, i) in local.meta.bindings" :key="i">
              <select v-model="b.type">
                <option value="domain">domain</option>
                <option value="path">path</option>
                <option value="url">url</option>
              </select>
              <input
                v-model="b.value"
                placeholder="例如 example.com 或 /login 或 https://example.com/login"
              />
              <button class="small danger" @click="local.meta.bindings.splice(i, 1)">删除</button>
            </div>
            <button class="small" @click="local.meta.bindings.push({ type: 'domain', value: '' })"
              >添加绑定</button
            >
          </div>
        </div>

        <div class="section">
          <div class="section-title">变量</div>
          <div class="vars">
            <div class="var-row" v-for="(v, i) in local.variables" :key="v.key + i">
              <input v-model="v.key" placeholder="key" class="narrow" />
              <input v-model="v.label" placeholder="标签" class="narrow" />
              <label class="chk"><input type="checkbox" v-model="v.sensitive" />敏感</label>
              <input v-model="v.default" placeholder="默认值" />
              <button class="small danger" @click="local.variables.splice(i, 1)">删除</button>
            </div>
            <button
              class="small"
              @click="local.variables.push({ key: '', label: '', sensitive: false, default: '' })"
              >添加变量</button
            >
          </div>
        </div>

        <div class="section">
          <div class="section-title">步骤</div>
          <div class="steps">
            <div class="step" v-for="(s, i) in local.steps" :key="s.id">
              <div class="step-head">
                <div class="meta">
                  <span class="badge">{{ s.type }}</span>
                  <span class="id">{{ s.id }}</span>
                </div>
                <div class="actions">
                  <button class="small" @click="moveStep(i, -1)" :disabled="i === 0">上移</button>
                  <button
                    class="small"
                    @click="moveStep(i, 1)"
                    :disabled="i === local.steps.length - 1"
                    >下移</button
                  >
                  <button class="small danger" @click="removeStep(i)">删除</button>
                </div>
              </div>
              <div class="step-body">
                <div class="row">
                  <label>超时(ms)</label>
                  <input type="number" v-model.number="s.timeoutMs" />
                </div>
                <div
                  class="row"
                  v-if="s.type === 'click' || s.type === 'dblclick' || s.type === 'fill'"
                >
                  <label>选择器候选（顺序即优先级）</label>
                  <div class="cands">
                    <div class="cand" v-for="(c, j) in s.target.candidates" :key="j">
                      <select v-model="c.type">
                        <option value="css">css</option>
                        <option value="attr">attr</option>
                        <option value="aria">aria</option>
                        <option value="text">text</option>
                        <option value="xpath">xpath</option>
                      </select>
                      <input v-model="c.value" placeholder="选择器或表达式" />
                      <button
                        class="small"
                        @click="swapCand(s.target.candidates, j, j - 1)"
                        :disabled="j === 0"
                        >↑</button
                      >
                      <button
                        class="small"
                        @click="swapCand(s.target.candidates, j, j + 1)"
                        :disabled="j === s.target.candidates.length - 1"
                        >↓</button
                      >
                      <button class="small danger" @click="s.target.candidates.splice(j, 1)"
                        >删</button
                      >
                    </div>
                    <button
                      class="small"
                      @click="s.target.candidates.push({ type: 'css', value: '' })"
                      >添加候选</button
                    >
                  </div>
                </div>
                <div class="row" v-if="s.type === 'fill'">
                  <label>输入值</label>
                  <input v-model="s.value" placeholder="支持 {var} 格式" />
                </div>
                <div class="row" v-if="s.type === 'click' || s.type === 'dblclick'">
                  <label>点击后等待导航</label>
                  <label class="chk"
                    ><input
                      type="checkbox"
                      v-model="(s as any).after.waitForNavigation"
                    />启用</label
                  >
                </div>
                <div class="row" v-if="s.type === 'wait'">
                  <label>等待条件(JSON)</label>
                  <textarea v-model="jsonCondition[i]"></textarea>
                </div>
                <div class="row" v-if="s.type === 'assert'">
                  <label>断言(JSON)</label>
                  <textarea v-model="jsonAssert[i]"></textarea>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="rr-footer">
        <button class="primary" @click="save">保存</button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { reactive, watch, computed } from 'vue';

const props = defineProps<{ visible: boolean; flow: any | null }>();
const emit = defineEmits(['close', 'save']);

const local = reactive<any>({
  id: '',
  name: '',
  description: '',
  version: 1,
  meta: { bindings: [] },
  variables: [],
  steps: [],
});
const jsonCondition = reactive<string[]>([]);
const jsonAssert = reactive<string[]>([]);

watch(
  () => props.flow,
  (f) => {
    if (!f) return;
    const clone = JSON.parse(JSON.stringify(f));
    Object.assign(local, clone);
    if (!local.meta) local.meta = {};
    if (!Array.isArray(local.meta.bindings)) local.meta.bindings = [];
    jsonCondition.length = 0;
    jsonAssert.length = 0;
    for (const s of local.steps) {
      jsonCondition.push(s.type === 'wait' ? JSON.stringify(s.condition || {}, null, 2) : '');
      jsonAssert.push(s.type === 'assert' ? JSON.stringify(s.assert || {}, null, 2) : '');
      if ((s.type === 'click' || s.type === 'dblclick' || s.type === 'fill') && !s.target)
        s.target = { candidates: [] };
      if ((s.type === 'click' || s.type === 'dblclick') && !s.after) (s as any).after = {};
    }
  },
  { immediate: true },
);

function swapCand(arr: any[], i: number, j: number) {
  if (j < 0 || j >= arr.length) return;
  const t = arr[i];
  arr[i] = arr[j];
  arr[j] = t;
}
function moveStep(i: number, delta: number) {
  const j = i + delta;
  if (j < 0 || j >= local.steps.length) return;
  const t = local.steps[i];
  local.steps[i] = local.steps[j];
  local.steps[j] = t;
}
function removeStep(i: number) {
  local.steps.splice(i, 1);
}

function save() {
  // parse json fields
  for (let i = 0; i < local.steps.length; i++) {
    const s = local.steps[i];
    if (s.type === 'wait' && jsonCondition[i]) {
      try {
        s.condition = JSON.parse(jsonCondition[i]);
      } catch {}
    }
    if (s.type === 'assert' && jsonAssert[i]) {
      try {
        s.assert = JSON.parse(jsonAssert[i]);
      } catch {}
    }
  }
  emit('save', JSON.parse(JSON.stringify(local)));
}
</script>

<style scoped>
.rr-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 2147483646;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rr-dialog {
  background: #fff;
  border-radius: 8px;
  max-width: 960px;
  width: 96vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.rr-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
}
.rr-header .title {
  font-weight: 600;
}
.rr-header .close {
  border: none;
  background: #f3f4f6;
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
}
.rr-body {
  padding: 12px 16px;
  overflow: auto;
}
.row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 6px 0;
}
.row > label {
  width: 120px;
  color: #374151;
}
.row > input,
.row > textarea,
.row > select {
  flex: 1;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 6px 8px;
}
.row > textarea {
  min-height: 64px;
}
.chk {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.section {
  margin: 12px 0;
}
.section-title {
  font-weight: 600;
  margin-bottom: 6px;
}
.vars .var-row input.narrow {
  width: 160px;
}
.steps .step {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 10px;
}
.steps .step-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}
.steps .step-head .badge {
  background: #eef2ff;
  color: #3730a3;
  padding: 2px 6px;
  border-radius: 6px;
  margin-right: 8px;
}
.steps .step-head .id {
  color: #6b7280;
  font-size: 12px;
}
.steps .step-body {
  padding: 8px 10px;
}
.small {
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
}
.danger {
  background: #fee2e2;
  border-color: #fecaca;
}
.primary {
  background: #111;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
}
.rr-footer {
  padding: 12px 16px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
}
.cands .cand {
  display: flex;
  gap: 6px;
  align-items: center;
  margin: 4px 0;
}
</style>
