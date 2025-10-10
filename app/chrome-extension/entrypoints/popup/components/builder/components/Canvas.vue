<template>
  <section class="canvas">
    <VueFlow
      v-model:nodes="vfNodes"
      v-model:edges="vfEdges"
      :min-zoom="0.2"
      :max-zoom="1.5"
      :fit-view-on-init="true"
      snap-to-grid
      :snap-grid="[15, 15]"
      @connect="onConnectInternal"
      @node-drag-stop="onNodeDragStopInternal"
    >
      <Background patternColor="#f3f4f6" :gap="20" />
      <Controls position="top-left" />
      <MiniMap :pannable="true" :zoomable="true" />

      <template #node-default="{ id, selected }">
        <div
          :class="['vf-node-card', selected ? 'selected' : '']"
          @click.stop="emit('selectNode', id)"
        >
          <div class="node-head">
            <span class="type">{{ findNodeBase(id)?.type }}</span>
            <span class="name">{{ findNodeBase(id)?.name || id }}</span>
          </div>
          <div class="node-body">{{ summarize(findNodeBase(id)) }}</div>
          <div class="node-actions">
            <button class="mini" @click.stop="emit('connectFrom', id)">连接</button>
            <button class="mini" @click.stop="emit('duplicateNode', id)">复制</button>
            <button class="mini danger" @click.stop="emit('removeNode', id)">删除</button>
          </div>
          <Handle type="target" :position="Position.Left" />
          <Handle type="source" :position="Position.Right" />
        </div>
      </template>
    </VueFlow>
  </section>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import {
  VueFlow,
  type Node as VFNode,
  type Edge as VFEdge,
  type Connection,
  Handle,
  useVueFlow,
  Position,
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { MiniMap } from '@vue-flow/minimap';
import { Controls } from '@vue-flow/controls';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';
import '@vue-flow/background/dist/style.css';

import type { NodeBase, Edge as EdgeV2 } from '@/entrypoints/background/record-replay/types';
import { summarizeNode as summarize } from '../model/transforms';

const props = defineProps<{
  nodes: NodeBase[];
  edges: EdgeV2[];
  focusNodeId?: string | null;
  fitSeq?: number;
}>();
const emit = defineEmits<{
  (e: 'selectNode', id: string): void;
  (e: 'duplicateNode', id: string): void;
  (e: 'removeNode', id: string): void;
  (e: 'connectFrom', id: string): void;
  (e: 'connect', src: string, dst: string): void;
  (e: 'nodeDragged', id: string, x: number, y: number): void;
}>();

const vfNodes = ref<VFNode[]>([]);
const vfEdges = ref<VFEdge[]>([]);
defineOptions({ name: 'BuilderCanvas' });
const { fitView, getNodes } = useVueFlow();

watch(
  () => props.nodes,
  (list) => {
    vfNodes.value = list.map((n) => ({
      id: n.id,
      position: { x: n.ui?.x || 0, y: n.ui?.y || 0 },
      type: 'default',
      data: {},
    }));
  },
  { immediate: true, deep: true },
);
watch(
  () => props.edges,
  (list) => {
    vfEdges.value = list.map((e) => ({ id: e.id, source: e.from, target: e.to }));
  },
  { immediate: true, deep: true },
);

watch(
  () => props.focusNodeId,
  (id) => {
    if (!id) return;
    const nd = getNodes.value.find((n) => n.id === id);
    if (!nd) return;
    try {
      fitView({ nodes: [nd.id], duration: 300, padding: 0.2 });
    } catch {}
  },
);

watch(
  () => props.fitSeq,
  () => {
    try {
      fitView({ duration: 300, padding: 0.2 });
    } catch {}
  },
);

function findNodeBase(id: string) {
  return props.nodes.find((n) => n.id === id) || null;
}

function onNodeDragStopInternal(evt: any) {
  const node = evt?.node as VFNode | undefined;
  if (!node) return;
  emit('nodeDragged', node.id, Math.round(node.position.x), Math.round(node.position.y));
}

function onConnectInternal(conn: Connection) {
  if (!conn.source || !conn.target) return;
  emit('connect', conn.source, conn.target);
  // 边更新由上层状态驱动，这里无需直接修改本地 vfEdges
}
</script>

<style scoped>
.canvas {
  position: relative;
  overflow: hidden;
}
.vf-node-card {
  width: 240px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.vf-node-card.selected {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}
.node-head {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 6px 8px;
  border-bottom: 1px solid #f3f4f6;
  background: #f9fafb;
  border-radius: 8px 8px 0 0;
}
.node-head .type {
  background: #eef2ff;
  color: #3730a3;
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 12px;
}
.node-head .name {
  color: #374151;
  font-size: 12px;
}
.node-body {
  padding: 8px;
  color: #6b7280;
  font-size: 12px;
  min-height: 20px;
}
.node-actions {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid #f3f4f6;
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
</style>
