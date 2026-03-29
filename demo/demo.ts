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

// ── Virtual scroll message data ───────────────────────────────

const scrollTexts = [
  'Looks good, ship it.',
  'Can you rebase on main?',
  '+1',
  'Fixed.',
  'Thanks!',
  'On it.',
  'Merged.',
  'Nice catch.',
  'Meeting in 5 min.',
  'The tests are passing now. I think we can merge this.',
  'Has anyone seen the memory usage spike on staging? It jumped from 2GB to 8GB around 3am.',
  'I just ran the benchmarks — 3x improvement. Cache hit rate went from 62% to 94% after the refactor.',
  'Quick question: does the API support pagination for /users or do we need to implement it ourselves?',
  'CI is failing on integration tests. Yesterday\'s migration broke the user lookup query. Rolling back.',
  'I\'ve been investigating the memory leak. Event listeners aren\'t being cleaned up on unmount. The useEffect cleanup is missing in three components.',
  'Design wants dark mode by Q2. We should start with the component library and work outward. Tokens are already in Figma.',
  'Just got off a call with the enterprise customer. They need CSV export plus SAML SSO. Export is easy, SSO is a bigger lift — Q3 at earliest.',
  'Thinking about real-time sync architecture. Three options: WebSockets with custom protocol, SSE for one-way, or CRDTs. Leaning CRDTs for offline-first. Each has trade-offs on complexity, bandwidth, and conflict resolution.',
  'Dashboard perf review: initial load is sub-200ms but re-renders on data updates take 800ms+ because we rebuild the entire chart SVG. Need to switch to canvas rendering or at minimum memoize chart components. Flamegraph shows 60% in reconciliation.',
  'After two days debugging, found the root cause. Our virtualized list estimates row heights by character count, which falls apart for CJK. Japanese full-width chars are ~2x wider than Latin, so estimates were off by 40-60%. Switched to canvas-based pre-measurement and scroll is finally smooth.',
  'Proposal: stop using the browser for layout measurements. Every getBoundingClientRect triggers synchronous reflow — 73% of our frame budget on the messages page. A DOM-free layout engine could pre-compute all heights, eliminate layout thrashing, and enable Web Worker offloading. The entire computation could happen off the main thread.',
  'Sprint retro: shipped new onboarding (conversion +12%), fixed WebSocket reconnection causing duplicate messages, started the sharding project. Next sprint: search rewrite and mobile notifications. Also need to address test flakiness — 3 intermittent failures this week.',
  'The new text rendering pipeline is incredible. It handles Japanese kinsoku shori, Arabic bidirectional text, Thai word segmentation without spaces, and emoji ZWJ sequences — all from a single Intl.Segmenter + canvas measureText pipeline. 7,680 out of 7,680 accuracy tests passing across Chrome, Safari, and Firefox. No DOM touched at any point in the measurement chain.',
]

const scrollAuthors = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack']

const VSCROLL_ITEM_COUNT = 10_000

const scrollMessages: Message[] = Array.from({ length: VSCROLL_ITEM_COUNT }, (_, i) => ({
  author: scrollAuthors[i % scrollAuthors.length]!,
  text: scrollTexts[i % scrollTexts.length]!,
  time: `${9 + Math.floor((i * 3) % 12)}:${String((i * 7) % 60).padStart(2, '0')}`,
}))

type ScenarioKey = 'chat' | 'cards' | 'i18n' | 'article' | 'stress' | 'morph' | 'vscroll' | 'editor' | 'aistream'
const builders: Record<Exclude<ScenarioKey, 'vscroll' | 'editor' | 'aistream'>, (w: number, fs: number) => BoxNode> = {
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
  if (hasCardStyle && (scenario === 'chat' || scenario === 'i18n' || scenario === 'stress' || scenario === 'morph' || scenario === 'aistream')) {
    ctx.fillStyle = palette.card
    roundRect(ctx, x, y, w, h, 6)
    ctx.fill()
    ctx.strokeStyle = palette.cardBorder
    ctx.lineWidth = 0.5
    roundRect(ctx, x, y, w, h, 6)
    ctx.stroke()
  }

  // Card bg for "cards" / "morph" / "aistream" scenario
  if ((scenario === 'cards' && 'padding' in tree && tree.padding === 16 && !isText) ||
      (scenario === 'morph' && 'padding' in tree && (tree.padding === 14 || tree.padding === 12) && !isText && layout.children.length > 0 && layout.children.length <= 3) ||
      (scenario === 'aistream' && 'padding' in tree && (tree.padding === 14 || tree.padding === 16) && !isText && layout.children.length > 0 && layout.children.length <= 3)) {
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

  vscroll: `<p><strong>The unsolved problem of frontend development.</strong> Every virtualized list needs row heights before rendering, but getting heights requires rendering — a catch-22. The workarounds are all bad: fixed heights (wastes space, truncates text), render-then-measure (slow, causes layout shift), or estimate (wrong scrollbar, jumpy scroll-to-index).</p>
<p>Textura breaks the cycle. It pre-computes <strong>exact pixel heights for all 10,000 items</strong> without rendering a single DOM node. The right side has a perfectly-sized scrollbar from frame one. "Jump to item 5,000" lands on the exact pixel. On the left, estimated heights cause cumulative drift — by item 5,000, you're looking at the wrong item entirely. Try scrolling to the bottom and watch the item numbers diverge. This is why every chat app, email client, and data grid on the web has a janky scrollbar.</p>`,

  editor: `<p><strong>This is the technology behind the next generation of design tools.</strong> Every element on this poster — titles, body text, feature cards, statistics, pull quotes — is laid out using Textura's flexbox engine with pixel-perfect text measurement. The entire layout computation happens in under 1ms. Zero DOM nodes are used.</p>
<p>Drag the blue resize handle on the right edge of the poster (Textura side). Watch cards reflow from 3 columns to 2 to 1. Watch text re-wrap across every container. Watch heights auto-adjust and siblings reposition. This is what Canva, Figma, and every canvas-based design editor has struggled with: <strong>accurate text-aware auto-layout without the DOM</strong>. With Textura, it's a single function call.</p>`,

  aistream: `<p><strong>The AI layout problem.</strong> Every AI product — ChatGPT, Notion AI, Cursor — streams tokens into the UI. The layout needs to update on every token: text grows, paragraphs expand, cards appear, sections push content down. With DOM-based layout, each token triggers a synchronous reflow. For complex documents with cards, stats, and mixed content, this becomes visibly janky.</p>
<p>Textura's cached hot path makes per-token relayout nearly free. After the initial <code>prepare()</code>, every subsequent layout is pure arithmetic over cached segment widths. Watch the left side: Yoga's height estimates jump as text grows, causing content below to shift unpredictably. The right side stays perfectly stable — every token produces a correct layout. This enables AI products to stream into <strong>rich, designed layouts</strong> (not just plain text) with zero layout shift.</p>`,

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
  if (scenario === 'vscroll' || scenario === 'editor' || scenario === 'aistream') return
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

// ── Virtual Scroll ────────────────────────────────────────────

interface VScrollState {
  texturaHeights: number[]
  estimatedHeights: number[]
  texturaPrefixSums: Float64Array
  estimatedPrefixSums: Float64Array
  computeTime: number
  width: number
  fontSize: number
}

let vscrollState: VScrollState | null = null
let vscrollTop = 0
const VSCROLL_VIEWPORT_H = 600

function buildScrollItemTree(msg: Message, containerWidth: number, fontSize: number): BoxNode {
  return {
    width: containerWidth, flexDirection: 'row', gap: 8, padding: 8,
    children: [
      { width: 28, height: 28 },
      {
        flexDirection: 'column', flexGrow: 1, flexShrink: 1, gap: 2,
        children: [
          { text: `${msg.author}  ${msg.time}`, font: `600 ${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.3) } satisfies TextNode,
          { text: msg.text, font: `${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.5) } satisfies TextNode,
        ],
      } satisfies BoxNode,
    ],
  }
}

function computeVScrollHeights(containerWidth: number, fontSize: number): VScrollState {
  const t0 = performance.now()

  // Build one big column tree and compute layout once
  const tree: BoxNode = {
    width: containerWidth, flexDirection: 'column',
    children: scrollMessages.map(m => buildScrollItemTree(m, containerWidth, fontSize)),
  }
  const layout = computeLayout(tree, { width: containerWidth })
  const texturaHeights = layout.children.map(c => c.height)

  const computeTime = performance.now() - t0

  // Estimate heights with heuristic (what Yoga alone would do)
  const avgCharWidth = fontSize * 0.52
  const lineHeight = Math.round(fontSize * 1.5)
  const authorLineH = Math.round((fontSize - 1) * 1.3)
  const estimatedHeights = scrollMessages.map(m => {
    const textWidth = containerWidth - 28 - 8 - 16 // avatar + gap + padding
    const charsPerLine = Math.max(1, Math.floor(textWidth / avgCharWidth))
    const textLines = Math.max(1, Math.ceil(m.text.length / charsPerLine))
    return 16 + authorLineH + 2 + textLines * lineHeight // padding*2 + author + gap + text
  })

  const texturaPrefixSums = buildPrefixSums(texturaHeights)
  const estimatedPrefixSums = buildPrefixSums(estimatedHeights)

  return { texturaHeights, estimatedHeights, texturaPrefixSums, estimatedPrefixSums, computeTime, width: containerWidth, fontSize }
}

function buildPrefixSums(heights: number[]): Float64Array {
  const sums = new Float64Array(heights.length + 1)
  for (let i = 0; i < heights.length; i++) {
    sums[i + 1] = sums[i]! + heights[i]!
  }
  return sums
}

function findFirstVisible(prefixSums: Float64Array, scrollTop: number): number {
  let lo = 0, hi = prefixSums.length - 2
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (prefixSums[mid + 1]! <= scrollTop) lo = mid + 1
    else hi = mid
  }
  return lo
}

function startVScroll() {
  document.getElementById('vscroll-bar')!.classList.add('active')

  const containerWidth = parseInt(widthSlider.value)
  const fontSize = parseInt(fontSlider.value)

  vscrollState = computeVScrollHeights(containerWidth, fontSize)
  vscrollTop = 0

  renderVScroll()
}

function stopVScroll() {
  document.getElementById('vscroll-bar')!.classList.remove('active')
  vscrollState = null
}

function renderVScroll() {
  if (!vscrollState) return
  const state = vscrollState

  const texturaTotalH = state.texturaPrefixSums[state.texturaPrefixSums.length - 1]!
  const estimatedTotalH = state.estimatedPrefixSums[state.estimatedPrefixSums.length - 1]!

  // Clamp scroll
  const maxScroll = Math.max(0, texturaTotalH - VSCROLL_VIEWPORT_H)
  vscrollTop = Math.max(0, Math.min(vscrollTop, maxScroll))

  const canvasH = VSCROLL_VIEWPORT_H

  const ctxE = setupCanvas(canvasYoga, canvasH)
  const ctxT = setupCanvas(canvasTextura, canvasH)
  const panelW = canvasYoga.clientWidth

  // Clear
  ctxE.fillStyle = palette.bg
  ctxE.fillRect(0, 0, panelW, canvasH)
  ctxT.fillStyle = palette.bg
  ctxT.fillRect(0, 0, panelW, canvasH)

  // Render both viewports at the same scrollTop
  const scrollbarW = 10
  const contentW = Math.min(panelW - scrollbarW - 8, state.width)
  const offsetX = Math.max(0, (panelW - scrollbarW - contentW) / 2)

  const estFirstIdx = renderVScrollViewport(ctxE, state.estimatedHeights, state.estimatedPrefixSums, estimatedTotalH, contentW, offsetX, panelW, true)
  const texFirstIdx = renderVScrollViewport(ctxT, state.texturaHeights, state.texturaPrefixSums, texturaTotalH, contentW, offsetX, panelW, false)

  // Update stats
  const heightError = Math.abs(texturaTotalH - estimatedTotalH)
  const drift = Math.abs(estFirstIdx - texFirstIdx)

  document.getElementById('yoga-time')!.textContent = `Estimated total: ${Math.round(estimatedTotalH).toLocaleString()}px`
  document.getElementById('yoga-nodes')!.textContent = `Showing item ${estFirstIdx + 1}`
  document.getElementById('textura-time')!.textContent = `Accurate total: ${Math.round(texturaTotalH).toLocaleString()}px`
  document.getElementById('textura-nodes')!.textContent = `Showing item ${texFirstIdx + 1}`

  document.getElementById('stat-overlap')!.textContent = `${drift}`
  document.getElementById('stat-height-diff')!.textContent = `${Math.round(heightError).toLocaleString()}px`
  document.getElementById('stat-resize-time')!.textContent = `${state.computeTime.toFixed(0)}ms`
  document.getElementById('stat-dom-time')!.textContent = `${VSCROLL_ITEM_COUNT.toLocaleString()}`

  // Perf card labels update
  document.getElementById('vscroll-count')!.textContent = VSCROLL_ITEM_COUNT.toLocaleString()
  document.getElementById('vscroll-time')!.textContent = `${state.computeTime.toFixed(0)}ms`
  document.getElementById('vscroll-drift')!.textContent = drift > 0 ? `${drift} items` : 'None'
  document.getElementById('vscroll-drift')!.className = `vscroll-stat-value ${drift === 0 ? 'good' : drift < 50 ? 'warn' : 'bad'}`
  document.getElementById('vscroll-height-err')!.textContent = `${Math.round(heightError).toLocaleString()}px`

  document.getElementById('insight-text')!.innerHTML = insights['vscroll']
}

function renderVScrollViewport(
  ctx: CanvasRenderingContext2D,
  heights: number[],
  prefixSums: Float64Array,
  totalHeight: number,
  contentW: number,
  offsetX: number,
  panelW: number,
  isEstimated: boolean,
): number {
  const viewportH = VSCROLL_VIEWPORT_H
  const scrollbarW = 10
  const fontSize = vscrollState!.fontSize
  const lineHeight = Math.round(fontSize * 1.5)
  const authorLineH = Math.round((fontSize - 1) * 1.3)

  // Find first visible item
  const firstIdx = findFirstVisible(prefixSums, vscrollTop)
  let y = prefixSums[firstIdx]! - vscrollTop

  // Clip to viewport
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, panelW - scrollbarW - 4, viewportH)
  ctx.clip()

  for (let i = firstIdx; i < scrollMessages.length && y < viewportH; i++) {
    const msg = scrollMessages[i]!
    const itemH = heights[i]!

    if (y + itemH < 0) { y += itemH; continue }

    const x = offsetX
    const cardX = x + 4
    const cardW = contentW - 8

    // Card background
    ctx.fillStyle = palette.card
    roundRect(ctx, cardX, y + 1, cardW, itemH - 2, 6)
    ctx.fill()
    ctx.strokeStyle = palette.cardBorder
    ctx.lineWidth = 0.5
    roundRect(ctx, cardX, y + 1, cardW, itemH - 2, 6)
    ctx.stroke()

    // Avatar
    ctx.fillStyle = i % 3 === 0 ? palette.avatar : i % 3 === 1 ? palette.avatarAlt : '#10b981'
    roundRect(ctx, cardX + 4, y + 5, 28, 28, 14)
    ctx.fill()

    // Author + time
    const textX = cardX + 40
    const textMaxW = cardW - 48
    ctx.font = `600 ${fontSize - 1}px Inter`
    ctx.fillStyle = palette.accent
    ctx.fillText(msg.author, textX, y + 20)
    const aw = ctx.measureText(msg.author).width
    ctx.font = `${fontSize - 2}px Inter`
    ctx.fillStyle = palette.textDim
    ctx.fillText(`  ${msg.time}`, textX + aw, y + 20)

    // Message text (wrap and render, allow overflow for estimated side)
    const msgTextY = y + 20 + authorLineH
    ctx.font = `${fontSize}px Inter`
    ctx.fillStyle = palette.text

    const words = msg.text.split(' ')
    let line = ''
    let ly = msgTextY + lineHeight * 0.76
    const maxLy = y + itemH - 4 // bottom of allocated box

    for (const word of words) {
      const test = line ? `${line} ${word}` : word
      if (ctx.measureText(test).width > textMaxW && line) {
        ctx.fillText(line, textX, ly)
        line = word
        ly += lineHeight
      } else {
        line = test
      }
    }
    if (line) {
      ctx.fillText(line, textX, ly)
    }

    // Overflow indicator
    if (isEstimated && ly > maxLy + 2) {
      ctx.fillStyle = palette.overlap
      ctx.fillRect(cardX, y + itemH - 1, cardW, Math.min(ly - maxLy + lineHeight * 0.3, itemH * 0.5))
    }

    // Item index label
    ctx.font = '500 10px Inter'
    ctx.fillStyle = palette.textDim
    ctx.fillText(`#${i + 1}`, cardX + cardW - ctx.measureText(`#${i + 1}`).width - 6, y + 14)

    y += itemH
  }

  ctx.restore()

  // Scrollbar
  const thumbH = Math.max(24, viewportH / totalHeight * viewportH)
  const maxThumbY = viewportH - thumbH
  const scrollFraction = totalHeight <= viewportH ? 0 : vscrollTop / (totalHeight - viewportH)
  const thumbY = scrollFraction * maxThumbY

  // Track
  ctx.fillStyle = '#1c1c20'
  roundRect(ctx, panelW - scrollbarW - 2, 0, scrollbarW, viewportH, 5)
  ctx.fill()

  // Thumb
  ctx.fillStyle = isEstimated ? '#fb923c80' : '#4ade8080'
  roundRect(ctx, panelW - scrollbarW - 2, thumbY, scrollbarW, thumbH, 5)
  ctx.fill()
  ctx.fillStyle = isEstimated ? '#fb923c' : '#4ade80'
  roundRect(ctx, panelW - scrollbarW, thumbY + 2, scrollbarW - 4, thumbH - 4, 4)
  ctx.fill()

  // Position label
  const pct = Math.round(scrollFraction * 100)
  ctx.save()
  ctx.font = '600 11px Inter'
  const posText = `${pct}%`
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  const ptw = ctx.measureText(posText).width
  roundRect(ctx, panelW - scrollbarW - ptw - 16, thumbY + thumbH / 2 - 9, ptw + 10, 18, 4)
  ctx.fill()
  ctx.fillStyle = isEstimated ? '#fb923c' : '#4ade80'
  ctx.fillText(posText, panelW - scrollbarW - ptw - 11, thumbY + thumbH / 2 + 4)
  ctx.restore()

  return firstIdx
}

// ── Design Editor ─────────────────────────────────────────────

let editorPosterWidth = 600
let editorDragging = false

function buildEditorTree(w: number, fontSize: number): BoxNode {
  const innerPad = 32
  const innerW = w - innerPad * 2
  const cardGap = 16
  const cols = w >= 600 ? 3 : w >= 400 ? 2 : 1
  const cardW = (innerW - cardGap * (cols - 1)) / cols

  const statGap = 12
  const statCols = w >= 500 ? 4 : 2
  const statW = (innerW - statGap * (statCols - 1)) / statCols

  return {
    width: w, flexDirection: 'column', padding: innerPad, gap: 24,
    children: [
      // Header
      {
        flexDirection: 'column', gap: 8,
        children: [
          { text: 'Textura', font: `700 ${fontSize + 16}px Inter`, lineHeight: Math.round((fontSize + 16) * 1.15) } satisfies TextNode,
          { text: 'DOM-Free Layout Engine', font: `300 ${fontSize + 6}px Inter`, lineHeight: Math.round((fontSize + 6) * 1.4) } satisfies TextNode,
          { text: 'Pixel-perfect text measurement meets flexbox layout — compute exact positions for every element without touching the browser\'s layout system.', font: `${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.6) } satisfies TextNode,
        ],
      } satisfies BoxNode,
      // Feature cards
      {
        flexDirection: 'row', flexWrap: 'wrap', gap: cardGap,
        children: [
          {
            flexDirection: 'column', width: cardW, padding: 20, gap: 10,
            children: [
              { width: 36, height: 36 },
              { text: 'Canvas Rendering', font: `600 ${fontSize + 1}px Inter`, lineHeight: Math.round((fontSize + 1) * 1.3) } satisfies TextNode,
              { text: 'Build complete UIs on canvas or WebGL. Chat apps, data grids, game HUDs — full flexbox layout with accurate text wrapping, no DOM required.', font: `${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.55) } satisfies TextNode,
            ],
          } satisfies BoxNode,
          {
            flexDirection: 'column', width: cardW, padding: 20, gap: 10,
            children: [
              { width: 36, height: 36 },
              { text: 'Worker Thread', font: `600 ${fontSize + 1}px Inter`, lineHeight: Math.round((fontSize + 1) * 1.3) } satisfies TextNode,
              { text: 'Move layout computation entirely off the main thread. The UI never blocks on measurement. Send only coordinates to the main thread for painting.', font: `${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.55) } satisfies TextNode,
            ],
          } satisfies BoxNode,
          {
            flexDirection: 'column', width: cardW, padding: 20, gap: 10,
            children: [
              { width: 36, height: 36 },
              { text: 'Server-Side Layout', font: `600 ${fontSize + 1}px Inter`, lineHeight: Math.round((fontSize + 1) * 1.3) } satisfies TextNode,
              { text: 'Pre-compute pixel positions on the server. Eliminate layout shift. SSR that knows where everything goes before the first paint.', font: `${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.55) } satisfies TextNode,
            ],
          } satisfies BoxNode,
        ],
      } satisfies BoxNode,
      // Pull quote
      {
        flexDirection: 'column', padding: 24, gap: 8,
        children: [
          { text: '"We eliminated 100% of our layout shift by pre-computing exact heights for every component before the first paint. The entire virtual list — 50,000 rows — renders with a pixel-perfect scrollbar from frame one."', font: `italic ${fontSize + 1}px Inter`, lineHeight: Math.round((fontSize + 1) * 1.65) } satisfies TextNode,
          { text: '— Engineering Lead, Series C Startup', font: `500 ${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.4) } satisfies TextNode,
        ],
      } satisfies BoxNode,
      // Stats row
      {
        flexDirection: 'row', flexWrap: 'wrap', gap: statGap,
        children: [
          { flexDirection: 'column', width: statW, padding: 16, gap: 4, alignItems: 'center',
            children: [
              { text: '7,680', font: `700 ${fontSize + 8}px Inter`, lineHeight: Math.round((fontSize + 8) * 1.2) } satisfies TextNode,
              { text: 'Accuracy tests', font: `${fontSize - 2}px Inter`, lineHeight: Math.round((fontSize - 2) * 1.4) } satisfies TextNode,
            ],
          } satisfies BoxNode,
          { flexDirection: 'column', width: statW, padding: 16, gap: 4, alignItems: 'center',
            children: [
              { text: '0ms', font: `700 ${fontSize + 8}px Inter`, lineHeight: Math.round((fontSize + 8) * 1.2) } satisfies TextNode,
              { text: 'Layout shift', font: `${fontSize - 2}px Inter`, lineHeight: Math.round((fontSize - 2) * 1.4) } satisfies TextNode,
            ],
          } satisfies BoxNode,
          { flexDirection: 'column', width: statW, padding: 16, gap: 4, alignItems: 'center',
            children: [
              { text: '0', font: `700 ${fontSize + 8}px Inter`, lineHeight: Math.round((fontSize + 8) * 1.2) } satisfies TextNode,
              { text: 'DOM nodes', font: `${fontSize - 2}px Inter`, lineHeight: Math.round((fontSize - 2) * 1.4) } satisfies TextNode,
            ],
          } satisfies BoxNode,
          { flexDirection: 'column', width: statW, padding: 16, gap: 4, alignItems: 'center',
            children: [
              { text: '60fps', font: `700 ${fontSize + 8}px Inter`, lineHeight: Math.round((fontSize + 8) * 1.2) } satisfies TextNode,
              { text: 'Animation', font: `${fontSize - 2}px Inter`, lineHeight: Math.round((fontSize - 2) * 1.4) } satisfies TextNode,
            ],
          } satisfies BoxNode,
        ],
      } satisfies BoxNode,
      // Footer
      {
        flexDirection: 'row', justifyContent: 'space-between',
        children: [
          { text: 'razroo.com/textura', font: `500 ${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.4) } satisfies TextNode,
          { text: '© 2025 Razroo', font: `${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.4) } satisfies TextNode,
        ],
      } satisfies BoxNode,
    ],
  }
}

function renderPosterNode(
  ctx: CanvasRenderingContext2D,
  layout: ComputedLayout,
  tree: BoxNode | TextNode,
  ox: number,
  oy: number,
  isYoga: boolean,
) {
  const x = ox + layout.x
  const y = oy + layout.y
  const w = layout.width
  const h = layout.height
  const isTextNode = layout.text !== undefined

  // Icon placeholder (36x36 boxes)
  if (!isTextNode && layout.children.length === 0 && w >= 32 && w <= 40 && h >= 32 && h <= 40) {
    ctx.fillStyle = '#e94560'
    roundRect(ctx, x, y, w, h, 8)
    ctx.fill()
    ctx.fillStyle = '#fff'
    roundRect(ctx, x + w / 2 - 5, y + h / 2 - 5, 10, 10, 2)
    ctx.fill()
    return
  }

  // Card / section backgrounds
  if (!isTextNode && 'padding' in tree && layout.children.length > 0) {
    const pad = tree.padding as number
    if (pad === 20) {
      // Feature card
      ctx.fillStyle = '#fff'
      roundRect(ctx, x, y, w, h, 10)
      ctx.fill()
      ctx.strokeStyle = '#e8e8ec'
      ctx.lineWidth = 1
      roundRect(ctx, x, y, w, h, 10)
      ctx.stroke()
    } else if (pad === 24) {
      // Quote section
      ctx.fillStyle = '#f8f5ff'
      roundRect(ctx, x, y, w, h, 10)
      ctx.fill()
      ctx.fillStyle = '#e94560'
      roundRect(ctx, x, y, 4, h, 2)
      ctx.fill()
    } else if (pad === 16) {
      // Stats card
      ctx.fillStyle = '#f5f5f7'
      roundRect(ctx, x, y, w, h, 8)
      ctx.fill()
    }
  }

  // Text
  if (isTextNode) {
    const tn = tree as TextNode
    const font = tn.font
    const lineHeight = tn.lineHeight
    const fontSizeMatch = font.match(/(\d+)px/)
    const fSize = fontSizeMatch ? parseInt(fontSizeMatch[1]!) : 14
    const isBold700 = font.includes('700')
    const isBold600 = font.includes('600')
    const isItalic = font.includes('italic')

    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()

    ctx.font = font
    if (isBold700 && fSize > 24) ctx.fillStyle = '#e94560'      // big title
    else if (isBold700 && fSize > 16) ctx.fillStyle = '#111'     // stat numbers
    else if (isBold600) ctx.fillStyle = '#222'                    // card titles
    else if (isItalic) ctx.fillStyle = '#444'                     // quote
    else if (font.includes('300')) ctx.fillStyle = '#666'         // subtitle
    else if (fSize <= 12) ctx.fillStyle = '#888'                  // small labels
    else if (font.includes('500')) ctx.fillStyle = '#555'         // attribution/footer
    else ctx.fillStyle = '#444'                                   // body

    const text = layout.text!
    const words = text.split(' ')
    let line = ''
    let ly = y + lineHeight * 0.76

    for (const word of words) {
      const test = line ? `${line} ${word}` : word
      if (ctx.measureText(test).width > w && line) {
        ctx.fillText(line, x, ly)
        line = word
        ly += lineHeight
      } else {
        line = test
      }
    }
    if (line) ctx.fillText(line, x, ly)

    ctx.restore()

    if (isYoga && ly + lineHeight * 0.24 > y + h + 2) {
      ctx.fillStyle = '#ef444440'
      ctx.fillRect(x, y + h, w, ly + lineHeight * 0.24 - (y + h))
    }
    return
  }

  // Recurse
  const children = ('children' in tree) ? (tree as BoxNode).children ?? [] : []
  for (let i = 0; i < layout.children.length; i++) {
    if (children[i]) {
      renderPosterNode(ctx, layout.children[i]!, children[i]!, x, y, isYoga)
    }
  }
}

function renderEditor() {
  const fontSize = parseInt(fontSlider.value)
  const w = editorPosterWidth
  const tree = buildEditorTree(w, fontSize)

  const t0 = performance.now()
  const texturaLayout = computeLayout(tree, { width: w })
  const texturaTime = performance.now() - t0

  const { layout: yogaLayout, time: yogaTime } = yogaLayoutTree(tree, w, fontSize)

  const posterH = Math.max(texturaLayout.height, yogaLayout.height)
  const canvasH = Math.min(posterH + 60, 900)

  const ctxY = setupCanvas(canvasYoga, canvasH)
  const ctxT = setupCanvas(canvasTextura, canvasH)
  const panelW = canvasYoga.clientWidth

  // Canvas backgrounds with dot grid
  for (const ctx of [ctxY, ctxT]) {
    ctx.fillStyle = '#1a1a1e'
    ctx.fillRect(0, 0, panelW, canvasH)
    ctx.fillStyle = '#252529'
    for (let gx = 0; gx < panelW; gx += 16) {
      for (let gy = 0; gy < canvasH; gy += 16) {
        ctx.fillRect(gx, gy, 1, 1)
      }
    }
  }

  const offsetX = Math.max(16, (panelW - w) / 2)
  const offsetY = 20

  // Poster backgrounds with shadow
  for (const [ctx, layout] of [[ctxY, yogaLayout], [ctxT, texturaLayout]] as const) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    roundRect(ctx, offsetX + 3, offsetY + 3, w, layout.height, 6)
    ctx.fill()
    ctx.fillStyle = '#fafafa'
    roundRect(ctx, offsetX, offsetY, w, layout.height, 6)
    ctx.fill()
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1
    roundRect(ctx, offsetX, offsetY, w, layout.height, 6)
    ctx.stroke()
  }

  // Render content
  renderPosterNode(ctxY, yogaLayout, tree, offsetX, offsetY, true)
  renderPosterNode(ctxT, texturaLayout, tree, offsetX, offsetY, false)

  // Resize handle on Textura side (right edge)
  const handleX = offsetX + w
  const handleH = texturaLayout.height
  ctxT.fillStyle = '#3b82f6'
  roundRect(ctxT, handleX - 3, offsetY + handleH / 2 - 24, 6, 48, 3)
  ctxT.fill()
  ctxT.fillStyle = '#fff'
  for (let dy = -8; dy <= 8; dy += 8) {
    ctxT.beginPath()
    ctxT.arc(handleX, offsetY + handleH / 2 + dy, 1.5, 0, Math.PI * 2)
    ctxT.fill()
  }

  // Dimmer handle on Yoga side
  ctxY.fillStyle = '#3b82f680'
  roundRect(ctxY, offsetX + w - 3, offsetY + yogaLayout.height / 2 - 24, 6, 48, 3)
  ctxY.fill()

  // Width indicator
  ctxT.save()
  ctxT.font = '500 11px Inter'
  const wText = `${w}px`
  const wtw = ctxT.measureText(wText).width
  ctxT.fillStyle = 'rgba(59,130,246,0.9)'
  roundRect(ctxT, offsetX + w / 2 - wtw / 2 - 6, offsetY - 18, wtw + 12, 16, 3)
  ctxT.fill()
  ctxT.fillStyle = '#fff'
  ctxT.fillText(wText, offsetX + w / 2 - wtw / 2, offsetY - 6)
  ctxT.restore()

  // Frame time overlay
  ctxT.save()
  ctxT.font = '600 11px Inter'
  const ftText = `Layout: ${texturaTime.toFixed(2)}ms · 0 DOM nodes`
  const ftw = ctxT.measureText(ftText).width
  ctxT.fillStyle = 'rgba(0,0,0,0.7)'
  roundRect(ctxT, panelW - ftw - 20, 8, ftw + 12, 20, 4)
  ctxT.fill()
  ctxT.fillStyle = '#4ade80'
  ctxT.fillText(ftText, panelW - ftw - 14, 22)
  ctxT.restore()

  // Stats
  const overlaps = countOverlaps(yogaLayout, tree, ctxY)
  const heightDiff = Math.abs(texturaLayout.height - yogaLayout.height)

  document.getElementById('yoga-time')!.textContent = `Layout: ${yogaTime.toFixed(2)}ms (wrong)`
  document.getElementById('yoga-nodes')!.textContent = `Height: ${Math.round(yogaLayout.height)}px`
  document.getElementById('textura-time')!.textContent = `Layout: ${texturaTime.toFixed(2)}ms (accurate)`
  document.getElementById('textura-nodes')!.textContent = `Height: ${Math.round(texturaLayout.height)}px`

  document.getElementById('stat-overlap')!.textContent = `${overlaps}`
  document.getElementById('stat-height-diff')!.textContent = `${Math.round(heightDiff)}px`
  document.getElementById('stat-resize-time')!.textContent = `${texturaTime.toFixed(2)}ms`
  document.getElementById('stat-dom-time')!.textContent = `0`

  document.getElementById('insight-text')!.innerHTML = insights['editor']
}

// Editor drag interaction
function editorGetHandleX(canvas: HTMLCanvasElement): number {
  const panelW = canvas.clientWidth
  return Math.max(16, (panelW - editorPosterWidth) / 2) + editorPosterWidth
}

canvasTextura.addEventListener('mousedown', (e) => {
  if (scenarioSelect.value !== 'editor') return
  const rect = canvasTextura.getBoundingClientRect()
  const mx = e.clientX - rect.left
  if (Math.abs(mx - editorGetHandleX(canvasTextura)) < 12) {
    editorDragging = true
    e.preventDefault()
  }
})

document.addEventListener('mousemove', (e) => {
  if (scenarioSelect.value !== 'editor') return
  if (editorDragging) {
    const rect = canvasTextura.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const panelW = canvasTextura.clientWidth
    const offsetX = Math.max(16, (panelW - editorPosterWidth) / 2)
    editorPosterWidth = Math.max(280, Math.min(860, Math.round(mx - offsetX)))
    widthSlider.value = String(Math.min(parseInt(widthSlider.max), editorPosterWidth))
    widthLabel.textContent = `${editorPosterWidth}px`
    renderEditor()
    e.preventDefault()
  } else {
    const rect = canvasTextura.getBoundingClientRect()
    const mx = e.clientX - rect.left
    canvasTextura.style.cursor = Math.abs(mx - editorGetHandleX(canvasTextura)) < 12 ? 'col-resize' : 'default'
  }
})

document.addEventListener('mouseup', () => {
  if (editorDragging) {
    editorDragging = false
    canvasTextura.style.cursor = 'default'
  }
})

// ── AI Streaming ──────────────────────────────────────────────

// The full AI-generated report — streamed token by token
interface StreamSection {
  type: 'heading' | 'subheading' | 'paragraph' | 'kpi-row' | 'cards-row'
  text?: string                   // for heading/subheading/paragraph
  items?: { label: string; value: string; body?: string }[]  // for kpi-row/cards-row
}

const aiReportSections: StreamSection[] = [
  { type: 'heading', text: 'Q4 Performance Analysis' },
  { type: 'subheading', text: 'AI-Generated Report — Streaming in Real Time' },
  { type: 'paragraph', text: 'This report was generated by analyzing 2.4 million data points across product usage, revenue metrics, and customer feedback. All findings are computed with 95% confidence intervals. The layout you see is being built token by token, with Textura recomputing the full flexbox layout on every single token — titles, cards, statistics, and paragraphs all reflow in under 1ms.' },
  { type: 'kpi-row', items: [
    { label: 'Revenue', value: '$12.4M' },
    { label: 'Active Users', value: '847K' },
    { label: 'Retention', value: '94.2%' },
    { label: 'NPS Score', value: '72' },
  ]},
  { type: 'paragraph', text: 'Revenue grew 23% quarter-over-quarter, driven primarily by enterprise expansion. The APAC region showed the strongest growth at 41%, while North America remained the largest market by absolute revenue. Customer acquisition cost decreased 12% due to improved organic channels and referral programs.' },
  { type: 'cards-row', items: [
    { label: 'Expand APAC Presence', value: 'High Priority', body: 'The APAC market showed 41% growth with minimal marketing spend. Recommend doubling investment in localization and regional partnerships to capture the growing demand.' },
    { label: 'Mobile Experience', value: 'Medium Priority', body: 'Mobile usage grew to 62% of total sessions but conversion remains 34% lower than desktop. A dedicated mobile optimization sprint would close this gap.' },
    { label: 'Enterprise Onboarding', value: 'High Priority', body: 'Enterprise deal cycle shortened from 45 to 28 days after the new onboarding flow launched. Further automation of provisioning could reduce this to under 14 days.' },
  ]},
  { type: 'paragraph', text: 'Looking ahead to Q1, the primary risk is infrastructure scaling. Current architecture supports 1.2M concurrent users, but projected growth suggests we will hit 1.8M by March. The engineering team has proposed a migration to edge computing that would raise the ceiling to 5M while reducing p99 latency from 180ms to under 50ms. This migration is estimated at 6 engineering-weeks and should be prioritized immediately.' },
]

// Flatten all text into a token stream with section markers
interface StreamToken {
  sectionIdx: number
  itemIdx?: number    // for kpi/cards items
  field: 'text' | 'label' | 'value' | 'body'
  word: string
  wordIdx: number
  totalWords: number
}

function buildTokenStream(): StreamToken[] {
  const tokens: StreamToken[] = []
  for (let si = 0; si < aiReportSections.length; si++) {
    const sec = aiReportSections[si]!
    if (sec.text) {
      const words = sec.text.split(' ')
      for (let wi = 0; wi < words.length; wi++) {
        tokens.push({ sectionIdx: si, field: 'text', word: words[wi]!, wordIdx: wi, totalWords: words.length })
      }
    }
    if (sec.items) {
      for (let ii = 0; ii < sec.items.length; ii++) {
        const item = sec.items[ii]!
        // Value and label come as single tokens
        tokens.push({ sectionIdx: si, itemIdx: ii, field: 'value', word: item.value, wordIdx: 0, totalWords: 1 })
        const labelWords = item.label.split(' ')
        for (let wi = 0; wi < labelWords.length; wi++) {
          tokens.push({ sectionIdx: si, itemIdx: ii, field: 'label', word: labelWords[wi]!, wordIdx: wi, totalWords: labelWords.length })
        }
        if (item.body) {
          const bodyWords = item.body.split(' ')
          for (let wi = 0; wi < bodyWords.length; wi++) {
            tokens.push({ sectionIdx: si, itemIdx: ii, field: 'body', word: bodyWords[wi]!, wordIdx: wi, totalWords: bodyWords.length })
          }
        }
      }
    }
  }
  return tokens
}

const aiTokenStream = buildTokenStream()

// State tracking for streamed content
let aiStreamIntervalId: ReturnType<typeof setInterval> | null = null
let aiStreamTokenIdx = 0
let aiStreamTexts: Map<string, string> = new Map() // key -> accumulated text
let aiStreamPrevYogaHeights: Map<number, number> = new Map() // section idx -> last yoga height
let aiStreamShiftCount = 0
let aiStreamLastLayoutTime = 0

function aiStreamKey(token: StreamToken): string {
  if (token.itemIdx !== undefined) return `${token.sectionIdx}-${token.itemIdx}-${token.field}`
  return `${token.sectionIdx}-${token.field}`
}

function buildAiStreamTree(w: number, fontSize: number): BoxNode {
  const innerPad = 24
  const innerW = w - innerPad * 2
  const children: (BoxNode | TextNode)[] = []

  for (let si = 0; si <= Math.min(aiReportSections.length - 1, getMaxVisibleSection()); si++) {
    const sec = aiReportSections[si]!

    if (sec.type === 'heading') {
      const text = aiStreamTexts.get(`${si}-text`) ?? ''
      if (text) children.push({ text, font: `700 ${fontSize + 10}px Inter`, lineHeight: Math.round((fontSize + 10) * 1.25) } satisfies TextNode)
    } else if (sec.type === 'subheading') {
      const text = aiStreamTexts.get(`${si}-text`) ?? ''
      if (text) children.push({ text, font: `${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.5) } satisfies TextNode)
    } else if (sec.type === 'paragraph') {
      const text = aiStreamTexts.get(`${si}-text`) ?? ''
      if (text) children.push({ text, font: `${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.6), marginBottom: 8 } satisfies TextNode)
    } else if (sec.type === 'kpi-row' && sec.items) {
      const kpiCards: BoxNode[] = []
      const cols = w >= 500 ? 4 : 2
      const kpiW = (innerW - 10 * (cols - 1)) / cols
      for (let ii = 0; ii < sec.items.length; ii++) {
        const val = aiStreamTexts.get(`${si}-${ii}-value`) ?? ''
        const label = aiStreamTexts.get(`${si}-${ii}-label`) ?? ''
        if (!val && !label) continue
        const kpiChildren: (BoxNode | TextNode)[] = []
        if (val) kpiChildren.push({ text: val, font: `700 ${fontSize + 6}px Inter`, lineHeight: Math.round((fontSize + 6) * 1.2) } satisfies TextNode)
        if (label) kpiChildren.push({ text: label, font: `${fontSize - 2}px Inter`, lineHeight: Math.round((fontSize - 2) * 1.4) } satisfies TextNode)
        kpiCards.push({ flexDirection: 'column', width: kpiW, padding: 14, gap: 4, alignItems: 'center', children: kpiChildren })
      }
      if (kpiCards.length > 0) {
        children.push({ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8, children: kpiCards } satisfies BoxNode)
      }
    } else if (sec.type === 'cards-row' && sec.items) {
      const cards: BoxNode[] = []
      const cols = w >= 550 ? 3 : w >= 380 ? 2 : 1
      const cardW = (innerW - 12 * (cols - 1)) / cols
      for (let ii = 0; ii < sec.items.length; ii++) {
        const val = aiStreamTexts.get(`${si}-${ii}-value`) ?? ''
        const label = aiStreamTexts.get(`${si}-${ii}-label`) ?? ''
        const body = aiStreamTexts.get(`${si}-${ii}-body`) ?? ''
        if (!val && !label && !body) continue
        const cardChildren: (BoxNode | TextNode)[] = []
        if (val) cardChildren.push({ text: val, font: `600 ${fontSize - 2}px Inter`, lineHeight: Math.round((fontSize - 2) * 1.3) } satisfies TextNode)
        if (label) cardChildren.push({ text: label, font: `600 ${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.3) } satisfies TextNode)
        if (body) cardChildren.push({ text: body, font: `${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.55) } satisfies TextNode)
        cards.push({ flexDirection: 'column', width: cardW, padding: 16, gap: 6, children: cardChildren })
      }
      if (cards.length > 0) {
        children.push({ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8, children: cards } satisfies BoxNode)
      }
    }
  }

  return { width: w, flexDirection: 'column', padding: innerPad, gap: 10, children }
}

function getMaxVisibleSection(): number {
  let max = -1
  for (const key of aiStreamTexts.keys()) {
    const si = parseInt(key.split('-')[0]!)
    if (si > max) max = si
  }
  return max
}

function renderAiStream() {
  const containerWidth = parseInt(widthSlider.value)
  const fontSize = parseInt(fontSlider.value)
  const tree = buildAiStreamTree(containerWidth, fontSize)

  const t0 = performance.now()
  const texturaLayout = computeLayout(tree, { width: containerWidth })
  aiStreamLastLayoutTime = performance.now() - t0

  const { layout: yogaLayout, time: yogaTime } = yogaLayoutTree(tree, containerWidth, fontSize)

  // Track layout shifts on the Yoga side
  // Compare per-section heights to previous frame
  function measureSectionHeights(layout: ComputedLayout): Map<number, number> {
    const heights = new Map<number, number>()
    for (let i = 0; i < layout.children.length; i++) {
      heights.set(i, layout.children[i]!.height)
    }
    return heights
  }
  const yogaSectionHeights = measureSectionHeights(yogaLayout)
  for (const [idx, h] of yogaSectionHeights) {
    const prev = aiStreamPrevYogaHeights.get(idx)
    if (prev !== undefined && Math.abs(prev - h) > 3) {
      aiStreamShiftCount++
    }
  }
  aiStreamPrevYogaHeights = yogaSectionHeights

  // Render
  const maxHeight = Math.max(texturaLayout.height, yogaLayout.height, 200)
  const canvasH = Math.min(maxHeight + 20, 800)

  const ctxY = setupCanvas(canvasYoga, canvasH)
  const ctxT = setupCanvas(canvasTextura, canvasH)
  const panelW = canvasYoga.clientWidth
  const offsetX = Math.max(0, (panelW - containerWidth) / 2)

  // Backgrounds
  ctxY.fillStyle = palette.bg
  ctxY.fillRect(0, 0, panelW, canvasH)
  ctxT.fillStyle = palette.bg
  ctxT.fillRect(0, 0, panelW, canvasH)

  // Use the editor-style poster rendering for a clean look
  renderLayout(ctxY, yogaLayout, tree, offsetX, 10, 'aistream', true)
  renderLayout(ctxT, texturaLayout, tree, offsetX, 10, 'aistream', false)

  // Streaming cursor on textura side (blinking block at end of last text)
  if (aiStreamTokenIdx < aiTokenStream.length) {
    drawStreamCursor(ctxT, texturaLayout, offsetX, 10)
  }

  // Stats overlays
  drawFpsOverlay(ctxY, panelW, yogaTime, 'Yoga')
  drawFpsOverlay(ctxT, panelW, aiStreamLastLayoutTime, 'Textura')

  // Update DOM stats
  document.getElementById('yoga-time')!.textContent = `Layout: ${yogaTime.toFixed(2)}ms (estimated)`
  document.getElementById('yoga-nodes')!.textContent = `Height: ${Math.round(yogaLayout.height)}px`
  document.getElementById('textura-time')!.textContent = `Layout: ${aiStreamLastLayoutTime.toFixed(2)}ms (accurate)`
  document.getElementById('textura-nodes')!.textContent = `Height: ${Math.round(texturaLayout.height)}px`

  const overlaps = countOverlaps(yogaLayout, tree, ctxY)
  const heightDiff = Math.abs(texturaLayout.height - yogaLayout.height)

  document.getElementById('stat-overlap')!.textContent = `${overlaps}`
  document.getElementById('stat-height-diff')!.textContent = `${Math.round(heightDiff)}px`
  document.getElementById('stat-resize-time')!.textContent = `${aiStreamLastLayoutTime.toFixed(2)}ms`
  document.getElementById('stat-dom-time')!.textContent = `${aiStreamTokenIdx}`

  // Update aistream bar
  document.getElementById('aistream-tokens')!.textContent = `${aiStreamTokenIdx}`
  document.getElementById('aistream-layout-time')!.textContent = `${aiStreamLastLayoutTime.toFixed(2)}ms`
  document.getElementById('aistream-shift')!.textContent = `${aiStreamShiftCount}`
  const pct = (aiStreamTokenIdx / aiTokenStream.length) * 100
  document.getElementById('aistream-progress')!.style.width = `${pct}%`

  document.getElementById('insight-text')!.innerHTML = insights['aistream']
}

function drawStreamCursor(ctx: CanvasRenderingContext2D, layout: ComputedLayout, ox: number, oy: number) {
  // Find the last text node in the layout tree
  function findLastText(l: ComputedLayout, px: number, py: number): { x: number; y: number; h: number } | null {
    const ax = px + l.x
    const ay = py + l.y
    if (l.text !== undefined) {
      return { x: ax + l.width, y: ay, h: l.height }
    }
    for (let i = l.children.length - 1; i >= 0; i--) {
      const r = findLastText(l.children[i]!, ax, ay)
      if (r) return r
    }
    return null
  }
  const pos = findLastText(layout, ox, oy)
  if (!pos) return

  // Blinking cursor
  if (Math.floor(performance.now() / 500) % 2 === 0) {
    ctx.fillStyle = '#e94560'
    ctx.fillRect(pos.x + 2, pos.y + 2, 2, Math.min(pos.h - 4, 18))
  }
}

function startAiStream() {
  document.getElementById('aistream-bar')!.classList.add('active')
  const btn = document.getElementById('aistream-btn')!

  if (aiStreamIntervalId !== null) {
    // Stop
    stopAiStream()
    return
  }

  // Reset
  aiStreamTokenIdx = 0
  aiStreamTexts.clear()
  aiStreamPrevYogaHeights.clear()
  aiStreamShiftCount = 0
  aiStreamLastLayoutTime = 0

  btn.textContent = 'Stop'
  btn.classList.add('running')

  renderAiStream()

  // Stream at ~40 tokens/second (realistic LLM speed)
  aiStreamIntervalId = setInterval(() => {
    if (aiStreamTokenIdx >= aiTokenStream.length) {
      stopAiStream()
      return
    }

    // Process 1-2 tokens per tick for natural feel
    const tokensPerTick = 1 + (aiStreamTokenIdx % 3 === 0 ? 1 : 0)
    for (let t = 0; t < tokensPerTick && aiStreamTokenIdx < aiTokenStream.length; t++) {
      const token = aiTokenStream[aiStreamTokenIdx]!
      const key = aiStreamKey(token)
      const prev = aiStreamTexts.get(key) ?? ''
      aiStreamTexts.set(key, prev ? `${prev} ${token.word}` : token.word)
      aiStreamTokenIdx++
    }

    renderAiStream()
  }, 25)
}

function stopAiStream() {
  if (aiStreamIntervalId !== null) {
    clearInterval(aiStreamIntervalId)
    aiStreamIntervalId = null
  }
  const btn = document.getElementById('aistream-btn')!
  btn.textContent = aiStreamTokenIdx >= aiTokenStream.length ? 'Replay' : 'Generate'
  btn.classList.remove('running')
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

// ── Routing ───────────────────────────────────────────────────

const validScenarios = new Set<ScenarioKey>(['chat', 'cards', 'i18n', 'article', 'stress', 'morph', 'vscroll', 'editor', 'aistream'])

function getScenarioFromHash(): ScenarioKey | null {
  const hash = location.hash.replace('#', '')
  return validScenarios.has(hash as ScenarioKey) ? hash as ScenarioKey : null
}

function setHashFromScenario(scenario: ScenarioKey) {
  history.replaceState(null, '', `#${scenario}`)
}

// ── Events ─────────────────────────────────────────────────────

function activateScenario(scenario: ScenarioKey) {
  stopMorph()
  stopVScroll()
  stopAiStream()
  document.getElementById('aistream-bar')!.classList.remove('active')

  if (scenario === 'morph') {
    widthSlider.disabled = true
    widthSlider.style.opacity = '0.3'
    startMorph()
  } else if (scenario === 'vscroll') {
    widthSlider.disabled = false
    widthSlider.style.opacity = '1'
    startVScroll()
  } else if (scenario === 'editor') {
    widthSlider.disabled = false
    widthSlider.style.opacity = '1'
    editorPosterWidth = parseInt(widthSlider.value)
    renderEditor()
  } else if (scenario === 'aistream') {
    widthSlider.disabled = false
    widthSlider.style.opacity = '1'
    document.getElementById('aistream-bar')!.classList.add('active')
    // Reset and show empty state
    aiStreamTokenIdx = 0
    aiStreamTexts.clear()
    aiStreamPrevYogaHeights.clear()
    aiStreamShiftCount = 0
    renderAiStream()
  } else {
    widthSlider.disabled = false
    widthSlider.style.opacity = '1'
    render()
  }
}

function onScenarioChange() {
  const scenario = scenarioSelect.value as ScenarioKey
  setHashFromScenario(scenario)
  activateScenario(scenario)
}

// Apply initial scenario from hash or default
const initialScenario = getScenarioFromHash()
if (initialScenario) {
  scenarioSelect.value = initialScenario
}
setHashFromScenario(scenarioSelect.value as ScenarioKey)
activateScenario(scenarioSelect.value as ScenarioKey)

window.addEventListener('hashchange', () => {
  const scenario = getScenarioFromHash()
  if (scenario && scenario !== scenarioSelect.value) {
    scenarioSelect.value = scenario
    activateScenario(scenario)
  }
})

widthSlider.addEventListener('input', () => {
  widthLabel.textContent = `${widthSlider.value}px`
  if (scenarioSelect.value === 'vscroll') {
    const w = parseInt(widthSlider.value)
    const fs = parseInt(fontSlider.value)
    vscrollState = computeVScrollHeights(w, fs)
    vscrollTop = 0
    renderVScroll()
  } else if (scenarioSelect.value === 'editor') {
    editorPosterWidth = parseInt(widthSlider.value)
    renderEditor()
  } else if (scenarioSelect.value === 'aistream') {
    renderAiStream()
  } else {
    render()
  }
})

fontSlider.addEventListener('input', () => {
  fontLabel.textContent = `${fontSlider.value}px`
  if (scenarioSelect.value === 'morph') return
  if (scenarioSelect.value === 'aistream') { renderAiStream(); return }
  if (scenarioSelect.value === 'vscroll') {
    const w = parseInt(widthSlider.value)
    const fs = parseInt(fontSlider.value)
    vscrollState = computeVScrollHeights(w, fs)
    vscrollTop = 0
    renderVScroll()
    return
  }
  if (scenarioSelect.value === 'editor') { renderEditor(); return }
  render()
})

scenarioSelect.addEventListener('change', onScenarioChange)

window.addEventListener('resize', () => {
  if (scenarioSelect.value === 'morph') return
  if (scenarioSelect.value === 'vscroll') { renderVScroll(); return }
  if (scenarioSelect.value === 'editor') { renderEditor(); return }
  if (scenarioSelect.value === 'aistream') { renderAiStream(); return }
  render()
})

// Wheel scrolling for virtual scroll
function onWheel(e: WheelEvent) {
  if (scenarioSelect.value !== 'vscroll' || !vscrollState) return
  e.preventDefault()
  vscrollTop += e.deltaY
  renderVScroll()
}

canvasYoga.addEventListener('wheel', onWheel, { passive: false })
canvasTextura.addEventListener('wheel', onWheel, { passive: false })

// Jump-to-index
document.getElementById('vscroll-jump-btn')!.addEventListener('click', () => {
  if (!vscrollState) return
  const input = document.getElementById('vscroll-jump-input') as HTMLInputElement
  const idx = Math.max(0, Math.min(VSCROLL_ITEM_COUNT - 1, parseInt(input.value) - 1))
  vscrollTop = vscrollState.texturaPrefixSums[idx]!
  renderVScroll()
})

document.getElementById('vscroll-jump-input')!.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('vscroll-jump-btn')!.click()
  }
})

// AI stream generate button
document.getElementById('aistream-btn')!.addEventListener('click', startAiStream)
