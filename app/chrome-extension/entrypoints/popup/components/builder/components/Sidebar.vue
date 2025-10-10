<template>
  <aside class="sidebar">
    <div class="palette">
      <div class="palette-title">节点库</div>
      <div class="palette-list">
        <button v-for="t in paletteTypes" :key="t" class="node-btn" @click="$emit('addNode', t)">
          {{ t }}
        </button>
      </div>
    </div>
    <div class="meta">
      <div class="row">
        <label>名称</label>
        <input v-model="flow.name" />
      </div>
      <div class="row">
        <label>描述</label>
        <input v-model="flow.description" />
      </div>
    </div>
  </aside>
</template>

<script lang="ts" setup>
import type { Flow as FlowV2, NodeBase } from '@/entrypoints/background/record-replay/types';

defineProps<{ flow: FlowV2; paletteTypes: NodeBase['type'][] }>();
defineEmits<{ (e: 'addNode', t: NodeBase['type']): void }>();
</script>

<style scoped>
.sidebar {
  border-right: 1px solid #e5e7eb;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.palette-title {
  font-weight: 600;
  margin-bottom: 6px;
}
.palette-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.node-btn {
  border: 1px dashed #d1d5db;
  background: #f9fafb;
  border-radius: 6px;
  padding: 6px 8px;
  cursor: pointer;
}
.meta .row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.meta .row > label {
  width: 72px;
  color: #374151;
}
.meta input {
  flex: 1;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 6px;
}
</style>
