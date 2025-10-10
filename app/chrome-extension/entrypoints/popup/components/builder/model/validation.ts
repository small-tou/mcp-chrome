import type { NodeBase } from '@/entrypoints/background/record-replay/types';

export function validateNode(n: NodeBase): string[] {
  const errs: string[] = [];
  if (n.disabled) return errs; // 忽略禁用节点
  const c: any = n.config || {};

  switch (n.type) {
    case 'click':
    case 'dblclick':
    case 'fill': {
      const hasCandidate = !!c?.target?.candidates?.length;
      if (!hasCandidate) errs.push('缺少目标选择器候选');
      if (n.type === 'fill' && (!('value' in c) || c.value === undefined)) errs.push('缺少输入值');
      break;
    }
    case 'wait': {
      if (!c?.condition) errs.push('缺少等待条件');
      break;
    }
    case 'assert': {
      if (!c?.assert) errs.push('缺少断言条件');
      break;
    }
    case 'navigate': {
      if (!c?.url) errs.push('缺少 URL');
      break;
    }
    case 'http': {
      if (!c?.url) errs.push('HTTP: 缺少 URL');
      if (c?.assign && typeof c.assign === 'object') {
        const pathRe = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+|\[\d+\])*$/;
        for (const v of Object.values(c.assign)) {
          const s = String(v);
          if (!pathRe.test(s)) errs.push(`Assign: 路径非法 ${s}`);
        }
      }
      break;
    }
    case 'extract': {
      if (!c?.saveAs) errs.push('Extract: 需填写保存变量名');
      if (!c?.selector && !c?.js) errs.push('Extract: 需提供 selector 或 js');
      break;
    }
    case 'switchTab': {
      if (!c?.tabId && !c?.urlContains && !c?.titleContains)
        errs.push('SwitchTab: 需提供 tabId 或 URL/标题包含');
      break;
    }
    case 'closeTab': {
      // 允许空（关闭当前标签页），不强制
      break;
    }
    case 'script': {
      // 若配置了 saveAs/assign，应提供 code
      const hasAssign = c?.assign && Object.keys(c.assign).length > 0;
      if ((c?.saveAs || hasAssign) && !String(c?.code || '').trim())
        errs.push('Script: 配置了保存/映射但缺少代码');
      if (hasAssign) {
        const pathRe = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+|\[\d+\])*$/;
        for (const v of Object.values(c.assign || {})) {
          const s = String(v);
          if (!pathRe.test(s)) errs.push(`Assign: 路径非法 ${s}`);
        }
      }
      break;
    }
  }
  return errs;
}

export function validateFlow(nodes: NodeBase[]): {
  totalErrors: number;
  nodeErrors: Record<string, string[]>;
} {
  const nodeErrors: Record<string, string[]> = {};
  let totalErrors = 0;
  for (const n of nodes) {
    const e = validateNode(n);
    if (e.length) {
      nodeErrors[n.id] = e;
      totalErrors += e.length;
    }
  }
  return { totalErrors, nodeErrors };
}
