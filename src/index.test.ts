import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { init, destroy, computeLayout } from './index.ts'
import type { BoxNode, TextNode } from './index.ts'

beforeAll(async () => {
  await init()
})

afterAll(() => {
  destroy()
})

describe('box layout', () => {
  test('single box with fixed dimensions', () => {
    const result = computeLayout({ width: 200, height: 100 })
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
    expect(result.width).toBe(200)
    expect(result.height).toBe(100)
    expect(result.children).toEqual([])
  })

  test('column layout with two fixed children', () => {
    const tree: BoxNode = {
      width: 300,
      flexDirection: 'column',
      children: [
        { width: 300, height: 50 },
        { width: 300, height: 70 },
      ],
    }
    const result = computeLayout(tree)
    expect(result.width).toBe(300)
    expect(result.height).toBe(120)
    expect(result.children.length).toBe(2)
    expect(result.children[0]!.y).toBe(0)
    expect(result.children[0]!.height).toBe(50)
    expect(result.children[1]!.y).toBe(50)
    expect(result.children[1]!.height).toBe(70)
  })

  test('row layout with gap', () => {
    const tree: BoxNode = {
      width: 300,
      flexDirection: 'row',
      gap: 10,
      children: [
        { width: 100, height: 50 },
        { width: 100, height: 50 },
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.x).toBe(0)
    expect(result.children[1]!.x).toBe(110)
  })

  test('padding affects child position', () => {
    const tree: BoxNode = {
      width: 300,
      padding: 20,
      children: [{ width: 100, height: 50 }],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.x).toBe(20)
    expect(result.children[0]!.y).toBe(20)
    expect(result.height).toBe(90)
  })

  test('flexGrow distributes space', () => {
    const tree: BoxNode = {
      width: 300,
      flexDirection: 'row',
      children: [
        { width: 100, height: 50, flexGrow: 0 },
        { height: 50, flexGrow: 1 },
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.width).toBe(100)
    expect(result.children[1]!.width).toBe(200)
  })

  test('absolute positioning', () => {
    const tree: BoxNode = {
      width: 300,
      height: 300,
      children: [
        {
          position: 'absolute',
          top: 10,
          left: 10,
          width: 50,
          height: 50,
        },
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.x).toBe(10)
    expect(result.children[0]!.y).toBe(10)
    expect(result.children[0]!.width).toBe(50)
  })

  test('justify content space-between', () => {
    const tree: BoxNode = {
      width: 300,
      flexDirection: 'row',
      justifyContent: 'space-between',
      children: [
        { width: 50, height: 50 },
        { width: 50, height: 50 },
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.x).toBe(0)
    expect(result.children[1]!.x).toBe(250)
  })

  test('align items center', () => {
    const tree: BoxNode = {
      width: 300,
      height: 100,
      flexDirection: 'row',
      alignItems: 'center',
      children: [{ width: 50, height: 30 }],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.y).toBe(35)
  })

  test('margin creates space between siblings', () => {
    const tree: BoxNode = {
      width: 300,
      flexDirection: 'column',
      children: [
        { width: 100, height: 50 },
        { width: 100, height: 50, marginTop: 20 },
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[1]!.y).toBe(70)
    expect(result.height).toBe(120)
  })

  test('nested flex containers', () => {
    const tree: BoxNode = {
      width: 400,
      flexDirection: 'column',
      children: [
        {
          flexDirection: 'row',
          gap: 10,
          children: [
            { width: 100, height: 60 },
            { width: 100, height: 60 },
          ],
        },
        { width: 200, height: 40 },
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.height).toBe(60)
    expect(result.children[1]!.y).toBe(60)
    expect(result.height).toBe(100)
  })
})

// Text measurement tests require a canvas context (browser environment).
// These are documented here as the expected behavior but skipped in Bun.
describe('text layout (requires browser)', () => {
  test.skip('text node measures height from content', () => {
    const tree: TextNode = {
      text: 'Hello world',
      font: '16px sans-serif',
      lineHeight: 20,
      width: 400,
    }
    const result = computeLayout(tree)
    expect(result.width).toBe(400)
    expect(result.height).toBe(20)
    expect(result.text).toBe('Hello world')
    expect(result.lineCount).toBe(1)
  })

  test.skip('text wraps to multiple lines in narrow container', () => {
    const longText =
      'This is a fairly long paragraph of text that should definitely wrap to multiple lines when constrained to a narrow width.'
    const tree: TextNode = {
      text: longText,
      font: '16px sans-serif',
      lineHeight: 20,
      width: 100,
    }
    const result = computeLayout(tree)
    expect(result.lineCount!).toBeGreaterThan(1)
    expect(result.height).toBe(result.lineCount! * 20)
  })

  test.skip('text inside a flex container', () => {
    const tree: BoxNode = {
      width: 400,
      padding: 10,
      flexDirection: 'column',
      gap: 8,
      children: [
        { text: 'Title', font: '24px sans-serif', lineHeight: 30 } satisfies TextNode,
        { text: 'Body text', font: '16px sans-serif', lineHeight: 20 } satisfies TextNode,
      ],
    }
    const result = computeLayout(tree)
    expect(result.children[0]!.y).toBe(10)
    expect(result.children[0]!.height).toBe(30)
    expect(result.children[1]!.y).toBe(48)
    expect(result.children[1]!.height).toBe(20)
    expect(result.height).toBe(78)
  })
})
