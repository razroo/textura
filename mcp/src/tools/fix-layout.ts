import type { LayoutNode } from 'textura'
import { handleAnalyzeLayout } from './analyze-layout.js'
import type { LayoutIssue } from './analyze-layout.js'

export interface FixLayoutInput {
  tree: LayoutNode
  options?: {
    width?: number
    height?: number
    direction?: 'ltr' | 'rtl'
  }
  minTouchTarget?: number
}

export interface Fix {
  path: string
  issue: string
  action: string
}

export interface FixLayoutResult {
  tree: LayoutNode
  fixes: Fix[]
  issuesBefore: number
  issuesAfter: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any

function getNodeAtPath(tree: LayoutNode, path: string): LayoutNode | null {
  const parts = path.split('.')
  let current: LayoutNode = tree
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]!
    const match = part.match(/^children\[(\d+)\]$/)
    if (!match) return null
    const idx = parseInt(match[1]!)
    if (!('children' in current) || !(current as { children?: LayoutNode[] }).children) return null
    const children = (current as { children?: LayoutNode[] }).children!
    if (idx >= children.length) return null
    current = children[idx]!
  }
  return current
}

function applyFix(tree: LayoutNode, issue: LayoutIssue): Fix | null {
  const node = getNodeAtPath(tree, issue.path)
  if (!node) return null

  switch (issue.type) {
    case 'touch-target': {
      const min = (issue.details.minimum as number) ?? 44
      if ((node as AnyNode).width !== undefined && (node as AnyNode).width < min) {
        (node as AnyNode).width = min
      }
      if ((node as AnyNode).height !== undefined && (node as AnyNode).height < min) {
        (node as AnyNode).height = min
      }
      return { path: issue.path, issue: issue.message, action: `Set minimum dimensions to ${min}px` }
    }

    case 'line-height': {
      const fontSize = issue.details.fontSize as number
      if ('lineHeight' in node) {
        (node as AnyNode).lineHeight = Math.round(fontSize * 1.4)
        return { path: issue.path, issue: issue.message, action: `Set lineHeight to ${Math.round(fontSize * 1.4)}px (1.4x font size)` }
      }
      break
    }

    case 'spacing': {
      if ('gap' in node && typeof node.gap === 'number') {
        const oldGap = node.gap
        ;(node as AnyNode).gap = Math.max(8, oldGap * 2)
        return { path: issue.path, issue: issue.message, action: `Increased gap from ${oldGap}px to ${Math.max(8, oldGap * 2)}px` }
      }
      break
    }

    case 'zero-size': {
      // Can't auto-fix meaningfully — would need context
      return null
    }

    case 'text-overflow': {
      // Check if parent can flex-wrap or if text node needs flexShrink
      if ('flexShrink' in node && node.flexShrink === undefined) {
        (node as AnyNode).flexShrink = 1
        return { path: issue.path, issue: issue.message, action: 'Added flexShrink: 1 to allow text to shrink' }
      }
      break
    }

    case 'overflow': {
      // Add flexWrap to allow children to wrap instead of overflowing
      if (!('flexWrap' in node)) {
        (node as AnyNode).flexWrap = 'wrap'
        return { path: issue.path, issue: issue.message, action: 'Added flexWrap: wrap to prevent horizontal overflow' }
      }
      break
    }

    case 'overlap': {
      // Try adding flexWrap to the parent
      const parentPath = issue.path.split(' ∩ ')[0]!
      const parentPathParts = parentPath.split('.')
      parentPathParts.pop() // remove children[i]
      const parentNode = getNodeAtPath(tree, parentPathParts.join('.'))
      if (parentNode && 'children' in parentNode && !('flexWrap' in parentNode)) {
        (parentNode as AnyNode).flexWrap = 'wrap'
        return { path: parentPathParts.join('.'), issue: issue.message, action: 'Added flexWrap: wrap to parent container' }
      }
      break
    }
  }

  return null
}

export function handleFixLayout(input: FixLayoutInput): FixLayoutResult {
  // Deep clone the tree so we don't mutate the input
  const tree = JSON.parse(JSON.stringify(input.tree)) as LayoutNode

  // Analyze
  const beforeResult = handleAnalyzeLayout({
    tree,
    options: input.options,
    minTouchTarget: input.minTouchTarget,
  })
  const issuesBefore = beforeResult.issues.length

  // Apply fixes
  const fixes: Fix[] = []
  for (const issue of beforeResult.issues) {
    const fix = applyFix(tree, issue)
    if (fix) fixes.push(fix)
  }

  // Re-analyze to get remaining issues
  const afterResult = handleAnalyzeLayout({
    tree,
    options: input.options,
    minTouchTarget: input.minTouchTarget,
  })

  return {
    tree,
    fixes,
    issuesBefore,
    issuesAfter: afterResult.issues.length,
  }
}
