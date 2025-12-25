/**
 * Shared SVG Icons for Web Editor UI
 *
 * All icons are created as inline SVG elements to:
 * - Avoid external asset dependencies
 * - Support theming via `currentColor`
 * - Enable direct DOM manipulation
 *
 * Design standards:
 * - ViewBox: 20x20
 * - Stroke width: 2px
 * - Line caps/joins: round
 */

// =============================================================================
// Icon Factory Helpers
// =============================================================================

function createSvgElement(): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

function createStrokePath(d: string): SVGPathElement {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  return path;
}

// =============================================================================
// Icon Creators
// =============================================================================

/**
 * Minus icon (—) for minimize button
 */
export function createMinusIcon(): SVGElement {
  const svg = createSvgElement();
  svg.append(createStrokePath('M5 10h10'));
  return svg;
}

/**
 * Plus icon (+) for restore/expand button
 */
export function createPlusIcon(): SVGElement {
  const svg = createSvgElement();
  svg.append(createStrokePath('M10 5v10M5 10h10'));
  return svg;
}

/**
 * Close icon (×) for close button
 */
export function createCloseIcon(): SVGElement {
  const svg = createSvgElement();
  svg.append(createStrokePath('M6 6l8 8M14 6l-8 8'));
  return svg;
}

/**
 * Grip icon (6 dots) for drag handle
 */
export function createGripIcon(): SVGElement {
  const svg = createSvgElement();

  const DOT_POSITIONS: ReadonlyArray<readonly [number, number]> = [
    [7, 6],
    [13, 6],
    [7, 10],
    [13, 10],
    [7, 14],
    [13, 14],
  ];

  for (const [cx, cy] of DOT_POSITIONS) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r', '1.4');
    circle.setAttribute('fill', 'currentColor');
    svg.append(circle);
  }

  return svg;
}

/**
 * Chevron icon (▼) for collapse/expand indicator
 */
export function createChevronIcon(): SVGElement {
  const svg = createSvgElement();
  svg.classList.add('we-chevron');
  svg.append(createStrokePath('M7 8l3 3 3-3'));
  return svg;
}

/**
 * Undo icon (↶) for undo button
 */
export function createUndoIcon(): SVGElement {
  const svg = createSvgElement();
  // Arrow pointing left with curved tail
  svg.append(createStrokePath('M4 10h10a3 3 0 0 0 0-6H7M4 10l3-3M4 10l3 3'));
  return svg;
}

/**
 * Redo icon (↷) for redo button
 */
export function createRedoIcon(): SVGElement {
  const svg = createSvgElement();
  // Arrow pointing right with curved tail
  svg.append(createStrokePath('M16 10H6a3 3 0 0 1 0-6h7M16 10l-3-3M16 10l-3 3'));
  return svg;
}
