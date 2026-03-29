import { init, computeLayout } from '../src/index.js'
import type { ComputedLayout, BoxNode, TextNode } from '../src/index.js'
import { loadYoga, FlexDirection, Edge, Gutter, Align, Justify, Wrap, Direction, MeasureMode } from 'yoga-layout/load'
import type { Node } from 'yoga-layout'

// ── Init ───────────────────────────────────────────────────────
const [, Yoga] = await Promise.all([init(), loadYoga()])

// ── DOM refs ───────────────────────────────────────────────────
const canvasYoga = document.getElementById('canvas-yoga') as HTMLCanvasElement
const canvasTextura = document.getElementById('canvas-textura') as HTMLCanvasElement
const widthSlider = document.getElementById('width-slider') as HTMLInputElement
const widthLabel = document.getElementById('width-label') as HTMLSpanElement
const fontSlider = document.getElementById('font-slider') as HTMLInputElement
const fontLabel = document.getElementById('font-label') as HTMLSpanElement
const scenarioSelect = document.getElementById('scenario') as HTMLSelectElement

const dpr = window.devicePixelRatio || 1

// ── Scenario data ──────────────────────────────────────────────

interface Message { author: string; text: string; time: string }

const chatMessages: Message[] = [
  { author: 'Alice', text: 'Hey, has anyone benchmarked the new virtualized list? The old one was re-measuring every row on scroll.', time: '10:31 AM' },
  { author: 'Bob', text: 'Yeah, 40ms of jank per frame. Each getBoundingClientRect() triggers a full document reflow.', time: '10:32 AM' },
  { author: 'Charlie', text: "We switched to Textura. prepare() runs once per text, then layout() is pure arithmetic over cached widths — 0.09ms for the whole batch. No DOM reads whatsoever.", time: '10:33 AM' },
  { author: 'Alice', text: 'Wait, does it handle our i18n content?', time: '10:34 AM' },
  { author: 'Charlie', text: "Everything. CJK character-level breaking, Arabic RTL with bidi, Thai without spaces, emoji ZWJ sequences, soft hyphens. 7680/7680 accuracy across Chrome, Safari, and Firefox.", time: '10:35 AM' },
  { author: 'Diana', text: 'Shipped it to prod. The entire chat list virtualization is now zero-estimation — we know exact heights for every message before mounting a single DOM node.', time: '10:38 AM' },
]

const cardItems = [
  { title: 'Zero-estimation Virtualization', body: 'Know the exact pixel height of 100,000 list items without rendering any of them. No guessing, no measure-after-mount, no scroll jumps.' },
  { title: 'Worker-thread Layout', body: 'Compute your entire UI layout in a Web Worker. Send only coordinates to the main thread for painting. The main thread never blocks on layout.' },
  { title: 'Canvas & WebGL Rendering', body: 'Full layout engine for non-DOM renderers. Build performant canvas UIs, data visualizations, or game HUDs with real text wrapping.' },
  { title: 'Universal Text Support', body: 'CJK character breaking, Arabic bidi, Thai without spaces, emoji ZWJ sequences, soft hyphens, kinsoku shori — all measured accurately via Intl.Segmenter + canvas.' },
  { title: 'Server-side Layout', body: 'Pre-compute pixel positions on the server. Eliminate layout shift entirely. SSR that actually knows where everything goes before the first paint.' },
  { title: 'Resize Hot Path', body: 'After the one-time prepare(), every subsequent layout() call is pure arithmetic. Resize 500 text blocks in under 0.1ms. No string work, no allocations.' },
]

const i18nMessages: Message[] = [
  { author: 'Yuki', text: '新しいレイアウトエンジンのテストをしています。日本語のテキスト折り返しが完璧に動作するか確認中です。禁則処理も正しく機能していますね。', time: '09:15' },
  { author: 'Ahmed', text: 'مرحبا! أنا أختبر النص العربي مع محرك التخطيط الجديد. الاتجاه من اليمين إلى اليسار يعمل بشكل صحيح والنص يلتف كما هو متوقع.', time: '09:17' },
  { author: 'Wei', text: '这个布局引擎处理中文文本非常好。每个汉字都可以作为断行点，标点符号的禁则规则也正确执行了。', time: '09:18' },
  { author: 'Somchai', text: 'ทดสอบข้อความภาษาไทยที่ไม่มีช่องว่างระหว่างคำ ระบบสามารถตัดคำได้ถูกต้องโดยใช้ Intl.Segmenter', time: '09:20' },
  { author: 'Priya', text: 'हिंदी टेक्स्ट भी सही तरीके से काम कर रहा है। यूनिकोड सेगमेंटेशन की वजह से शब्द विभाजन एकदम सटीक है।', time: '09:22' },
  { author: 'Mixed', text: 'Emoji test: 👨‍👩‍👧‍👦 family, 🏳️‍🌈 flag, 👩🏽‍💻 technologist. Mixed: Hello世界مرحبا🚀 — all measured correctly!', time: '09:25' },
]

const articleParagraphs = [
  "The browser's layout engine is the most powerful piece of software most developers never think about. It takes a tree of boxes with constraints — widths, paddings, flex rules — and produces exact pixel coordinates for every element. It handles text wrapping across dozens of writing systems, each with their own breaking rules.",
  "But it has a fatal flaw: it's a black box that blocks the main thread. Every time you ask \"how tall is this text?\", the browser must synchronously reflow the entire document tree before it can answer. When hundreds of components each independently measure their text — as happens in any virtualized list, chat app, or data grid — you get read/write interleaving that costs 30–150ms per frame.",
  "Yoga, Facebook's flexbox engine, solved half the problem. It computes box layout in pure JS/WASM, fast enough to run in a worker thread. But Yoga deliberately punts on text. Its MeasureFunction callback says: \"you tell me how big text is, I'll tell you where boxes go.\" For a decade, the only answer to that callback was: ask the DOM. Which puts you right back where you started.",
  "Pretext solved the other half. By using canvas measureText as a font-engine oracle combined with Intl.Segmenter for Unicode-aware word boundaries, it can predict text height with pixel-perfect accuracy — 7680/7680 across Chrome, Safari, and Firefox — without ever touching the DOM. After a one-time prepare() call, every subsequent layout() is pure arithmetic over cached segment widths.",
  "Textura joins them. Declare a tree of flex containers and text nodes. Get back exact positions, sizes, and line counts for everything. No DOM. No reflow. No guessing. The entire layout computation runs in under a millisecond for typical UIs, and the resize hot path is measured in microseconds.",
]

// ── Tree builders ──────────────────────────────────────────────

function buildChatTree(w: number, fontSize: number): BoxNode {
  return {
    width: w, flexDirection: 'column', padding: 16, gap: 8,
    children: [
      { text: '#engineering', font: `700 ${fontSize + 4}px Inter`, lineHeight: Math.round((fontSize + 4) * 1.4) } satisfies TextNode,
      ...chatMessages.map((m): BoxNode => ({
        flexDirection: 'row', gap: 10, padding: 10,
        children: [
          { width: 32, height: 32 },
          {
            flexDirection: 'column', flexGrow: 1, flexShrink: 1, gap: 3,
            children: [
              {
                flexDirection: 'row', gap: 8, alignItems: 'baseline',
                children: [
                  { text: m.author, font: `600 ${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.3) } satisfies TextNode,
                  { text: m.time, font: `${fontSize - 2}px Inter`, lineHeight: Math.round((fontSize - 2) * 1.3) } satisfies TextNode,
                ],
              } satisfies BoxNode,
              { text: m.text, font: `${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.5) } satisfies TextNode,
            ],
          } satisfies BoxNode,
        ],
      })),
    ],
  }
}

function buildCardsTree(w: number, fontSize: number): BoxNode {
  return {
    width: w, flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 12,
    children: cardItems.map((item): BoxNode => ({
      flexDirection: 'column', width: (w - 36) / 2, padding: 16, gap: 8,
      children: [
        { text: item.title, font: `600 ${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.4) } satisfies TextNode,
        { text: item.body, font: `${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.55) } satisfies TextNode,
      ],
    })),
  }
}

function buildI18nTree(w: number, fontSize: number): BoxNode {
  return {
    width: w, flexDirection: 'column', padding: 16, gap: 6,
    children: [
      { text: 'Multilingual Layout Test', font: `700 ${fontSize + 4}px Inter`, lineHeight: Math.round((fontSize + 4) * 1.4) } satisfies TextNode,
      ...i18nMessages.map((m): BoxNode => ({
        flexDirection: 'row', gap: 10, padding: 10,
        children: [
          { width: 28, height: 28 },
          {
            flexDirection: 'column', flexGrow: 1, flexShrink: 1, gap: 2,
            children: [
              { text: `${m.author}  ${m.time}`, font: `500 ${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.3) } satisfies TextNode,
              { text: m.text, font: `${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.6) } satisfies TextNode,
            ],
          } satisfies BoxNode,
        ],
      })),
    ],
  }
}

function buildArticleTree(w: number, fontSize: number): BoxNode {
  return {
    width: w, flexDirection: 'column', padding: 24, gap: 4,
    children: [
      { text: 'Why the Web Needed a New Layout Engine', font: `700 ${fontSize + 8}px Inter`, lineHeight: Math.round((fontSize + 8) * 1.3) } satisfies TextNode,
      { text: 'The architectural bottleneck that Textura resolves', font: `${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.5) } satisfies TextNode,
      // spacer
      { height: 12 } satisfies BoxNode,
      ...articleParagraphs.map((p): TextNode => ({
        text: p, font: `${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.7), marginBottom: 12,
      })),
    ],
  }
}

function buildStressTree(w: number, fontSize: number): BoxNode {
  const items: BoxNode[] = []
  for (let i = 0; i < 200; i++) {
    const len = 20 + Math.floor(Math.abs(Math.sin(i * 0.7)) * 120)
    const text = `Item ${i + 1}: ${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.substring(0, len)}`
    items.push({
      flexDirection: 'row', gap: 8, padding: 6,
      children: [
        { width: 20, height: 20 },
        { text, font: `${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.45), flexGrow: 1, flexShrink: 1 } satisfies TextNode,
      ],
    })
  }
  return { width: w, flexDirection: 'column', padding: 8, gap: 2, children: items }
}

function buildMorphTree(w: number, fontSize: number): BoxNode {
  // Dashboard layout: header + stats row + card grid + activity feed
  // Designed to reflow dramatically across widths
  const statsItems = [
    { value: '7,680', label: 'Accuracy tests passed' },
    { value: '0.09ms', label: 'Resize hot path' },
    { value: '0 DOM', label: 'Nodes touched' },
    { value: '60fps', label: 'Animation target' },
  ]

  const dashCards = [
    { title: 'Virtualized List', body: 'Pre-compute exact heights for 100k rows. No render-then-measure. No scroll jumps. The scrollbar thumb is perfectly sized from the first frame.' },
    { title: 'Worker Thread', body: 'The entire layout computation runs off the main thread. Only pixel coordinates cross the boundary. Zero main-thread blocking.' },
    { title: 'Canvas Renderer', body: 'Full flexbox layout for non-DOM surfaces. Game HUDs, data visualizations, PDF generators — anywhere you paint pixels without browser layout.' },
    { title: 'Live Resize', body: 'After one-time text preparation, every width change is pure cached arithmetic. Drag a splitter, rotate a device, animate a panel — all under 0.1ms.' },
    { title: 'i18n Ready', body: 'CJK character breaking, Arabic RTL, Thai word boundaries, emoji ZWJ sequences. Every writing system measured via Intl.Segmenter + canvas.' },
    { title: 'SSR Layout', body: 'Pre-compute positions on the server. Send exact coordinates with the first HTML payload. Zero layout shift, zero CLS, perfect LCP.' },
  ]

  const feedMessages = [
    { name: 'Layout Engine', text: 'Computed 847 text nodes across 12 containers in 0.34ms. All heights pixel-accurate.' },
    { name: 'Resize Observer', text: 'Container width changed from 1200px to 320px. Re-layout completed in 0.07ms using cached segments.' },
    { name: 'Virtual Scroller', text: 'Scrolled to row 45,000 of 100,000. Pre-computed height lookup: O(1). No DOM measurement needed.' },
  ]

  // Determine card columns based on width
  const cardGap = 12
  const cardPad = 12
  const innerW = w - cardPad * 2
  const cols = w >= 700 ? 3 : w >= 420 ? 2 : 1
  const cardW = (innerW - cardGap * (cols - 1)) / cols

  return {
    width: w, flexDirection: 'column', padding: 0,
    children: [
      // Header
      {
        flexDirection: 'column', padding: 16, gap: 4,
        children: [
          { text: 'Textura Dashboard', font: `700 ${fontSize + 6}px Inter`, lineHeight: Math.round((fontSize + 6) * 1.3) } satisfies TextNode,
          { text: 'DOM-free layout engine — every pixel computed without touching the browser layout system', font: `${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.5) } satisfies TextNode,
        ],
      } satisfies BoxNode,
      // Stats row
      {
        flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8,
        children: statsItems.map((s): BoxNode => ({
          flexDirection: 'column', padding: 12, gap: 2,
          width: w >= 500 ? (innerW - 8 * 3) / 4 : (innerW - 8) / 2,
          children: [
            { text: s.value, font: `700 ${fontSize + 2}px Inter`, lineHeight: Math.round((fontSize + 2) * 1.3) } satisfies TextNode,
            { text: s.label, font: `${fontSize - 2}px Inter`, lineHeight: Math.round((fontSize - 2) * 1.4) } satisfies TextNode,
          ],
        })),
      } satisfies BoxNode,
      // Card grid
      {
        flexDirection: 'row', flexWrap: 'wrap', padding: cardPad, gap: cardGap,
        children: dashCards.map((c): BoxNode => ({
          flexDirection: 'column', width: cardW, padding: 14, gap: 6,
          children: [
            { text: c.title, font: `600 ${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.4) } satisfies TextNode,
            { text: c.body, font: `${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.55) } satisfies TextNode,
          ],
        })),
      } satisfies BoxNode,
      // Activity feed
      {
        flexDirection: 'column', padding: 12, gap: 6,
        children: [
          { text: 'Activity Log', font: `600 ${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.4) } satisfies TextNode,
          ...feedMessages.map((m): BoxNode => ({
            flexDirection: 'row', gap: 10, padding: 10,
            children: [
              { width: 28, height: 28 },
              {
                flexDirection: 'column', flexGrow: 1, flexShrink: 1, gap: 2,
                children: [
                  { text: m.name, font: `600 ${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.3) } satisfies TextNode,
                  { text: m.text, font: `${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.5) } satisfies TextNode,
                ],
              } satisfies BoxNode,
            ],
          })),
        ],
      } satisfies BoxNode,
    ],
  }
}

type ScenarioKey = 'chat' | 'cards' | 'i18n' | 'article' | 'stress' | 'morph'
const builders: Record<ScenarioKey, (w: number, fs: number) => BoxNode> = {
  chat: buildChatTree, cards: buildCardsTree, i18n: buildI18nTree,
  article: buildArticleTree, stress: buildStressTree, morph: buildMorphTree,
}

// ── Yoga-only layout (no text measurement) ─────────────────────

function yogaLayoutTree(tree: BoxNode, containerWidth: number, fontSize: number): { layout: ComputedLayout; time: number } {
  const t0 = performance.now()
  const config = Yoga.Config.create()
  config.setUseWebDefaults(true)

  const FIXED_LINE_HEIGHT = Math.round(fontSize * 1.5)
  // Yoga alone has to GUESS text heights — typically a fixed line count or chars-per-line heuristic
  function estimateTextHeight(text: string, _font: string, maxWidth: number): number {
    // Common heuristic: assume ~7px per character at 14px font, estimate lines
    const avgCharWidth = fontSize * 0.52
    const charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharWidth))
    const lines = Math.max(1, Math.ceil(text.length / charsPerLine))
    const lh = FIXED_LINE_HEIGHT
    return lines * lh
  }

  function isText(node: BoxNode | TextNode): node is TextNode {
    return 'text' in node && typeof node.text === 'string'
  }

  function buildYogaNode(desc: BoxNode | TextNode, parentWidth: number): Node {
    const node = Yoga.Node.create(config)

    // Apply basic flex props
    if (desc.flexDirection === 'column') node.setFlexDirection(FlexDirection.Column)
    else if (desc.flexDirection === 'row') node.setFlexDirection(FlexDirection.Row)
    else if (desc.flexDirection === 'row-reverse') node.setFlexDirection(FlexDirection.RowReverse)
    else if (desc.flexDirection === 'column-reverse') node.setFlexDirection(FlexDirection.ColumnReverse)

    if (desc.flexWrap === 'wrap') node.setFlexWrap(Wrap.Wrap)
    if (desc.justifyContent === 'space-between') node.setJustifyContent(Justify.SpaceBetween)
    if (desc.alignItems === 'center') node.setAlignItems(Align.Center)
    else if (desc.alignItems === 'baseline') node.setAlignItems(Align.Baseline)
    if (desc.flexGrow !== undefined) node.setFlexGrow(desc.flexGrow)
    if (desc.flexShrink !== undefined) node.setFlexShrink(desc.flexShrink)

    if (desc.width !== undefined) node.setWidth(desc.width)
    if (desc.height !== undefined) node.setHeight(desc.height)

    if (desc.padding !== undefined) node.setPadding(Edge.All, desc.padding)
    if (desc.paddingBottom !== undefined) node.setPadding(Edge.Bottom, desc.paddingBottom)
    if (desc.margin !== undefined) node.setMargin(Edge.All, desc.margin as number)
    if (desc.marginBottom !== undefined) node.setMargin(Edge.Bottom, desc.marginBottom as number)
    if (desc.gap !== undefined) node.setGap(Gutter.All, desc.gap)

    if (isText(desc)) {
      // Yoga alone: must use a heuristic for text height
      node.setMeasureFunc((width: number, widthMode: MeasureMode) => {
        const maxW = widthMode === MeasureMode.Undefined ? parentWidth : width
        const h = estimateTextHeight(desc.text, desc.font, maxW)
        const w = widthMode === MeasureMode.Undefined ? maxW : width
        return { width: w, height: h }
      })
    } else if (desc.children) {
      const childParentW = typeof desc.width === 'number' ? desc.width : parentWidth
      for (let i = 0; i < desc.children.length; i++) {
        node.insertChild(buildYogaNode(desc.children[i]!, childParentW), i)
      }
    }

    return node
  }

  const root = buildYogaNode(tree, containerWidth)
  root.calculateLayout(containerWidth, undefined, Direction.LTR)

  function readNode(n: Node, desc: BoxNode | TextNode): ComputedLayout {
    const result: ComputedLayout = {
      x: n.getComputedLeft(), y: n.getComputedTop(),
      width: n.getComputedWidth(), height: n.getComputedHeight(),
      children: [],
    }
    if (isText(desc)) {
      result.text = desc.text
    }
    const children = (!isText(desc) && desc.children) ? desc.children : []
    for (let i = 0; i < n.getChildCount(); i++) {
      result.children.push(readNode(n.getChild(i), children[i]! as BoxNode | TextNode))
    }
    return result
  }

  const layout = readNode(root, tree)
  root.freeRecursive()
  config.free()
  const time = performance.now() - t0
  return { layout, time }
}

// ── Canvas rendering ───────────────────────────────────────────

const palette = {
  bg: '#111114',
  card: '#1a1a22',
  cardBorder: '#2a2a35',
  accent: '#e94560',
  accentSoft: '#e9456030',
  text: '#e4e4e7',
  textDim: '#71717a',
  textMid: '#a1a1aa',
  overlap: '#ef444440',
  avatar: '#e94560',
  avatarAlt: '#6366f1',
}

function setupCanvas(canvas: HTMLCanvasElement, height: number): CanvasRenderingContext2D {
  const w = canvas.parentElement!.clientWidth - 2 // minus border
  canvas.style.width = `${w}px`
  canvas.style.height = `${height}px`
  canvas.width = w * dpr
  canvas.height = height * dpr
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

function renderLayout(
  ctx: CanvasRenderingContext2D,
  layout: ComputedLayout,
  tree: BoxNode | TextNode,
  ox: number,
  oy: number,
  scenario: ScenarioKey,
  isYoga: boolean,
) {
  const x = ox + layout.x
  const y = oy + layout.y
  const w = layout.width
  const h = layout.height

  const isText = layout.text !== undefined
  const hasCardStyle = 'padding' in tree && (tree.padding ?? 0) >= 10 && !isText && layout.children.length > 0
  const isAvatar = !isText && layout.children.length === 0 && w >= 20 && w <= 36 && h >= 20 && h <= 36

  // Card background
  if (hasCardStyle && (scenario === 'chat' || scenario === 'i18n' || scenario === 'stress' || scenario === 'morph')) {
    ctx.fillStyle = palette.card
    roundRect(ctx, x, y, w, h, 6)
    ctx.fill()
    ctx.strokeStyle = palette.cardBorder
    ctx.lineWidth = 0.5
    roundRect(ctx, x, y, w, h, 6)
    ctx.stroke()
  }

  // Card bg for "cards" / "morph" scenario
  if ((scenario === 'cards' && 'padding' in tree && tree.padding === 16 && !isText) ||
      (scenario === 'morph' && 'padding' in tree && (tree.padding === 14 || tree.padding === 12) && !isText && layout.children.length > 0 && layout.children.length <= 3)) {
    ctx.fillStyle = palette.card
    roundRect(ctx, x, y, w, h, 8)
    ctx.fill()
    ctx.strokeStyle = palette.cardBorder
    ctx.lineWidth = 0.5
    roundRect(ctx, x, y, w, h, 8)
    ctx.stroke()
  }

  // Avatar
  if (isAvatar) {
    ctx.fillStyle = palette.avatar
    roundRect(ctx, x, y, w, h, w / 2)
    ctx.fill()
    return
  }

  // Text
  if (isText) {
    const font = 'font' in tree ? (tree as TextNode).font : `14px Inter`
    const lineHeight = 'lineHeight' in tree ? (tree as TextNode).lineHeight : 20
    const isBold = font.includes('600') || font.includes('700')
    const isTitle = font.includes('700') && parseInt(font.match(/\d+/)?.[0] ?? '14') > 16

    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()

    ctx.font = font
    ctx.fillStyle = isTitle ? '#fff' : isBold ? palette.accent : font.includes(`${parseInt(font) - 2}px`) || font.includes('12px') || font.includes('11px') ? palette.textDim : palette.text

    // Grapheme-aware text wrapping
    const text = layout.text!
    let line = ''
    let lineY = y + lineHeight * 0.76

    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

    function flushLine() {
      if (line) {
        ctx.fillText(line, x, lineY)
        line = ''
        lineY += lineHeight
      }
    }

    const chunks = text.split(/( +)/)
    for (const chunk of chunks) {
      const test = line + chunk
      if (ctx.measureText(test).width <= w || !line && ctx.measureText(chunk).width <= w) {
        line = test
      } else {
        if (line && ctx.measureText(chunk).width <= w) {
          flushLine()
          line = chunk.replace(/^ +/, '')
        } else {
          if (line) flushLine()
          const graphemes = [...segmenter.segment(chunk)].map(s => s.segment)
          for (const g of graphemes) {
            const testG = line + g
            if (ctx.measureText(testG).width > w && line) {
              flushLine()
              line = g.replace(/^ +/, '')
            } else {
              line = testG
            }
          }
        }
      }
    }
    if (line) ctx.fillText(line, x, lineY)

    ctx.restore()

    // Overflow indicator for Yoga side
    if (isYoga && lineY + lineHeight * 0.24 > y + h + 2) {
      ctx.fillStyle = palette.overlap
      ctx.fillRect(x, y + h, w, lineY + lineHeight * 0.24 - (y + h))
    }
    return
  }

  // Recurse
  const children = ('children' in tree && !isText) ? (tree as BoxNode).children ?? [] : []
  for (let i = 0; i < layout.children.length; i++) {
    if (children[i]) {
      renderLayout(ctx, layout.children[i]!, children[i]!, x, y, scenario, isYoga)
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// ── Count overlaps ───────────────────────────────────────────

function countOverlaps(layout: ComputedLayout, tree: BoxNode | TextNode, ctx: CanvasRenderingContext2D): number {
  let count = 0
  if (layout.text !== undefined && 'font' in tree) {
    ctx.font = (tree as TextNode).font
    const lh = (tree as TextNode).lineHeight
    const w = layout.width
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    const graphemes = [...segmenter.segment(layout.text)].map(s => s.segment)
    let line = ''
    let lines = 1
    for (const g of graphemes) {
      const test = line + g
      if (ctx.measureText(test).width > w && line) {
        lines++
        line = g.replace(/^ +/, '')
      } else {
        line = test
      }
    }
    const actualHeight = lines * lh
    if (actualHeight > layout.height + 2) count++
  }
  const children = ('children' in tree) ? (tree as BoxNode).children ?? [] : []
  for (let i = 0; i < layout.children.length; i++) {
    if (children[i]) count += countOverlaps(layout.children[i]!, children[i]!, ctx)
  }
  return count
}

// ── Insight text ───────────────────────────────────────────────

const insights: Record<ScenarioKey, string> = {
  chat: `<p><strong>Chat messages</strong> have wildly variable text lengths. Yoga alone must guess heights — typically using a characters-per-line heuristic. Drag the width slider narrow and watch the left side: text overflows its boxes (shown in <span style="color:#ef4444">red</span>) because the estimate doesn't account for actual word wrapping, font metrics, or mixed-width characters.</p>
<p>Textura on the right measures every text node accurately via canvas measureText. Each message card's height matches its actual content — no overflow, no wasted space, no layout shift.</p>`,

  cards: `<p><strong>Content cards in a flex-wrap grid</strong> expose the estimation problem differently. Each card has a title and body with different font weights and sizes. Yoga's heuristic applies the same characters-per-line ratio to bold headings and body text, even though a bold "W" is much wider than a regular "i".</p>
<p>Textura measures each text node with its actual font, so cards are sized precisely. This is the kind of layout you'd use for dashboards, feature grids, or product listings.</p>`,

  i18n: `<p><strong>Multilingual text</strong> is where Yoga's estimation completely breaks down. Japanese and Chinese use full-width characters (~2x the width of Latin). Thai has no spaces between words. Arabic flows right-to-left. A characters-per-line heuristic calibrated for English produces wildly wrong heights for all of these.</p>
<p>Textura uses Intl.Segmenter for language-aware word boundaries and canvas measureText for actual glyph widths. It handles CJK per-character breaking, kinsoku shori (Japanese punctuation rules), and Arabic shaping — all without the DOM.</p>`,

  article: `<p><strong>Long-form article layout</strong> shows the cumulative error problem. Each paragraph's height is slightly wrong when estimated, and those errors compound. By the fifth paragraph, the Yoga side is significantly off — either overflowing or leaving large gaps.</p>
<p>This is exactly what happens in reading apps, document viewers, and paginated layouts. If you can't predict paragraph heights accurately, you can't paginate, you can't pre-calculate scroll positions, and you can't eliminate layout shift.</p>`,

  stress: `<p><strong>200 variable-length items</strong> — the virtualization use case. Every real virtualized list needs to know row heights before rendering. Yoga alone forces you to either use fixed heights (ugly), render-then-measure (slow, causes layout shift), or estimate (inaccurate scroll positions, jumpy scrollbar).</p>
<p>Textura's first call includes the one-time <code>prepare()</code> cost (canvas text measurement + segmentation). But on every subsequent resize, the cached hot path runs in <strong>under 1ms for all 200 items</strong>. Compare the "Textura resize" stat to "DOM measurement" — that's the real comparison. DOM measures every element with getBoundingClientRect, triggering layout reflow each time.</p>`,

  morph: `<p><strong>This is the demo neither Yoga nor Pretext can do alone.</strong> A complete dashboard UI is being continuously re-laid-out at 60fps as the width sweeps from 320px to 900px and back. Every single frame: Yoga computes the flex layout, Pretext measures all text at the new available widths, boxes resize, cards reflow from 1 to 2 to 3 columns — all in under 1ms.</p>
<p><strong>Yoga alone</strong> (left) can compute the flex layout but has to guess text heights. Watch the red overflow zones — text spills out of its boxes at every width, and the errors compound as cards reflow. <strong>Pretext alone</strong> can measure text but has no layout engine — it can't compute where boxes go. <strong>The DOM</strong> can't do this at 60fps — continuous relayout triggers synchronous reflow on every frame, dropping to 15–20fps on complex layouts. Only Textura combines both engines to make this possible.</p>`,
}

// ── DOM measurement for comparison ─────────────────────────────

function measureWithDOM(tree: BoxNode | TextNode, containerWidth: number, fontSize: number): number {
  const container = document.createElement('div')
  container.style.cssText = `position:absolute;left:-9999px;top:0;width:${containerWidth}px;font-family:Inter,sans-serif;font-size:${fontSize}px;line-height:1.5`

  function buildDOM(desc: BoxNode | TextNode): HTMLElement {
    const el = document.createElement('div')
    if ('text' in desc && typeof desc.text === 'string') {
      el.textContent = desc.text
      el.style.font = (desc as TextNode).font
      el.style.lineHeight = `${(desc as TextNode).lineHeight}px`
      el.style.overflowWrap = 'break-word'
    } else {
      const box = desc as BoxNode
      el.style.display = 'flex'
      el.style.flexDirection = box.flexDirection ?? 'column'
      if (box.flexWrap) el.style.flexWrap = box.flexWrap
      if (box.gap) el.style.gap = `${box.gap}px`
      if (box.padding) el.style.padding = `${box.padding}px`
      if (box.justifyContent) el.style.justifyContent = box.justifyContent
      if (box.alignItems) el.style.alignItems = box.alignItems
      if (typeof box.width === 'number') el.style.width = `${box.width}px`
      if (typeof box.height === 'number') el.style.height = `${box.height}px`
      if (box.flexGrow) el.style.flexGrow = `${box.flexGrow}`
      if (box.flexShrink !== undefined) el.style.flexShrink = `${box.flexShrink}`
      if (box.marginBottom) el.style.marginBottom = `${box.marginBottom}px`
      if (box.children) {
        for (const child of box.children) el.appendChild(buildDOM(child))
      }
    }
    return el
  }

  container.appendChild(buildDOM(tree))
  document.body.appendChild(container)

  // Force layout reflow — this is the expensive part
  const t0 = performance.now()
  const allEls = container.querySelectorAll('div')
  let totalHeight = 0
  for (const el of allEls) {
    totalHeight += el.getBoundingClientRect().height
  }
  container.getBoundingClientRect()
  const domTime = performance.now() - t0

  document.body.removeChild(container)
  return domTime
}

// ── Main render ────────────────────────────────────────────────

function render() {
  const scenario = scenarioSelect.value as ScenarioKey
  const containerWidth = parseInt(widthSlider.value)
  const fontSize = parseInt(fontSlider.value)

  const tree = builders[scenario](containerWidth, fontSize)

  // Textura first call (includes prepare — text analysis + canvas measurement)
  const t0 = performance.now()
  const texturaLayout = computeLayout(tree, { width: containerWidth })
  const texturaFirstTime = performance.now() - t0

  // Textura second call at different width (resize hot path — cached segments)
  const resizeWidth = containerWidth - 2
  const t1 = performance.now()
  computeLayout(tree, { width: resizeWidth })
  const texturaResizeTime = performance.now() - t1

  // DOM measurement for comparison
  const domTime = measureWithDOM(tree, containerWidth, fontSize)

  // Yoga alone (estimated)
  const { layout: yogaLayout, time: yogaTime } = yogaLayoutTree(tree, containerWidth, fontSize)

  // Canvas heights
  const maxHeight = Math.max(texturaLayout.height, yogaLayout.height, 200)
  const canvasH = Math.min(maxHeight + 20, 800)

  const ctxYR = setupCanvas(canvasYoga, canvasH)
  const ctxTR = setupCanvas(canvasTextura, canvasH)

  // Offset to center the layout in the canvas
  const panelW = canvasYoga.clientWidth
  const offsetX = Math.max(0, (panelW - containerWidth) / 2)

  // Clear
  ctxYR.fillStyle = palette.bg
  ctxYR.fillRect(0, 0, panelW, canvasH)
  ctxTR.fillStyle = palette.bg
  ctxTR.fillRect(0, 0, panelW, canvasH)

  // Render
  renderLayout(ctxYR, yogaLayout, tree, offsetX, 10, scenario, true)
  renderLayout(ctxTR, texturaLayout, tree, offsetX, 10, scenario, false)

  // Stats
  const overlaps = countOverlaps(yogaLayout, tree, ctxYR)
  const heightDiff = Math.abs(texturaLayout.height - yogaLayout.height)

  document.getElementById('yoga-time')!.textContent = `Layout: ${yogaTime.toFixed(2)}ms (wrong)`
  document.getElementById('yoga-nodes')!.textContent = `Height: ${Math.round(yogaLayout.height)}px`
  document.getElementById('textura-time')!.textContent = `First: ${texturaFirstTime.toFixed(1)}ms · Resize: ${texturaResizeTime.toFixed(2)}ms`
  document.getElementById('textura-nodes')!.textContent = `Height: ${Math.round(texturaLayout.height)}px (accurate)`

  document.getElementById('stat-overlap')!.textContent = `${overlaps}`
  document.getElementById('stat-height-diff')!.textContent = `${Math.round(heightDiff)}px`
  document.getElementById('stat-resize-time')!.textContent = `${texturaResizeTime.toFixed(2)}ms`
  document.getElementById('stat-dom-time')!.textContent = `${domTime.toFixed(2)}ms`

  document.getElementById('insight-text')!.innerHTML = insights[scenario]
}

// ── Morph animation ───────────────────────────────────────────

let morphRafId: number | null = null
const morphFrameTimes: number[] = []
const MORPH_MIN_W = 320
const MORPH_MAX_W = 900
const MORPH_CYCLE_MS = 6000 // full cycle duration

function startMorph() {
  const morphBar = document.getElementById('morph-bar')!
  morphBar.classList.add('active')
  const fpsEl = document.getElementById('morph-fps')!
  const widthLabelEl = document.getElementById('morph-width-label')!
  const widthFillEl = document.getElementById('morph-width-fill')!
  const frameGraphEl = document.getElementById('morph-frame-graph')!

  let lastTime = performance.now()
  let fpsAccum = 0
  let fpsFrames = 0
  let displayFps = 60

  // Prime the text cache with a single call at mid-width
  const fontSize = parseInt(fontSlider.value)
  const primeTree = buildMorphTree(600, fontSize)
  computeLayout(primeTree, { width: 600 })

  function morphFrame(now: number) {
    const dt = now - lastTime
    lastTime = now

    // FPS calculation
    fpsAccum += dt
    fpsFrames++
    if (fpsAccum >= 500) {
      displayFps = Math.round(fpsFrames / (fpsAccum / 1000))
      fpsAccum = 0
      fpsFrames = 0
    }

    // Animated width (sine wave)
    const t = (now % MORPH_CYCLE_MS) / MORPH_CYCLE_MS
    const sine = (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2
    const morphWidth = Math.round(MORPH_MIN_W + sine * (MORPH_MAX_W - MORPH_MIN_W))

    const fs = parseInt(fontSlider.value)
    const tree = buildMorphTree(morphWidth, fs)

    // Textura layout (cached hot path)
    const t0 = performance.now()
    const texturaLayout = computeLayout(tree, { width: morphWidth })
    const texturaTime = performance.now() - t0

    // Yoga layout (estimated)
    const { layout: yogaLayout, time: yogaTime } = yogaLayoutTree(tree, morphWidth, fs)

    // Track frame times
    morphFrameTimes.push(texturaTime)
    if (morphFrameTimes.length > 60) morphFrameTimes.shift()

    // Render canvases
    const maxHeight = Math.max(texturaLayout.height, yogaLayout.height, 200)
    const canvasH = Math.min(maxHeight + 20, 800)

    const ctxYR = setupCanvas(canvasYoga, canvasH)
    const ctxTR = setupCanvas(canvasTextura, canvasH)

    const panelW = canvasYoga.clientWidth
    const offsetX = Math.max(0, (panelW - morphWidth) / 2)

    ctxYR.fillStyle = palette.bg
    ctxYR.fillRect(0, 0, panelW, canvasH)
    ctxTR.fillStyle = palette.bg
    ctxTR.fillRect(0, 0, panelW, canvasH)

    renderLayout(ctxYR, yogaLayout, tree, offsetX, 10, 'morph', true)
    renderLayout(ctxTR, texturaLayout, tree, offsetX, 10, 'morph', false)

    // Draw FPS overlay on canvases
    drawFpsOverlay(ctxYR, panelW, yogaTime, 'Yoga')
    drawFpsOverlay(ctxTR, panelW, texturaTime, 'Textura')

    // Update stats
    const overlaps = countOverlaps(yogaLayout, tree, ctxYR)
    const heightDiff = Math.abs(texturaLayout.height - yogaLayout.height)

    document.getElementById('yoga-time')!.textContent = `Layout: ${yogaTime.toFixed(2)}ms (wrong)`
    document.getElementById('yoga-nodes')!.textContent = `Height: ${Math.round(yogaLayout.height)}px`
    document.getElementById('textura-time')!.textContent = `Layout: ${texturaTime.toFixed(2)}ms (accurate)`
    document.getElementById('textura-nodes')!.textContent = `Height: ${Math.round(texturaLayout.height)}px`

    document.getElementById('stat-overlap')!.textContent = `${overlaps}`
    document.getElementById('stat-height-diff')!.textContent = `${Math.round(heightDiff)}px`
    document.getElementById('stat-resize-time')!.textContent = `${texturaTime.toFixed(2)}ms`
    document.getElementById('stat-dom-time')!.textContent = `—`

    // Update morph bar
    fpsEl.textContent = `${displayFps}`
    fpsEl.className = `morph-fps ${displayFps >= 55 ? 'good' : displayFps >= 30 ? 'ok' : 'bad'}`
    widthLabelEl.textContent = `${morphWidth}px`
    const pct = ((morphWidth - MORPH_MIN_W) / (MORPH_MAX_W - MORPH_MIN_W)) * 100
    widthFillEl.style.width = `${pct}%`

    // Frame time graph
    frameGraphEl.innerHTML = morphFrameTimes.map(ft => {
      const h = Math.min(40, Math.max(2, ft * 20))
      const cls = ft > 16 ? 'jank' : ft > 4 ? 'slow' : ''
      return `<div class="bar ${cls}" style="height:${h}px"></div>`
    }).join('')

    document.getElementById('insight-text')!.innerHTML = insights['morph']

    morphRafId = requestAnimationFrame(morphFrame)
  }

  morphRafId = requestAnimationFrame(morphFrame)
}

function stopMorph() {
  if (morphRafId !== null) {
    cancelAnimationFrame(morphRafId)
    morphRafId = null
  }
  document.getElementById('morph-bar')!.classList.remove('active')
  morphFrameTimes.length = 0
}

function drawFpsOverlay(ctx: CanvasRenderingContext2D, panelW: number, frameTime: number, label: string) {
  const text = `${label}: ${frameTime.toFixed(2)}ms`
  ctx.save()
  ctx.font = '600 11px Inter'
  const tw = ctx.measureText(text).width
  const px = panelW - tw - 16
  const py = 8
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  roundRect(ctx, px - 6, py - 2, tw + 12, 18, 4)
  ctx.fill()
  ctx.fillStyle = frameTime < 2 ? '#4ade80' : frameTime < 8 ? '#fb923c' : '#ef4444'
  ctx.fillText(text, px, py + 12)
  ctx.restore()
}

// ── Events ─────────────────────────────────────────────────────

function onScenarioChange() {
  const scenario = scenarioSelect.value as ScenarioKey
  stopMorph()

  if (scenario === 'morph') {
    widthSlider.disabled = true
    widthSlider.style.opacity = '0.3'
    startMorph()
  } else {
    widthSlider.disabled = false
    widthSlider.style.opacity = '1'
    render()
  }
}

render()

widthSlider.addEventListener('input', () => {
  widthLabel.textContent = `${widthSlider.value}px`
  render()
})

fontSlider.addEventListener('input', () => {
  fontLabel.textContent = `${fontSlider.value}px`
  if (scenarioSelect.value === 'morph') return // font change picked up next frame
  render()
})

scenarioSelect.addEventListener('change', onScenarioChange)

window.addEventListener('resize', () => {
  if (scenarioSelect.value !== 'morph') render()
})
