import { computeLayout } from 'textura'
import type { LayoutNode, ComputedLayout } from 'textura'

export interface LayoutIssue {
  severity: 'error' | 'warning'
  type: 'text-overflow' | 'touch-target' | 'overlap' | 'zero-size' | 'line-height' | 'spacing' | 'overflow'
  path: string
  message: string
  details: Record<string, unknown>
}

export interface AnalyzeLayoutInput {
  tree: LayoutNode
  options?: {
    width?: number
    height?: number
    direction?: 'ltr' | 'rtl'
  }
  checks?: string[]
  minTouchTarget?: number
}

export interface AnalyzeLayoutResult {
  layout: ComputedLayout
  issues: LayoutIssue[]
  nodeCount: number
  totalHeight: number
}

function countNodes(layout: ComputedLayout): number {
  let n = 1
  for (const c of layout.children) n += countNodes(c)
  return n
}

function detectIssues(
  layout: ComputedLayout,
  tree: LayoutNode,
  path: string,
  parentBounds: { x: number; y: number; w: number; h: number } | null,
  issues: LayoutIssue[],
  minTouch: number,
): void {
  const x = layout.x
  const y = layout.y
  const w = layout.width
  const h = layout.height

  // Zero-size node
  if (w === 0 && h === 0 && layout.children.length === 0 && layout.text === undefined) {
    issues.push({
      severity: 'warning',
      type: 'zero-size',
      path,
      message: `Node at ${path} has 0x0 dimensions`,
      details: { width: w, height: h },
    })
  }

  // Text overflow: text node where lineCount > 1 and height might be clipped
  // We detect this by checking if a text node's parent constrains it
  if (layout.text !== undefined && parentBounds) {
    const absY = parentBounds.y + y
    const absBottom = absY + h
    const parentBottom = parentBounds.y + parentBounds.h
    if (absBottom > parentBottom + 2) {
      issues.push({
        severity: 'error',
        type: 'text-overflow',
        path,
        message: `Text overflows parent by ${Math.round(absBottom - parentBottom)}px at ${path}`,
        details: { text: layout.text.slice(0, 60), overflow: Math.round(absBottom - parentBottom) },
      })
    }
  }

  // Touch target check: leaf elements (with or without text) with small dimensions
  if (layout.children.length === 0 && w > 0 && h > 0) {
    if (w < minTouch || h < minTouch) {
      issues.push({
        severity: 'warning',
        type: 'touch-target',
        path,
        message: `Element at ${path} is ${Math.round(w)}x${Math.round(h)}px — below ${minTouch}px minimum touch target`,
        details: { width: Math.round(w), height: Math.round(h), minimum: minTouch },
      })
    }
  }

  // Line height check on text nodes
  if (layout.text !== undefined && 'lineHeight' in tree && 'font' in tree) {
    const fontMatch = (tree as { font: string }).font.match(/(\d+)px/)
    if (fontMatch) {
      const fontSize = parseInt(fontMatch[1]!)
      const lineHeight = (tree as { lineHeight: number }).lineHeight
      if (lineHeight <= fontSize * 1.1) {
        issues.push({
          severity: 'warning',
          type: 'line-height',
          path,
          message: `Text at ${path} has lineHeight ${lineHeight}px for ${fontSize}px font (ratio ${(lineHeight / fontSize).toFixed(2)} — recommended ≥1.2)`,
          details: { fontSize, lineHeight, ratio: +(lineHeight / fontSize).toFixed(2) },
        })
      }
    }
  }

  // Overlap detection: check if sibling children overlap
  for (let i = 0; i < layout.children.length; i++) {
    for (let j = i + 1; j < layout.children.length; j++) {
      const a = layout.children[i]!
      const b = layout.children[j]!
      const ax1 = a.x, ay1 = a.y, ax2 = a.x + a.width, ay2 = a.y + a.height
      const bx1 = b.x, by1 = b.y, bx2 = b.x + b.width, by2 = b.y + b.height
      if (ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1) {
        const overlapW = Math.min(ax2, bx2) - Math.max(ax1, bx1)
        const overlapH = Math.min(ay2, by2) - Math.max(ay1, by1)
        if (overlapW > 2 && overlapH > 2) {
          issues.push({
            severity: 'error',
            type: 'overlap',
            path: `${path}.children[${i}] ∩ ${path}.children[${j}]`,
            message: `Children ${i} and ${j} overlap by ${Math.round(overlapW)}x${Math.round(overlapH)}px at ${path}`,
            details: { childA: i, childB: j, overlapWidth: Math.round(overlapW), overlapHeight: Math.round(overlapH) },
          })
        }
      }
    }
  }

  // Spacing check: gap too tight between children
  if ('gap' in tree && typeof tree.gap === 'number' && tree.gap <= 4 && layout.children.length > 1) {
    issues.push({
      severity: 'warning',
      type: 'spacing',
      path,
      message: `Container at ${path} has gap ${tree.gap}px — may be too tight for readability`,
      details: { gap: tree.gap, childCount: layout.children.length },
    })
  }

  // Horizontal overflow: row children exceed parent width
  if (layout.children.length > 1) {
    const lastChild = layout.children[layout.children.length - 1]!
    const childrenEnd = lastChild.x + lastChild.width
    if (childrenEnd > w + 2) {
      issues.push({
        severity: 'error',
        type: 'overflow',
        path,
        message: `Children overflow ${path} horizontally by ${Math.round(childrenEnd - w)}px (${layout.children.length} children need ${Math.round(childrenEnd)}px, container is ${Math.round(w)}px)`,
        details: { childrenWidth: Math.round(childrenEnd), containerWidth: Math.round(w), overflow: Math.round(childrenEnd - w) },
      })
    }
  }

  // Recurse
  const bounds = { x: (parentBounds?.x ?? 0) + x, y: (parentBounds?.y ?? 0) + y, w, h }
  const children = ('children' in tree && !('text' in tree)) ? (tree as { children?: LayoutNode[] }).children ?? [] : []
  for (let i = 0; i < layout.children.length; i++) {
    const childTree = children[i]
    if (childTree) {
      detectIssues(layout.children[i]!, childTree, `${path}.children[${i}]`, bounds, issues, minTouch)
    }
  }
}

export function handleAnalyzeLayout(input: AnalyzeLayoutInput): AnalyzeLayoutResult {
  const layout = computeLayout(input.tree, input.options)
  const issues: LayoutIssue[] = []
  const minTouch = input.minTouchTarget ?? 44

  detectIssues(layout, input.tree, 'root', null, issues, minTouch)

  return {
    layout,
    issues,
    nodeCount: countNodes(layout),
    totalHeight: layout.height,
  }
}
