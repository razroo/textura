# Textura

**[Live Demo & Interactive Examples](https://razroo.github.io/textura/)**

https://github.com/user-attachments/assets/bd67d28e-1841-474e-8d3c-8a7e76f272ba

DOM-free layout engine for the web. Combines [Yoga](https://github.com/facebook/yoga) (flexbox) with [Pretext](https://github.com/chenglou/pretext) (text measurement) to compute complete UI geometry — positions, sizes, and text line breaks — without ever touching the DOM.

## Why

The browser's layout engine is a black box that blocks the main thread. Every `getBoundingClientRect()` or `offsetHeight` call triggers synchronous layout reflow. When components independently measure text, each measurement triggers a reflow of the entire document.

Yoga solves box layout (flexbox) in pure JS/WASM, but punts on text — it requires you to supply a `MeasureFunction` callback externally. Pretext solves text measurement with canvas `measureText`, but doesn't do box layout. **Textura joins them**: declare a tree of flex containers and text nodes, get back exact pixel geometry for everything.

This unlocks:
- **Worker-thread UI layout** — compute layout off the main thread, send only coordinates for painting
- **Zero-estimation virtualization** — know exact heights for 100K items before mounting a single DOM node
- **Canvas/WebGL/SVG rendering** — full layout engine for non-DOM renderers
- **Server-side layout** — generate pixel positions server-side (once Pretext gets server canvas)

## Installation

```sh
npm install textura
```

## Quick Start

```ts
import { init, computeLayout } from 'textura'

// Initialize Yoga WASM (call once)
await init()

// Describe your UI as a tree
const result = computeLayout({
  width: 400,
  padding: 16,
  flexDirection: 'column',
  gap: 12,
  children: [
    {
      text: 'Hello World',
      font: '24px Inter',
      lineHeight: 32,
    },
    {
      flexDirection: 'row',
      gap: 8,
      children: [
        { width: 80, height: 80 },                              // avatar
        {
          text: 'This is a message that will wrap to multiple lines based on available width.',
          font: '16px Inter',
          lineHeight: 22,
          flexGrow: 1,
        },
      ],
    },
  ],
})

// result is a tree of computed layouts:
// {
//   x: 0, y: 0, width: 400, height: ...,
//   children: [
//     { x: 16, y: 16, width: 368, height: 32, text: 'Hello World', lineCount: 1 },
//     { x: 16, y: 60, width: 368, height: ...,
//       children: [
//         { x: 0, y: 0, width: 80, height: 80 },
//         { x: 88, y: 0, width: 280, height: ..., text: '...', lineCount: ... },
//       ]
//     },
//   ]
// }
```

## API

### `init(): Promise<void>`

Initialize the Yoga WASM runtime. Must be called once before `computeLayout`.

### `computeLayout(tree, options?): ComputedLayout`

Compute layout for a declarative UI tree. Returns positions, sizes, and text metadata for every node.

**Options:**
- `width?: number` — available width for the root
- `height?: number` — available height for the root
- `direction?: 'ltr' | 'rtl'` — text direction (default: `'ltr'`)

### Node types

**Box nodes** — flex containers with children:
```ts
{
  flexDirection: 'row',
  gap: 8,
  padding: 16,
  children: [...]
}
```

**Text nodes** — leaf nodes with measured text content:
```ts
{
  text: 'Hello world',
  font: '16px Inter',      // canvas font shorthand
  lineHeight: 22,           // line height in px
  whiteSpace: 'pre-wrap',   // optional: preserve spaces/tabs/newlines
}
```

Both node types accept all flexbox properties: `flexDirection`, `flexWrap`, `justifyContent`, `alignItems`, `alignSelf`, `alignContent`, `flexGrow`, `flexShrink`, `flexBasis`, `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`, `padding*`, `margin*`, `border*`, `gap`, `position`, `top/right/bottom/left`, `aspectRatio`, `overflow`, `display`.

### `ComputedLayout`

```ts
interface ComputedLayout {
  x: number
  y: number
  width: number
  height: number
  children: ComputedLayout[]
  text?: string        // present on text nodes
  lineCount?: number   // present on text nodes
}
```

### `clearCache(): void`

Clear Pretext's internal measurement caches.

### `destroy(): void`

Release Yoga resources. Mostly useful for tests.

## How it works

1. You describe a UI tree using plain objects with CSS-like flex properties
2. `computeLayout` builds a Yoga node tree from your description
3. For text nodes, it wires Pretext's `prepare()` + `layout()` into Yoga's `MeasureFunction` — when Yoga asks "how tall is this text at width X?", Pretext answers using canvas-based measurement with cached segment widths
4. Yoga runs its flexbox algorithm over the tree
5. The computed positions and sizes are read back into a plain object tree

The text measurement is the key piece: Pretext handles Unicode segmentation, CJK character breaking, Arabic/bidi text, emoji, soft hyphens, and browser-specific quirks — all via `Intl.Segmenter` and canvas `measureText`, with 7680/7680 accuracy across Chrome/Safari/Firefox.

## Limitations

- Requires a browser environment (or `OffscreenCanvas` in a worker) for text measurement
- Text nodes use the same CSS target as Pretext: `white-space: normal`, `word-break: normal`, `overflow-wrap: break-word`, `line-break: auto`
- Use named fonts (`Inter`, `Helvetica`) — `system-ui` can produce inaccurate measurements on macOS

## Credits

Built on [Yoga](https://github.com/facebook/yoga) by Meta and [Pretext](https://github.com/chenglou/pretext) by Cheng Lou.
