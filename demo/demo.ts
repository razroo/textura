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

type ScenarioKey = 'chat' | 'cards' | 'i18n' | 'article' | 'stress' | 'morph' | 'vscroll' | 'editor' | 'aistream' | 'synth' | 'agent' | 'critic' | 'worldmodel'
const builders: Record<Exclude<ScenarioKey, 'vscroll' | 'editor' | 'aistream' | 'synth' | 'agent' | 'critic' | 'worldmodel'>, (w: number, fs: number) => BoxNode> = {
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
  if (hasCardStyle && (scenario === 'chat' || scenario === 'i18n' || scenario === 'stress' || scenario === 'morph' || scenario === 'aistream' || scenario === 'synth' || scenario === 'agent' || scenario === 'critic' || scenario === 'worldmodel')) {
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
      (scenario === 'aistream' && 'padding' in tree && (tree.padding === 14 || tree.padding === 16) && !isText && layout.children.length > 0 && layout.children.length <= 3) ||
      (scenario === 'synth' && 'padding' in tree && (tree.padding === 12 || tree.padding === 16) && !isText && layout.children.length > 0 && layout.children.length <= 3)) {
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

const yogaLink = '<a href="https://github.com/facebook/yoga" target="_blank" rel="noopener" style="color:#a1a1aa;text-decoration:underline;text-underline-offset:2px">Yoga</a>'
const pretextLink = '<a href="https://www.npmjs.com/package/@chenglou/pretext" target="_blank" rel="noopener" style="color:#a1a1aa;text-decoration:underline;text-underline-offset:2px">Pretext</a>'

const insights: Record<ScenarioKey, string> = {
  chat: `<p><strong>Chat messages</strong> have wildly variable text lengths. ${yogaLink} alone must guess heights — typically using a characters-per-line heuristic. Drag the width slider narrow and watch the left side: text overflows its boxes (shown in <span style="color:#ef4444">red</span>) because the estimate doesn't account for actual word wrapping, font metrics, or mixed-width characters.</p>
<p>Textura on the right measures every text node accurately via canvas measureText. Each message card's height matches its actual content — no overflow, no wasted space, no layout shift.</p>`,

  cards: `<p><strong>Content cards in a flex-wrap grid</strong> expose the estimation problem differently. Each card has a title and body with different font weights and sizes. ${yogaLink}'s heuristic applies the same characters-per-line ratio to bold headings and body text, even though a bold "W" is much wider than a regular "i".</p>
<p>Textura measures each text node with its actual font, so cards are sized precisely. This is the kind of layout you'd use for dashboards, feature grids, or product listings.</p>`,

  i18n: `<p><strong>Multilingual text</strong> is where ${yogaLink}'s estimation completely breaks down. Japanese and Chinese use full-width characters (~2x the width of Latin). Thai has no spaces between words. Arabic flows right-to-left. A characters-per-line heuristic calibrated for English produces wildly wrong heights for all of these.</p>
<p>Textura uses Intl.Segmenter for language-aware word boundaries and canvas measureText for actual glyph widths. It handles CJK per-character breaking, kinsoku shori (Japanese punctuation rules), and Arabic shaping — all without the DOM.</p>`,

  article: `<p><strong>Long-form article layout</strong> shows the cumulative error problem. Each paragraph's height is slightly wrong when estimated, and those errors compound. By the fifth paragraph, the ${yogaLink} side is significantly off — either overflowing or leaving large gaps.</p>
<p>This is exactly what happens in reading apps, document viewers, and paginated layouts. If you can't predict paragraph heights accurately, you can't paginate, you can't pre-calculate scroll positions, and you can't eliminate layout shift.</p>`,

  stress: `<p><strong>200 variable-length items</strong> — the virtualization use case. Every real virtualized list needs to know row heights before rendering. ${yogaLink} alone forces you to either use fixed heights (ugly), render-then-measure (slow, causes layout shift), or estimate (inaccurate scroll positions, jumpy scrollbar).</p>
<p>Textura's first call includes the one-time <code>prepare()</code> cost (canvas text measurement + segmentation). But on every subsequent resize, the cached hot path runs in <strong>under 1ms for all 200 items</strong>. Compare the "Textura resize" stat to "DOM measurement" — that's the real comparison. DOM measures every element with getBoundingClientRect, triggering layout reflow each time.</p>`,

  vscroll: `<p><strong>The unsolved problem of frontend development.</strong> Every virtualized list needs row heights before rendering, but getting heights requires rendering — a catch-22. The workarounds are all bad: fixed heights (wastes space, truncates text), render-then-measure (slow, causes layout shift), or estimate (wrong scrollbar, jumpy scroll-to-index).</p>
<p>Textura breaks the cycle. It pre-computes <strong>exact pixel heights for all 10,000 items</strong> without rendering a single DOM node. The right side has a perfectly-sized scrollbar from frame one. "Jump to item 5,000" lands on the exact pixel. On the left, estimated heights cause cumulative drift — by item 5,000, you're looking at the wrong item entirely. Try scrolling to the bottom and watch the item numbers diverge. This is why every chat app, email client, and data grid on the web has a janky scrollbar.</p>`,

  editor: `<p><strong>This is the technology behind the next generation of design tools.</strong> Every element on this poster — titles, body text, feature cards, statistics, pull quotes — is laid out using Textura's flexbox engine with pixel-perfect text measurement. The entire layout computation happens in under 1ms. Zero DOM nodes are used.</p>
<p>Drag the blue resize handle on the right edge of the poster (Textura side). Watch cards reflow from 3 columns to 2 to 1. Watch text re-wrap across every container. Watch heights auto-adjust and siblings reposition. This is what Canva, Figma, and every canvas-based design editor has struggled with: <strong>accurate text-aware auto-layout without the DOM</strong>. With Textura, it's a single function call.</p>`,

  critic: `<p><strong>Automated design QA that finds and fixes layout issues — without rendering a single DOM node.</strong> The left side shows a deliberately broken layout with issues: text overflowing boxes, touch targets below 44px, uneven card heights, excessive empty space. Click "Run Critic" and watch the AI analyze the layout using Textura's computed geometry, identify each issue with exact measurements, and fix them one by one.</p>
<p>${yogaLink} alone can detect box overlap but is blind to text overflow — it doesn't know real text heights. ${pretextLink} alone can detect text problems but can't check spatial relationships between elements. Only Textura provides both: <strong>accurate text + accurate layout = complete automated design QA.</strong> This plugs into CI/CD pipelines, AI code generators (v0, Bolt, Lovable), and design systems — catching visual regressions that screenshot-based tools miss, and actually fixing them.</p>`,

  agent: `<p><strong>AI agents that interact with UIs need a world model</strong> — a fast simulator that predicts what the screen looks like after any action. Currently this means a real browser: the agent types text, the browser reflows the DOM (~80ms), the agent observes the new state. At 80ms/step, training over millions of episodes takes months.</p>
<p>Textura is the <strong>physics engine for UI</strong>. Each agent action (type text, add item, resize, toggle section) modifies the layout tree and Textura recomputes in <1ms. That's <strong>80x+ faster than a browser</strong>. Watch the agent take rapid actions — the left side shows ${yogaLink}'s world model giving wrong element positions (agent learns incorrect spatial relationships), while the right side shows Textura giving pixel-perfect observations. The throughput counter shows how many RL training steps per second are possible — thousands, not dozens.</p>`,

  synth: `<p><strong>Training vision-language models and UI agents requires millions of UI screenshots with ground-truth bounding boxes.</strong> Currently this means spinning up headless browsers — slow (~2 layouts/sec), expensive, and hard to scale. With Textura, you generate layouts at hundreds per second on a single thread, with pixel-perfect annotations, no browser needed.</p>
<p>Left canvas shows the <strong>visual render</strong> — what the model sees during training. Right canvas shows <strong>bounding box annotations</strong> — the ground truth metadata (element type, coordinates, dimensions) overlaid on each node. Toggle the view mode to see both perspectives. Each UI is randomly composed with varied layouts, text lengths, and card counts. ${yogaLink} alone produces wrong bounding boxes because text heights are estimated. ${pretextLink} alone can't compute element positions. Only Textura gives both — accurate layout + accurate text — at scale.</p>`,

  aistream: `<p><strong>The AI layout problem.</strong> Every AI product — ChatGPT, Notion AI, Cursor — streams tokens into the UI. The layout needs to update on every token: text grows, paragraphs expand, cards appear, sections push content down. With DOM-based layout, each token triggers a synchronous reflow. For complex documents with cards, stats, and mixed content, this becomes visibly janky.</p>
<p>Textura's cached hot path makes per-token relayout nearly free. After the initial <code>prepare()</code>, every subsequent layout is pure arithmetic over cached segment widths. Watch the left side: ${yogaLink}'s height estimates jump as text grows, causing content below to shift unpredictably. The right side stays perfectly stable — every token produces a correct layout. This enables AI products to stream into <strong>rich, designed layouts</strong> (not just plain text) with zero layout shift.</p>`,

  morph: `<p><strong>This is the demo neither ${yogaLink} nor ${pretextLink} can do alone.</strong> A complete dashboard UI is being continuously re-laid-out at 60fps as the width sweeps from 320px to 900px and back. Every single frame: ${yogaLink} computes the flex layout, ${pretextLink} measures all text at the new available widths, boxes resize, cards reflow from 1 to 2 to 3 columns — all in under 1ms.</p>
<p><strong>${yogaLink} alone</strong> (left) can compute the flex layout but has to guess text heights. Watch the red overflow zones — text spills out of its boxes at every width, and the errors compound as cards reflow. <strong>${pretextLink} alone</strong> can measure text but has no layout engine — it can't compute where boxes go. <strong>The DOM</strong> can't do this at 60fps — continuous relayout triggers synchronous reflow on every frame, dropping to 15–20fps on complex layouts. Only Textura combines both engines to make this possible.</p>`,

  worldmodel: `<p><strong>Small text-only models need accurate spatial data to learn world models.</strong> An LLM generates a room description ("a bookshelf with ancient texts, a warning sign"). Textura lays it out and serializes the geometry as text tokens — the training data a small model receives. Each object gets precise coordinates: <code>BOOKSHELF x=14 y=46 w=185 h=74</code>.</p>
<p>Look at the token output below the canvases. ${yogaLink}'s estimated heights (left, <span style="color:#ef4444">red = wrong</span>) corrupt the training data — the model learns incorrect spatial relationships. Gaps between objects are reported as wider or narrower than they actually are. Textura's accurate heights (right) give ground-truth geometry. <strong>At scale, this is millions of rooms with pixel-perfect coordinates, generated on a single thread, no browser needed.</strong> Click "Generate Rooms" to watch the pipeline produce varied environments.</p>`,
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
  if (scenario === 'vscroll' || scenario === 'editor' || scenario === 'aistream' || scenario === 'synth' || scenario === 'agent' || scenario === 'critic' || scenario === 'worldmodel') return
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

// ── AI Layout Critic ──────────────────────────────────────────

interface CriticIssue {
  type: 'overflow' | 'touch-target' | 'uneven' | 'spacing'
  description: string
  fixed: boolean
  fix: () => void // mutates the broken tree to fix the issue
}

let criticBrokenTree: BoxNode | null = null
let criticIssues: CriticIssue[] = []
let criticFixIdx = 0
let criticIntervalId: ReturnType<typeof setInterval> | null = null

// Build a deliberately broken layout
function buildBrokenTree(w: number, fontSize: number): BoxNode {
  return {
    width: w, flexDirection: 'column', padding: 20, gap: 6,
    children: [
      // Header — font too big for container, will overflow at narrow widths
      { text: 'Product Launch Dashboard', font: `700 ${fontSize + 14}px Inter`, lineHeight: Math.round((fontSize + 14) * 1.1) } satisfies TextNode,
      { text: 'Real-time analytics and team performance metrics for Q4 launch readiness assessment', font: `${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.3) } satisfies TextNode,
      // Cards row — deliberately uneven: card 1 has way more text, card 3 is too narrow
      {
        flexDirection: 'row', flexWrap: 'wrap', gap: 6,
        children: [
          {
            flexDirection: 'column', width: (w - 52) * 0.45, padding: 10, gap: 4,
            children: [
              { text: 'Performance Metrics Overview', font: `600 ${fontSize + 1}px Inter`, lineHeight: Math.round((fontSize + 1) * 1.2) } satisfies TextNode,
              { text: 'Revenue increased 23% QoQ driven by enterprise expansion in APAC. Customer acquisition cost decreased 12% through organic channels. Net retention rate hit an all-time high of 142% as existing customers expanded usage across multiple product lines and upgraded to higher-tier plans.', font: `${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.3) } satisfies TextNode,
            ],
          } satisfies BoxNode,
          {
            flexDirection: 'column', width: (w - 52) * 0.25, padding: 10, gap: 4,
            children: [
              { text: 'Users', font: `600 ${fontSize + 1}px Inter`, lineHeight: Math.round((fontSize + 1) * 1.2) } satisfies TextNode,
              { text: '847K active', font: `${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.3) } satisfies TextNode,
            ],
          } satisfies BoxNode,
          {
            flexDirection: 'column', width: (w - 52) * 0.3, padding: 10, gap: 4,
            children: [
              { text: 'Infrastructure Status', font: `600 ${fontSize + 1}px Inter`, lineHeight: Math.round((fontSize + 1) * 1.2) } satisfies TextNode,
              { text: 'All systems nominal. Edge nodes responding within SLA targets across all regions.', font: `${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.3) } satisfies TextNode,
            ],
          } satisfies BoxNode,
        ],
      } satisfies BoxNode,
      // Small touch target button
      {
        flexDirection: 'row', gap: 8,
        children: [
          { width: 28, height: 28 }, // too small — should be 44px
          { text: 'View Full Report', font: `500 ${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.3) } satisfies TextNode,
        ],
      } satisfies BoxNode,
      // Text with cramped line height
      { text: 'Sprint velocity improved 34% this quarter. The team shipped 12 major features including real-time collaboration, advanced search, and the new dashboard. Customer-reported bugs decreased 61% compared to Q3.', font: `${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.05) } satisfies TextNode,
      // Stats row with too-tight spacing
      {
        flexDirection: 'row', flexWrap: 'wrap', gap: 3,
        children: [
          { flexDirection: 'column', width: (w - 49) / 4, padding: 8, gap: 2, alignItems: 'center',
            children: [
              { text: '$12.4M', font: `700 ${fontSize + 4}px Inter`, lineHeight: Math.round((fontSize + 4) * 1.1) } satisfies TextNode,
              { text: 'Revenue', font: `${fontSize - 3}px Inter`, lineHeight: Math.round((fontSize - 3) * 1.2) } satisfies TextNode,
            ],
          } satisfies BoxNode,
          { flexDirection: 'column', width: (w - 49) / 4, padding: 8, gap: 2, alignItems: 'center',
            children: [
              { text: '94.2%', font: `700 ${fontSize + 4}px Inter`, lineHeight: Math.round((fontSize + 4) * 1.1) } satisfies TextNode,
              { text: 'Retention', font: `${fontSize - 3}px Inter`, lineHeight: Math.round((fontSize - 3) * 1.2) } satisfies TextNode,
            ],
          } satisfies BoxNode,
          { flexDirection: 'column', width: (w - 49) / 4, padding: 8, gap: 2, alignItems: 'center',
            children: [
              { text: '847K', font: `700 ${fontSize + 4}px Inter`, lineHeight: Math.round((fontSize + 4) * 1.1) } satisfies TextNode,
              { text: 'Users', font: `${fontSize - 3}px Inter`, lineHeight: Math.round((fontSize - 3) * 1.2) } satisfies TextNode,
            ],
          } satisfies BoxNode,
          { flexDirection: 'column', width: (w - 49) / 4, padding: 8, gap: 2, alignItems: 'center',
            children: [
              { text: '99.97%', font: `700 ${fontSize + 4}px Inter`, lineHeight: Math.round((fontSize + 4) * 1.1) } satisfies TextNode,
              { text: 'Uptime', font: `${fontSize - 3}px Inter`, lineHeight: Math.round((fontSize - 3) * 1.2) } satisfies TextNode,
            ],
          } satisfies BoxNode,
        ],
      } satisfies BoxNode,
    ],
  }
}

function analyzeCriticIssues(tree: BoxNode, _layout: ComputedLayout, w: number, fontSize: number): CriticIssue[] {
  const issues: CriticIssue[] = []

  // Issue 1: Title line height too tight
  const titleNode = tree.children![0] as TextNode
  issues.push({
    type: 'overflow',
    description: `Title lineHeight ${titleNode.lineHeight}px is too tight for ${fontSize + 14}px font`,
    fixed: false,
    fix: () => { (tree.children![0] as TextNode).lineHeight = Math.round((fontSize + 14) * 1.3) },
  })

  // Issue 2: Subtitle line height cramped
  issues.push({
    type: 'spacing',
    description: `Subtitle lineHeight ${(tree.children![1] as TextNode).lineHeight}px — cramped, should be ${Math.round(fontSize * 1.5)}px`,
    fixed: false,
    fix: () => { (tree.children![1] as TextNode).lineHeight = Math.round(fontSize * 1.5) },
  })

  // Issue 3: Card row gap too small
  issues.push({
    type: 'spacing',
    description: `Card row gap is 6px — too tight, increasing to 12px`,
    fixed: false,
    fix: () => { (tree.children![2] as BoxNode).gap = 12 },
  })

  // Issue 4: Cards have uneven text density — rebalance widths
  issues.push({
    type: 'uneven',
    description: `Card widths are 45%/25%/30% — rebalancing to equal thirds`,
    fixed: false,
    fix: () => {
      const innerW = w - 52
      const cardW = (innerW - 24) / 3
      const cards = (tree.children![2] as BoxNode).children!
      ;(cards[0] as BoxNode).width = cardW
      ;(cards[1] as BoxNode).width = cardW
      ;(cards[2] as BoxNode).width = cardW
    },
  })

  // Issue 5: Touch target too small
  issues.push({
    type: 'touch-target',
    description: `Button icon is 28x28px — below 44px minimum touch target`,
    fixed: false,
    fix: () => {
      const btnRow = tree.children![3] as BoxNode
      const icon = btnRow.children![0] as BoxNode
      icon.width = 44
      icon.height = 44
    },
  })

  // Issue 6: Body text line height too cramped
  issues.push({
    type: 'overflow',
    description: `Body text lineHeight is ${(tree.children![4] as TextNode).lineHeight}px — increasing to ${Math.round(fontSize * 1.6)}px`,
    fixed: false,
    fix: () => { (tree.children![4] as TextNode).lineHeight = Math.round(fontSize * 1.6) },
  })

  // Issue 7: Stats row gap too small
  issues.push({
    type: 'spacing',
    description: `Stats row gap is 3px — increasing to 10px for readability`,
    fixed: false,
    fix: () => { (tree.children![5] as BoxNode).gap = 10 },
  })

  // Issue 8: Stats labels too small
  issues.push({
    type: 'overflow',
    description: `Stats labels are ${fontSize - 3}px — too small, increasing to ${fontSize - 1}px`,
    fixed: false,
    fix: () => {
      const statsRow = tree.children![5] as BoxNode
      for (const stat of statsRow.children!) {
        const label = (stat as BoxNode).children![1] as TextNode
        label.font = `${fontSize - 1}px Inter`
        label.lineHeight = Math.round((fontSize - 1) * 1.4)
      }
    },
  })

  // Issue 9: Root gap too small
  issues.push({
    type: 'spacing',
    description: `Root container gap is 6px — increasing to 16px`,
    fixed: false,
    fix: () => { tree.gap = 16 },
  })

  return issues
}

function renderCritic() {
  if (!criticBrokenTree) return
  const containerWidth = parseInt(widthSlider.value)
  const fontSize = parseInt(fontSlider.value)
  const tree = criticBrokenTree

  const t0 = performance.now()
  const texturaLayout = computeLayout(tree, { width: containerWidth })
  const analysisTime = performance.now() - t0

  const { layout: yogaLayout } = yogaLayoutTree(tree, containerWidth, fontSize)

  const maxHeight = Math.max(texturaLayout.height, yogaLayout.height, 200)
  const canvasH = Math.min(maxHeight + 20, 800)

  const ctxL = setupCanvas(canvasYoga, canvasH)
  const ctxR = setupCanvas(canvasTextura, canvasH)
  const panelW = canvasYoga.clientWidth
  const offsetX = Math.max(0, (panelW - containerWidth) / 2)

  ctxL.fillStyle = palette.bg
  ctxL.fillRect(0, 0, panelW, canvasH)
  ctxR.fillStyle = palette.bg
  ctxR.fillRect(0, 0, panelW, canvasH)

  // Left: render with issue highlights
  renderLayout(ctxL, yogaLayout, tree, offsetX, 10, 'critic', true)
  renderLayout(ctxR, texturaLayout, tree, offsetX, 10, 'critic', false)

  // Draw issue markers on left (unfixed issues) and fix markers on right (fixed issues)
  drawCriticMarkers(ctxL, yogaLayout, offsetX, 10, true)
  drawCriticMarkers(ctxR, texturaLayout, offsetX, 10, false)

  // Overlays
  ctxL.save()
  ctxL.font = '600 11px Inter'
  const lText = criticFixIdx > 0 ? `Before (${criticIssues.length} issues)` : `${criticIssues.length} issues detected`
  const ltw = ctxL.measureText(lText).width
  ctxL.fillStyle = 'rgba(0,0,0,0.7)'
  roundRect(ctxL, panelW - ltw - 20, 8, ltw + 12, 18, 4)
  ctxL.fill()
  ctxL.fillStyle = '#ef4444'
  ctxL.fillText(lText, panelW - ltw - 14, 22)
  ctxL.restore()

  ctxR.save()
  ctxR.font = '600 11px Inter'
  const rText = `${criticFixIdx} of ${criticIssues.length} fixed`
  const rtw = ctxR.measureText(rText).width
  ctxR.fillStyle = 'rgba(0,0,0,0.7)'
  roundRect(ctxR, panelW - rtw - 20, 8, rtw + 12, 18, 4)
  ctxR.fill()
  ctxR.fillStyle = criticFixIdx === criticIssues.length ? '#4ade80' : '#fb923c'
  ctxR.fillText(rText, panelW - rtw - 14, 22)
  ctxR.restore()

  // Stats
  const overlaps = countOverlaps(yogaLayout, tree, ctxL)

  document.getElementById('yoga-time')!.textContent = `Issues: ${criticIssues.length}`
  document.getElementById('yoga-nodes')!.textContent = `${overlaps} text overflows`
  document.getElementById('textura-time')!.textContent = `Analysis: ${analysisTime.toFixed(2)}ms`
  document.getElementById('textura-nodes')!.textContent = `${criticFixIdx} fixed`

  document.getElementById('stat-overlap')!.textContent = `${criticIssues.filter(i => !i.fixed).length}`
  document.getElementById('stat-height-diff')!.textContent = `${criticFixIdx}`
  document.getElementById('stat-resize-time')!.textContent = `${analysisTime.toFixed(2)}ms`
  document.getElementById('stat-dom-time')!.textContent = `0`

  document.getElementById('critic-found')!.textContent = `${criticIssues.length}`
  document.getElementById('critic-fixed')!.textContent = `${criticFixIdx}`
  document.getElementById('critic-time')!.textContent = `${analysisTime.toFixed(2)}ms`

  // Update issues list
  const listEl = document.getElementById('critic-issues')!
  listEl.innerHTML = criticIssues.map((issue, i) => {
    const fixed = i < criticFixIdx
    return `<div class="critic-issue ${fixed ? 'is-fixed' : ''}"><span class="dot ${fixed ? 'fixed' : 'error'}"></span>${issue.description}</div>`
  }).join('')

  document.getElementById('insight-text')!.innerHTML = insights['critic']
}

function drawCriticMarkers(ctx: CanvasRenderingContext2D, layout: ComputedLayout, ox: number, oy: number, isLeft: boolean) {
  // Highlight children with red/green outlines based on fix state
  const x = ox + layout.x
  const y = oy + layout.y

  for (let i = 0; i < layout.children.length; i++) {
    const child = layout.children[i]!
    const cx = x + child.x
    const cy = y + child.y

    if (isLeft) {
      // Show issues on left side — dashed red outlines on all sections
      ctx.strokeStyle = '#ef444460'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.strokeRect(cx, cy, child.width, child.height)
      ctx.setLineDash([])
    } else {
      // Right side — green for fixed
      ctx.strokeStyle = criticFixIdx > 0 ? '#4ade8040' : '#27272a'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.strokeRect(cx, cy, child.width, child.height)
      ctx.setLineDash([])
    }
  }
}

function startCritic() {
  document.getElementById('critic-bar')!.classList.add('active')
  const btn = document.getElementById('critic-btn')!

  if (criticIntervalId !== null) {
    stopCritic()
    return
  }

  const containerWidth = parseInt(widthSlider.value)
  const fontSize = parseInt(fontSlider.value)

  // Build the broken tree (right side gets the fixable copy)
  criticBrokenTree = buildBrokenTree(containerWidth, fontSize)
  const layout = computeLayout(criticBrokenTree, { width: containerWidth })
  criticIssues = analyzeCriticIssues(criticBrokenTree, layout, containerWidth, fontSize)
  criticFixIdx = 0

  btn.textContent = 'Stop'
  btn.classList.add('running')

  renderCritic()

  // Fix issues one by one
  criticIntervalId = setInterval(() => {
    if (criticFixIdx >= criticIssues.length) {
      stopCritic()
      return
    }

    const issue = criticIssues[criticFixIdx]!
    issue.fix()
    issue.fixed = true
    criticFixIdx++

    renderCritic()
  }, 800)
}

function stopCritic() {
  if (criticIntervalId !== null) {
    clearInterval(criticIntervalId)
    criticIntervalId = null
  }
  const btn = document.getElementById('critic-btn')!
  btn.textContent = criticFixIdx >= criticIssues.length ? 'Replay' : 'Run Critic'
  btn.classList.remove('running')
}

// ── AI Agent Environment ──────────────────────────────────────

interface AgentAction {
  type: 'type' | 'add' | 'resize' | 'toggle' | 'remove'
  description: string
}

const agentActions: AgentAction[] = [
  { type: 'type', description: 'type "Hey, how is the deployment going?"' },
  { type: 'add', description: 'add message from Bob' },
  { type: 'type', description: 'type "The CI pipeline passed all 847 tests"' },
  { type: 'resize', description: 'resize window to 380px' },
  { type: 'add', description: 'add message from Charlie' },
  { type: 'type', description: 'type "Switching to the new layout engine eliminated all scroll jank"' },
  { type: 'resize', description: 'resize window to 520px' },
  { type: 'toggle', description: 'expand pinned messages section' },
  { type: 'add', description: 'add pinned message' },
  { type: 'type', description: 'type "Release v2.4 is scheduled for Thursday"' },
  { type: 'resize', description: 'resize window to 440px' },
  { type: 'remove', description: 'remove oldest message' },
  { type: 'add', description: 'add message from Diana' },
  { type: 'type', description: 'type "Performance benchmarks look great — 0.09ms per layout"' },
  { type: 'toggle', description: 'collapse pinned messages' },
  { type: 'resize', description: 'resize window to 600px' },
  { type: 'add', description: 'add message from Eve' },
  { type: 'type', description: 'type "Can we ship this to production today?"' },
  { type: 'resize', description: 'resize window to 340px' },
  { type: 'add', description: 'add status notification' },
  { type: 'type', description: 'type "Deployed to staging. All health checks passing."' },
  { type: 'resize', description: 'resize window to 480px' },
  { type: 'remove', description: 'remove oldest message' },
  { type: 'remove', description: 'remove oldest message' },
  { type: 'add', description: 'add message from Frank' },
  { type: 'type', description: 'type "LGTM, merging now"' },
  { type: 'toggle', description: 'expand pinned messages section' },
  { type: 'resize', description: 'resize window to 550px' },
  { type: 'add', description: 'add message from Grace' },
  { type: 'type', description: 'type "The new text measurement pipeline handles CJK, Arabic, Thai, and emoji perfectly"' },
]

let agentIntervalId: ReturnType<typeof setInterval> | null = null
let agentStepCount = 0
let agentLastStepTime = 0
let agentContainerWidth = 440
let agentShowPinned = false

// Mutable state: the chat messages currently in the app
let agentMessages: { author: string; text: string; time: string }[] = [
  { author: 'Alice', text: 'Welcome to the team chat!', time: '9:00' },
  { author: 'Bob', text: 'Thanks! Just setting up my environment.', time: '9:01' },
]
let agentPinnedMessages: { text: string }[] = [
  { text: 'Team standup at 10:00 AM daily' },
]

const agentAuthors = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry']
const agentNewMessages = [
  'Just pushed the hotfix. Tests are green.',
  'The layout engine benchmarks are incredible.',
  'Anyone available for a quick code review?',
  'Merged! Deploying to staging now.',
  'Customer feedback on the new UI has been overwhelmingly positive.',
  'Sprint velocity is up 34% this quarter.',
  'The virtual scroll implementation is buttery smooth now.',
]

function buildAgentTree(w: number, fontSize: number): BoxNode {
  const children: (BoxNode | TextNode)[] = [
    // Channel header
    { text: '#engineering', font: `700 ${fontSize + 4}px Inter`, lineHeight: Math.round((fontSize + 4) * 1.4) } satisfies TextNode,
  ]

  // Pinned section (togglable)
  if (agentShowPinned && agentPinnedMessages.length > 0) {
    children.push({
      flexDirection: 'column', padding: 10, gap: 6,
      children: [
        { text: 'Pinned Messages', font: `600 ${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.3) } satisfies TextNode,
        ...agentPinnedMessages.map((m): TextNode => ({
          text: m.text, font: `${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.5),
        })),
      ],
    } satisfies BoxNode)
  }

  // Chat messages
  for (const m of agentMessages) {
    children.push({
      flexDirection: 'row', gap: 10, padding: 10,
      children: [
        { width: 28, height: 28 },
        {
          flexDirection: 'column', flexGrow: 1, flexShrink: 1, gap: 2,
          children: [
            { text: `${m.author}  ${m.time}`, font: `600 ${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.3) } satisfies TextNode,
            { text: m.text, font: `${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.5) } satisfies TextNode,
          ],
        } satisfies BoxNode,
      ],
    } satisfies BoxNode)
  }

  return { width: w, flexDirection: 'column', padding: 16, gap: 8, children }
}

function applyAgentAction(action: AgentAction) {
  switch (action.type) {
    case 'type': {
      // Modify the last message's text
      const text = action.description.replace("type \"", '').replace(/"$/, '')
      if (agentMessages.length > 0) {
        agentMessages[agentMessages.length - 1]!.text = text
      }
      break
    }
    case 'add': {
      const author = agentAuthors[agentStepCount % agentAuthors.length]!
      const text = agentNewMessages[agentStepCount % agentNewMessages.length]!
      const hour = 9 + Math.floor(agentStepCount / 4)
      const min = (agentStepCount * 7) % 60
      agentMessages.push({ author, text, time: `${hour}:${String(min).padStart(2, '0')}` })
      // Keep max 8 messages visible
      if (agentMessages.length > 8) agentMessages.shift()
      break
    }
    case 'resize': {
      const match = action.description.match(/(\d+)px/)
      if (match) agentContainerWidth = parseInt(match[1]!)
      break
    }
    case 'toggle': {
      agentShowPinned = !agentShowPinned
      if (action.description.includes('expand')) agentShowPinned = true
      if (action.description.includes('collapse')) agentShowPinned = false
      break
    }
    case 'remove': {
      if (agentMessages.length > 1) agentMessages.shift()
      break
    }
  }
}

function renderAgent() {
  const fontSize = parseInt(fontSlider.value)
  const w = agentContainerWidth

  const tree = buildAgentTree(w, fontSize)

  const t0 = performance.now()
  const texturaLayout = computeLayout(tree, { width: w })
  agentLastStepTime = performance.now() - t0

  const { layout: yogaLayout } = yogaLayoutTree(tree, w, fontSize)

  const maxHeight = Math.max(texturaLayout.height, yogaLayout.height, 200)
  const canvasH = Math.min(maxHeight + 20, 800)

  const ctxY = setupCanvas(canvasYoga, canvasH)
  const ctxT = setupCanvas(canvasTextura, canvasH)
  const panelW = canvasYoga.clientWidth
  const offsetX = Math.max(0, (panelW - w) / 2)

  ctxY.fillStyle = palette.bg
  ctxY.fillRect(0, 0, panelW, canvasH)
  ctxT.fillStyle = palette.bg
  ctxT.fillRect(0, 0, panelW, canvasH)

  // Render with bounding box overlays to show "agent observation"
  renderLayout(ctxY, yogaLayout, tree, offsetX, 10, 'agent', true)
  renderLayout(ctxT, texturaLayout, tree, offsetX, 10, 'agent', false)

  // Draw observation bounding boxes (what the agent "sees")
  drawAgentObservation(ctxY, yogaLayout, offsetX, 10, true)
  drawAgentObservation(ctxT, texturaLayout, offsetX, 10, false)

  // Width indicator
  ctxT.save()
  ctxT.font = '500 11px Inter'
  const wText = `viewport: ${w}px`
  const wtw = ctxT.measureText(wText).width
  ctxT.fillStyle = 'rgba(59,130,246,0.8)'
  roundRect(ctxT, offsetX + w / 2 - wtw / 2 - 6, 4, wtw + 12, 16, 3)
  ctxT.fill()
  ctxT.fillStyle = '#fff'
  ctxT.fillText(wText, offsetX + w / 2 - wtw / 2, 16)
  ctxT.restore()

  // Stats
  const overlaps = countOverlaps(yogaLayout, tree, ctxY)
  const heightDiff = Math.abs(texturaLayout.height - yogaLayout.height)

  document.getElementById('yoga-time')!.textContent = `Height: ${Math.round(yogaLayout.height)}px (wrong)`
  document.getElementById('yoga-nodes')!.textContent = `${overlaps} wrong observations`
  document.getElementById('textura-time')!.textContent = `Layout: ${agentLastStepTime.toFixed(2)}ms`
  document.getElementById('textura-nodes')!.textContent = `Height: ${Math.round(texturaLayout.height)}px`

  document.getElementById('stat-overlap')!.textContent = `${overlaps}`
  document.getElementById('stat-height-diff')!.textContent = `${Math.round(heightDiff)}px`
  document.getElementById('stat-resize-time')!.textContent = `${agentLastStepTime.toFixed(2)}ms`
  document.getElementById('stat-dom-time')!.textContent = `${agentStepCount}`

  document.getElementById('agent-steps')!.textContent = `${agentStepCount}`
  document.getElementById('agent-step-time')!.textContent = `${agentLastStepTime.toFixed(2)}ms`

  const speedup = agentLastStepTime > 0 ? Math.round(80 / agentLastStepTime) : 0
  document.getElementById('agent-browser-compare')!.textContent = `${speedup}x faster`

  document.getElementById('insight-text')!.innerHTML = insights['agent']
}

function drawAgentObservation(ctx: CanvasRenderingContext2D, layout: ComputedLayout, ox: number, oy: number, isYoga: boolean) {
  // Draw thin observation boxes around interactive elements
  const color = isYoga ? '#fb923c40' : '#4ade8040'
  const borderColor = isYoga ? '#fb923c80' : '#4ade8080'

  function drawObs(l: ComputedLayout, px: number, py: number, depth: number) {
    const x = px + l.x
    const y = py + l.y

    // Draw observation box on leaf nodes and direct children of root
    if (depth === 1 || (l.text !== undefined && depth <= 3)) {
      ctx.strokeStyle = borderColor
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.strokeRect(x, y, l.width, l.height)
      ctx.setLineDash([])

      if (depth === 1) {
        ctx.fillStyle = color
        ctx.fillRect(x, y, l.width, l.height)
      }
    }

    for (const child of l.children) {
      drawObs(child, x, y, depth + 1)
    }
  }

  drawObs(layout, ox, oy, 0)
}

function startAgent() {
  document.getElementById('agent-bar')!.classList.add('active')
  const btn = document.getElementById('agent-btn')!

  if (agentIntervalId !== null) {
    stopAgent()
    return
  }

  // Reset state
  agentStepCount = 0
  agentContainerWidth = parseInt(widthSlider.value)
  agentShowPinned = false
  agentMessages = [
    { author: 'Alice', text: 'Welcome to the team chat!', time: '9:00' },
    { author: 'Bob', text: 'Thanks! Just setting up my environment.', time: '9:01' },
  ]
  agentPinnedMessages = [{ text: 'Team standup at 10:00 AM daily' }]

  btn.textContent = 'Stop'
  btn.classList.add('running')

  renderAgent()

  // Benchmark throughput in background
  const fontSize = parseInt(fontSlider.value)
  const benchTree = buildAgentTree(440, fontSize)
  computeLayout(benchTree, { width: 440 }) // prime cache
  let benchCount = 0
  const benchStart = performance.now()
  while (performance.now() - benchStart < 200) {
    computeLayout(benchTree, { width: 300 + (benchCount % 300) })
    benchCount++
  }
  const benchElapsed = performance.now() - benchStart
  const stepsPerSec = Math.round(benchCount / (benchElapsed / 1000))
  document.getElementById('agent-throughput')!.textContent = `~${stepsPerSec.toLocaleString()}`

  // Run agent actions visually at 3/sec
  let actionIdx = 0
  agentIntervalId = setInterval(() => {
    if (actionIdx >= agentActions.length) {
      actionIdx = 0 // loop
    }

    const action = agentActions[actionIdx]!
    applyAgentAction(action)
    agentStepCount++
    actionIdx++

    // Update action log
    const logEl = document.getElementById('agent-action-log')!
    const tag = document.createElement('span')
    tag.className = `agent-action-tag ${action.type}`
    tag.textContent = action.description.length > 35 ? action.description.slice(0, 35) + '...' : action.description
    logEl.insertBefore(tag, logEl.firstChild)
    while (logEl.children.length > 4) logEl.removeChild(logEl.lastChild!)

    renderAgent()
  }, 350)
}

function stopAgent() {
  if (agentIntervalId !== null) {
    clearInterval(agentIntervalId)
    agentIntervalId = null
  }
  const btn = document.getElementById('agent-btn')!
  btn.textContent = 'Run Agent'
  btn.classList.remove('running')
}

// ── Synthetic UI Training Data ─────────────────────────────────

const synthTitles = [
  'Dashboard Overview', 'User Analytics', 'Revenue Report', 'Team Activity',
  'System Status', 'Project Tracker', 'Sales Pipeline', 'Support Tickets',
  'Inventory Manager', 'Campaign Results', 'API Metrics', 'Deployment Log',
]

const synthBodies = [
  'Real-time monitoring of key performance indicators across all services.',
  'Weekly active users increased by 23% compared to the previous quarter.',
  'Processing 4.2M requests per day with 99.97% uptime across all regions.',
  'Automated deployment pipeline completed 847 successful releases this month.',
  'Customer satisfaction scores improved to 4.8/5.0 following the latest update.',
  'Machine learning pipeline processing 12TB of training data daily.',
  'Cross-functional collaboration improved sprint velocity by 34% this quarter.',
  'Infrastructure costs reduced 28% after migrating to edge computing.',
  'Mobile engagement up 45% after launching the redesigned notification system.',
  'Security audit passed with zero critical findings for the third consecutive quarter.',
]

const synthStats = ['$12.4M', '847K', '94.2%', '72', '4.8/5', '99.97%', '23%', '1.2M', '340ms', '28%']
const synthLabels = ['Revenue', 'Users', 'Retention', 'NPS', 'Rating', 'Uptime', 'Growth', 'Events', 'Latency', 'Savings']

let synthIntervalId: ReturnType<typeof setInterval> | null = null
let synthCount = 0
let synthTotalTime = 0
let synthShowBbox = false
let synthLastTree: BoxNode | null = null
let synthLastTexturaLayout: ComputedLayout | null = null
let synthLastYogaLayout: ComputedLayout | null = null
let synthLastNodeCount = 0

// Deterministic pseudo-random from seed
function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildSynthTree(w: number, fontSize: number, seed: number): BoxNode {
  const rand = mulberry32(seed)
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!

  const innerPad = Math.round(16 + rand() * 16)
  const innerW = w - innerPad * 2

  // Decide structure: 2-5 sections
  const sectionCount = 2 + Math.floor(rand() * 4)
  const children: (BoxNode | TextNode)[] = []

  // Always start with a title
  children.push({
    text: pick(synthTitles),
    font: `700 ${fontSize + 6 + Math.floor(rand() * 8)}px Inter`,
    lineHeight: Math.round((fontSize + 10) * 1.2),
  } satisfies TextNode)

  // Optional subtitle
  if (rand() > 0.3) {
    children.push({
      text: pick(synthBodies),
      font: `${fontSize}px Inter`,
      lineHeight: Math.round(fontSize * 1.5),
    } satisfies TextNode)
  }

  for (let s = 0; s < sectionCount; s++) {
    const sectionType = rand()

    if (sectionType < 0.35) {
      // Stats row
      const statCount = 2 + Math.floor(rand() * 3)
      const cols = w >= 500 ? Math.min(statCount, 4) : 2
      const statW = (innerW - 10 * (cols - 1)) / cols
      const statChildren: BoxNode[] = []
      for (let i = 0; i < statCount; i++) {
        const si = (seed * 7 + s * 3 + i) % synthStats.length
        statChildren.push({
          flexDirection: 'column', width: statW, padding: 12, gap: 4, alignItems: 'center',
          children: [
            { text: synthStats[si]!, font: `700 ${fontSize + 6}px Inter`, lineHeight: Math.round((fontSize + 6) * 1.2) } satisfies TextNode,
            { text: synthLabels[si]!, font: `${fontSize - 2}px Inter`, lineHeight: Math.round((fontSize - 2) * 1.4) } satisfies TextNode,
          ],
        })
      }
      children.push({ flexDirection: 'row', flexWrap: 'wrap', gap: 10, children: statChildren } satisfies BoxNode)
    } else if (sectionType < 0.7) {
      // Card grid
      const cardCount = 2 + Math.floor(rand() * 3)
      const cols = w >= 550 ? Math.min(cardCount, 3) : w >= 380 ? 2 : 1
      const cardW = (innerW - 12 * (cols - 1)) / cols
      const cardChildren: BoxNode[] = []
      for (let i = 0; i < cardCount; i++) {
        const ti = (seed * 11 + s * 5 + i) % synthTitles.length
        const bi = (seed * 13 + s * 7 + i) % synthBodies.length
        const cc: (BoxNode | TextNode)[] = [
          { text: synthTitles[ti]!, font: `600 ${fontSize}px Inter`, lineHeight: Math.round(fontSize * 1.3) } satisfies TextNode,
          { text: synthBodies[bi]!, font: `${fontSize - 1}px Inter`, lineHeight: Math.round((fontSize - 1) * 1.55) } satisfies TextNode,
        ]
        // Some cards get an icon placeholder
        if (rand() > 0.5) cc.unshift({ width: 32, height: 32 } satisfies BoxNode)
        cardChildren.push({ flexDirection: 'column', width: cardW, padding: 16, gap: 8, children: cc })
      }
      children.push({ flexDirection: 'row', flexWrap: 'wrap', gap: 12, children: cardChildren } satisfies BoxNode)
    } else {
      // Paragraph
      const bi = (seed * 17 + s * 3) % synthBodies.length
      children.push({
        text: synthBodies[bi]!,
        font: `${fontSize}px Inter`,
        lineHeight: Math.round(fontSize * 1.6),
        marginBottom: 4,
      } satisfies TextNode)
    }
  }

  return { width: w, flexDirection: 'column', padding: innerPad, gap: 12, children }
}

function countLayoutNodes(layout: ComputedLayout): number {
  let n = 1
  for (const c of layout.children) n += countLayoutNodes(c)
  return n
}

function renderSynth() {
  if (!synthLastTree || !synthLastTexturaLayout || !synthLastYogaLayout) return

  const tree = synthLastTree
  const texturaLayout = synthLastTexturaLayout
  const yogaLayout = synthLastYogaLayout

  const maxHeight = Math.max(texturaLayout.height, yogaLayout.height, 200)
  const canvasH = Math.min(maxHeight + 20, 800)
  const containerWidth = parseInt(widthSlider.value)

  const ctxL = setupCanvas(canvasYoga, canvasH)
  const ctxR = setupCanvas(canvasTextura, canvasH)
  const panelW = canvasYoga.clientWidth
  const offsetX = Math.max(0, (panelW - containerWidth) / 2)

  ctxL.fillStyle = palette.bg
  ctxL.fillRect(0, 0, panelW, canvasH)
  ctxR.fillStyle = palette.bg
  ctxR.fillRect(0, 0, panelW, canvasH)

  if (synthShowBbox) {
    // Left: Yoga with bounding boxes (inaccurate)
    renderLayout(ctxL, yogaLayout, tree, offsetX, 10, 'synth', true)
    drawBboxOverlay(ctxL, yogaLayout, tree, offsetX, 10, true)
    // Right: Textura with bounding boxes (accurate)
    renderLayout(ctxR, texturaLayout, tree, offsetX, 10, 'synth', false)
    drawBboxOverlay(ctxR, texturaLayout, tree, offsetX, 10, false)
  } else {
    // Left: Visual render (Yoga — broken)
    renderLayout(ctxL, yogaLayout, tree, offsetX, 10, 'synth', true)
    // Right: Visual render (Textura — accurate)
    renderLayout(ctxR, texturaLayout, tree, offsetX, 10, 'synth', false)
  }

  // Overlay labels
  ctxL.save()
  ctxL.font = '600 11px Inter'
  const lLabel = synthShowBbox ? 'Yoga Annotations (inaccurate)' : 'Yoga Visual (estimated)'
  const llw = ctxL.measureText(lLabel).width
  ctxL.fillStyle = 'rgba(0,0,0,0.7)'
  roundRect(ctxL, panelW - llw - 20, 8, llw + 12, 18, 4)
  ctxL.fill()
  ctxL.fillStyle = '#fb923c'
  ctxL.fillText(lLabel, panelW - llw - 14, 22)
  ctxL.restore()

  ctxR.save()
  ctxR.font = '600 11px Inter'
  const rLabel = synthShowBbox ? 'Textura Annotations (accurate)' : 'Textura Visual (accurate)'
  const rlw = ctxR.measureText(rLabel).width
  ctxR.fillStyle = 'rgba(0,0,0,0.7)'
  roundRect(ctxR, panelW - rlw - 20, 8, rlw + 12, 18, 4)
  ctxR.fill()
  ctxR.fillStyle = '#4ade80'
  ctxR.fillText(rLabel, panelW - rlw - 14, 22)
  ctxR.restore()

  // Stats
  const overlaps = countOverlaps(yogaLayout, tree, ctxL)
  const heightDiff = Math.abs(texturaLayout.height - yogaLayout.height)
  const avgTime = synthCount > 0 ? synthTotalTime / synthCount : 0

  document.getElementById('yoga-time')!.textContent = `Height: ${Math.round(yogaLayout.height)}px (wrong)`
  document.getElementById('yoga-nodes')!.textContent = `${overlaps} overlaps`
  document.getElementById('textura-time')!.textContent = `Height: ${Math.round(texturaLayout.height)}px (accurate)`
  document.getElementById('textura-nodes')!.textContent = `${synthLastNodeCount} nodes`

  document.getElementById('stat-overlap')!.textContent = `${overlaps}`
  document.getElementById('stat-height-diff')!.textContent = `${Math.round(heightDiff)}px`
  document.getElementById('stat-resize-time')!.textContent = `${avgTime.toFixed(2)}ms`
  document.getElementById('stat-dom-time')!.textContent = `${synthCount}`

  document.getElementById('synth-count')!.textContent = `${synthCount}`
  document.getElementById('synth-time')!.textContent = `${avgTime.toFixed(2)}ms`
  document.getElementById('synth-nodes')!.textContent = `${synthLastNodeCount}`

  document.getElementById('insight-text')!.innerHTML = insights['synth']
}

const bboxColors = ['#3b82f680', '#ef444480', '#22c55e80', '#f59e0b80', '#8b5cf680', '#ec489980', '#06b6d480', '#84cc1680']

function drawBboxOverlay(ctx: CanvasRenderingContext2D, layout: ComputedLayout, tree: BoxNode | TextNode, ox: number, oy: number, _isYoga: boolean) {
  let colorIdx = 0

  function drawNode(l: ComputedLayout, t: BoxNode | TextNode, px: number, py: number, depth: number) {
    const x = px + l.x
    const y = py + l.y
    const w = l.width
    const h = l.height
    const isTextNode = l.text !== undefined

    const color = bboxColors[colorIdx % bboxColors.length]!
    colorIdx++

    // Draw bounding box
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.setLineDash(isTextNode ? [] : [4, 2])
    ctx.strokeRect(x, y, w, h)
    ctx.setLineDash([])

    // Label
    const label = isTextNode ? 'text' : l.children.length === 0 ? 'icon' : `box[${l.children.length}]`
    const coords = `${Math.round(x - ox)},${Math.round(y - oy)} ${Math.round(w)}x${Math.round(h)}`
    ctx.font = '500 9px Inter'
    const labelText = `${label} ${coords}`
    const tw = ctx.measureText(labelText).width

    if (depth <= 2 || isTextNode) {
      ctx.fillStyle = color.replace('80', 'cc')
      roundRect(ctx, x, y - 12, tw + 6, 12, 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.fillText(labelText, x + 3, y - 3)
    }

    // Recurse
    if (!isTextNode) {
      const children = ('children' in t) ? (t as BoxNode).children ?? [] : []
      for (let i = 0; i < l.children.length; i++) {
        if (children[i]) drawNode(l.children[i]!, children[i]!, x, y, depth + 1)
      }
    }
  }

  drawNode(layout, tree, ox, oy, 0)
}

function generateOneSynth() {
  const containerWidth = parseInt(widthSlider.value)
  const fontSize = parseInt(fontSlider.value)
  const seed = synthCount + Date.now()

  const tree = buildSynthTree(containerWidth, fontSize, seed)
  synthLastTree = tree

  const t0 = performance.now()
  synthLastTexturaLayout = computeLayout(tree, { width: containerWidth })
  const layoutTime = performance.now() - t0

  const { layout: yogaLayout } = yogaLayoutTree(tree, containerWidth, fontSize)
  synthLastYogaLayout = yogaLayout

  synthLastNodeCount = countLayoutNodes(synthLastTexturaLayout)
  synthCount++
  synthTotalTime += layoutTime
}

function startSynth() {
  document.getElementById('synth-bar')!.classList.add('active')
  const btn = document.getElementById('synth-btn')!

  if (synthIntervalId !== null) {
    stopSynth()
    return
  }

  synthCount = 0
  synthTotalTime = 0

  btn.textContent = 'Stop'
  btn.classList.add('running')

  // Generate first one immediately
  generateOneSynth()
  renderSynth()

  // Measure throughput: generate as many as possible in 1 second, then show rate
  let rateCount = 0
  const rateStart = performance.now()
  const containerWidth = parseInt(widthSlider.value)
  const fontSize = parseInt(fontSlider.value)
  while (performance.now() - rateStart < 200) {
    const tree = buildSynthTree(containerWidth, fontSize, rateCount + Date.now())
    computeLayout(tree, { width: containerWidth })
    rateCount++
  }
  const rateElapsed = performance.now() - rateStart
  const layoutsPerSec = Math.round(rateCount / (rateElapsed / 1000))
  document.getElementById('synth-rate')!.textContent = `~${layoutsPerSec}`

  // Visual generation at 2/sec for dramatic effect
  synthIntervalId = setInterval(() => {
    generateOneSynth()
    renderSynth()
  }, 500)
}

function stopSynth() {
  if (synthIntervalId !== null) {
    clearInterval(synthIntervalId)
    synthIntervalId = null
  }
  const btn = document.getElementById('synth-btn')!
  btn.textContent = 'Generate'
  btn.classList.remove('running')
}

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

// ── Text World Model ─────────────────────────────────────────

let wmContainerWidth = 440
let wmLastLayoutTime = 0
let wmGenerateInterval: ReturnType<typeof setInterval> | null = null
let wmSeed = 1
let wmGenCount = 0

// Room descriptions an LLM might generate
const wmRoomNames = [
  'The Library', 'Guard Tower', 'Merchant Quarter', 'Dungeon Cell',
  'Royal Chamber', 'Alchemy Lab', 'Training Grounds', 'Tavern Hall',
  'Observatory', 'Crypt Entrance', 'Forge Room', 'Harbor Office',
]

const wmObjectNames = [
  'BOOKSHELF', 'WARNING SIGN', 'TREASURE CHEST', 'STONE PILLAR',
  'WEAPON RACK', 'WOODEN TABLE', 'IRON GATE', 'ALTAR',
  'SUPPLY CRATE', 'BANNER', 'TORCH SCONCE', 'STATUE',
]

const wmDescriptions = [
  'Ancient texts and rare manuscripts line these dusty shelves from floor to ceiling.',
  'DANGER — Do not proceed. Structural integrity compromised beyond this point.',
  'A heavy iron-bound chest. The lock mechanism appears to require a specific combination.',
  'Carved from a single block of granite, this pillar supports the vaulted ceiling above.',
  'Swords, axes, and polearms arranged in meticulous order. Recently polished.',
  'A heavy oak table covered in maps, scrolls, and half-finished equations.',
  'The iron bars are cold to the touch. Strange symbols are etched into the frame.',
  'Candles flicker around a raised stone platform. The air smells of incense.',
  'Wooden crates stamped with merchant guild seals. Contents: provisions and tools.',
  'A faded tapestry depicting the founding of the kingdom. The colors are still vivid.',
  'The bracket is empty — someone has already taken the torch from this mount.',
  'A marble figure with outstretched arms. The eyes seem to follow your movement.',
  'Please browse quietly. Return all items to their designated locations.',
  'Through the archway, torchlight reveals a descending spiral staircase.',
  'DO NOT ENTER — restricted area. Authorized personnel only beyond this point.',
  'A cozy alcove with cushions. Wind whistles through cracks in the stone walls.',
]

function wmRand(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildWorldModelTree(w: number, fontSize: number, seed: number): { tree: BoxNode; objects: { name: string; desc: string }[] } {
  const rand = wmRand(seed)
  const lh = Math.round(fontSize * 1.5)
  const smLh = Math.round((fontSize - 2) * 1.5)

  const objectCount = 3 + Math.floor(rand() * 3) // 3-5 objects
  const objects: { name: string; desc: string }[] = []
  const rows: BoxNode[] = []

  // Generate pairs of objects per row
  for (let i = 0; i < objectCount; i += 2) {
    const rowChildren: (BoxNode | TextNode)[] = []

    for (let j = 0; j < 2 && i + j < objectCount; j++) {
      const nameIdx = Math.floor(rand() * wmObjectNames.length)
      const descIdx = Math.floor(rand() * wmDescriptions.length)
      const name = wmObjectNames[nameIdx]!
      const desc = wmDescriptions[descIdx]!
      objects.push({ name, desc })

      rowChildren.push({
        flexDirection: 'column', padding: 8, gap: 4, flexGrow: 1, flexShrink: 1,
        children: [
          { text: name, font: `700 ${fontSize}px Inter`, lineHeight: lh } satisfies TextNode,
          { text: desc, font: `${fontSize - 2}px Inter`, lineHeight: smLh } satisfies TextNode,
        ],
      } satisfies BoxNode)
    }

    rows.push({
      flexDirection: 'row', gap: 16,
      children: rowChildren,
    } satisfies BoxNode)
  }

  const roomName = wmRoomNames[Math.floor(rand() * wmRoomNames.length)]!

  const tree: BoxNode = {
    width: w, flexDirection: 'column', padding: 14, gap: 10,
    children: [
      { text: roomName, font: `700 ${fontSize + 2}px Inter`, lineHeight: Math.round((fontSize + 2) * 1.4) } satisfies TextNode,
      ...rows,
    ],
  }

  return { tree, objects }
}

// Serialize layout to text tokens — what a small model receives
interface WmTokenEntry {
  name: string
  text: string
  x: number
  y: number
  w: number
  h: number
}

function serializeLayout(layout: ComputedLayout, tree: BoxNode | TextNode, px: number, py: number): WmTokenEntry[] {
  const entries: WmTokenEntry[] = []
  const x = px + layout.x
  const y = py + layout.y

  if (layout.text !== undefined) {
    // Determine a label: use first word if it's a title (bold), or truncate
    const text = layout.text
    const name = text.length <= 20 ? text : text.slice(0, 20) + '...'
    entries.push({
      name,
      text,
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(layout.width),
      h: Math.round(layout.height),
    })
  } else {
    const children = ('children' in tree) ? (tree as BoxNode).children ?? [] : []
    for (let i = 0; i < layout.children.length; i++) {
      if (children[i]) {
        entries.push(...serializeLayout(layout.children[i]!, children[i]!, x, y))
      }
    }
  }
  return entries
}

function renderWorldModel() {
  const fontSize = parseInt(fontSlider.value)
  const w = wmContainerWidth
  const { tree, objects } = buildWorldModelTree(w, fontSize, wmSeed)

  const t0 = performance.now()
  const texturaLayout = computeLayout(tree, { width: w })
  wmLastLayoutTime = performance.now() - t0

  const { layout: yogaLayout } = yogaLayoutTree(tree, w, fontSize)

  const maxHeight = Math.max(texturaLayout.height, yogaLayout.height, 200)
  const canvasH = Math.min(maxHeight + 20, 600)

  const ctxY = setupCanvas(canvasYoga, canvasH)
  const ctxT = setupCanvas(canvasTextura, canvasH)
  const panelW = canvasYoga.clientWidth
  const offsetX = Math.max(0, (panelW - w) / 2)

  // Background
  ctxY.fillStyle = palette.bg
  ctxY.fillRect(0, 0, panelW, canvasH)
  ctxT.fillStyle = palette.bg
  ctxT.fillRect(0, 0, panelW, canvasH)

  // Render layouts
  renderLayout(ctxY, yogaLayout, tree, offsetX, 10, 'worldmodel', true)
  renderLayout(ctxT, texturaLayout, tree, offsetX, 10, 'worldmodel', false)

  // Draw bounding box overlays
  function drawBboxes(ctx: CanvasRenderingContext2D, layout: ComputedLayout, tree: BoxNode | TextNode, px: number, py: number, isYoga: boolean) {
    const x = px + layout.x
    const y = py + layout.y
    if (layout.text !== undefined) {
      ctx.strokeStyle = isYoga ? '#fb923c60' : '#4ade8060'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.strokeRect(x, y, layout.width, layout.height)
      ctx.setLineDash([])
      // Show height label
      ctx.font = '500 9px Inter'
      ctx.fillStyle = isYoga ? '#fb923c' : '#4ade80'
      ctx.fillText(`${Math.round(layout.height)}px`, x + layout.width + 3, y + layout.height / 2 + 3)
    } else {
      const children = ('children' in tree) ? (tree as BoxNode).children ?? [] : []
      for (let i = 0; i < layout.children.length; i++) {
        if (children[i]) drawBboxes(ctx, layout.children[i]!, children[i]!, x, y, isYoga)
      }
    }
  }

  drawBboxes(ctxY, yogaLayout, tree, offsetX, 10, true)
  drawBboxes(ctxT, texturaLayout, tree, offsetX, 10, false)

  // Serialize to tokens
  const yogaTokens = serializeLayout(yogaLayout, tree, 0, 0)
  const texturaTokens = serializeLayout(texturaLayout, tree, 0, 0)

  // Count height errors
  let heightErrors = 0
  let totalHeightDrift = 0
  for (let i = 0; i < Math.min(yogaTokens.length, texturaTokens.length); i++) {
    const yT = yogaTokens[i]!
    const tT = texturaTokens[i]!
    if (Math.abs(yT.h - tT.h) > 2) {
      heightErrors++
      totalHeightDrift += Math.abs(yT.h - tT.h)
    }
  }

  // Render serialized tokens into the output panel
  const tokenPanel = document.getElementById('wm-token-output')!
  let html = ''

  // Show tokens side by side
  html += '<div style="display:flex;gap:16px;font-size:12px;line-height:1.6">'

  // Yoga tokens
  html += '<div style="flex:1;min-width:0">'
  html += '<div style="color:#fb923c;font-weight:600;margin-bottom:6px">Yoga (estimated) tokens:</div>'
  html += '<pre style="margin:0;white-space:pre-wrap;color:#a1a1aa;font-size:11px;font-family:SF Mono,Fira Code,monospace">'
  for (const t of yogaTokens) {
    const matchingTextura = texturaTokens.find(tt => tt.name === t.name)
    const isWrong = matchingTextura && Math.abs(t.h - matchingTextura.h) > 2
    const hStyle = isWrong ? 'color:#ef4444;font-weight:700' : ''
    const yStyle = isWrong && matchingTextura && Math.abs(t.y - matchingTextura.y) > 2 ? 'color:#ef4444;font-weight:700' : ''
    const label = t.name.length > 16 ? t.name.slice(0, 16) + '..' : t.name.padEnd(18)
    html += `<span style="color:#71717a">${label}</span> `
    html += `x=<span>${t.x}</span> `
    html += `y=<span ${yStyle ? `style="${yStyle}"` : ''}>${t.y}</span> `
    html += `w=<span>${t.w}</span> `
    html += `h=<span ${hStyle ? `style="${hStyle}"` : ''}>${t.h}</span>\n`
  }
  html += '</pre></div>'

  // Textura tokens
  html += '<div style="flex:1;min-width:0">'
  html += '<div style="color:#4ade80;font-weight:600;margin-bottom:6px">Textura (accurate) tokens:</div>'
  html += '<pre style="margin:0;white-space:pre-wrap;color:#a1a1aa;font-size:11px;font-family:SF Mono,Fira Code,monospace">'
  for (const t of texturaTokens) {
    const label = t.name.length > 16 ? t.name.slice(0, 16) + '..' : t.name.padEnd(18)
    html += `<span style="color:#71717a">${label}</span> `
    html += `x=<span>${t.x}</span> `
    html += `y=<span>${t.y}</span> `
    html += `w=<span>${t.w}</span> `
    html += `h=<span>${t.h}</span>\n`
  }
  html += '</pre></div>'

  html += '</div>'

  // Query example
  html += '<div style="margin-top:12px;padding:10px;background:#1a1a22;border-radius:6px;border:1px solid #2a2a35;font-size:11px;font-family:SF Mono,Fira Code,monospace">'
  if (objects.length >= 2) {
    const a = texturaTokens.find(t => t.name === objects[0]!.name)
    const b = texturaTokens.find(t => t.name === objects[1]!.name)
    const aY = yogaTokens.find(t => t.name === objects[0]!.name)
    const bY = yogaTokens.find(t => t.name === objects[1]!.name)
    if (a && b && aY && bY) {
      const gapTextura = Math.abs((b.y) - (a.y + a.h))
      const gapYoga = Math.abs((bY.y) - (aY.y + aY.h))
      html += `<span style="color:#71717a">// Query: gap between "${objects[0]!.name}" and "${objects[1]!.name}"</span>\n`
      html += `<span style="color:#fb923c">Yoga answer:    ${gapYoga}px</span>  `
      if (Math.abs(gapYoga - gapTextura) > 2) {
        html += `<span style="color:#ef4444">← wrong by ${Math.abs(gapYoga - gapTextura)}px</span>\n`
      } else {
        html += `\n`
      }
      html += `<span style="color:#4ade80">Textura answer: ${gapTextura}px</span>  <span style="color:#4ade80">← ground truth</span>`
    }
  }
  html += '</div>'

  tokenPanel.innerHTML = html

  // Stats
  const overlaps = countOverlaps(yogaLayout, tree, ctxY)
  const heightDiff = Math.abs(texturaLayout.height - yogaLayout.height)

  document.getElementById('yoga-time')!.textContent = `Height: ${Math.round(yogaLayout.height)}px (estimated)`
  document.getElementById('yoga-nodes')!.textContent = `${heightErrors} wrong heights`
  document.getElementById('textura-time')!.textContent = `Layout: ${wmLastLayoutTime.toFixed(2)}ms`
  document.getElementById('textura-nodes')!.textContent = `Height: ${Math.round(texturaLayout.height)}px`

  document.getElementById('stat-overlap')!.textContent = `${overlaps}`
  document.getElementById('stat-height-diff')!.textContent = `${Math.round(heightDiff)}px`
  document.getElementById('stat-resize-time')!.textContent = `${wmLastLayoutTime.toFixed(2)}ms`
  document.getElementById('stat-dom-time')!.textContent = `${wmGenCount}`

  document.getElementById('wm-generated')!.textContent = `${wmGenCount}`
  document.getElementById('wm-layout-time')!.textContent = `${wmLastLayoutTime.toFixed(2)}ms`
  document.getElementById('wm-bbox-errors')!.textContent = `${heightErrors}`
  document.getElementById('wm-total-drift')!.textContent = `${totalHeightDrift}px`

  document.getElementById('insight-text')!.innerHTML = insights['worldmodel']
}

function resetWorldModel() {
  wmSeed = 1
  wmGenCount = 0
}

function startWorldModel() {
  document.getElementById('worldmodel-bar')!.classList.add('active')
  const btn = document.getElementById('wm-btn')!

  if (wmGenerateInterval !== null) {
    stopWorldModel()
    return
  }

  resetWorldModel()
  btn.textContent = 'Stop'
  btn.classList.add('running')

  // Generate first immediately
  wmSeed = 1
  wmGenCount = 1
  renderWorldModel()

  // Then auto-generate new rooms
  wmGenerateInterval = setInterval(() => {
    wmSeed++
    wmGenCount++
    renderWorldModel()
  }, 1500)
}

function stopWorldModel() {
  if (wmGenerateInterval !== null) {
    clearInterval(wmGenerateInterval)
    wmGenerateInterval = null
  }
  const btn = document.getElementById('wm-btn')
  if (btn) {
    btn.textContent = 'Generate Rooms'
    btn.classList.remove('running')
  }
}

// ── Routing ───────────────────────────────────────────────────

const validScenarios = new Set<ScenarioKey>(['chat', 'cards', 'i18n', 'article', 'stress', 'morph', 'vscroll', 'editor', 'aistream', 'synth', 'agent', 'critic', 'worldmodel'])

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
  stopSynth()
  stopAgent()
  stopCritic()
  stopWorldModel()
  document.getElementById('aistream-bar')!.classList.remove('active')
  document.getElementById('synth-bar')!.classList.remove('active')
  document.getElementById('agent-bar')!.classList.remove('active')
  document.getElementById('critic-bar')!.classList.remove('active')
  document.getElementById('worldmodel-bar')!.classList.remove('active')

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
  } else if (scenario === 'synth') {
    widthSlider.disabled = false
    widthSlider.style.opacity = '1'
    document.getElementById('synth-bar')!.classList.add('active')
    // Generate one sample immediately
    synthCount = 0
    synthTotalTime = 0
    generateOneSynth()
    renderSynth()
  } else if (scenario === 'agent') {
    widthSlider.disabled = false
    widthSlider.style.opacity = '1'
    document.getElementById('agent-bar')!.classList.add('active')
    agentContainerWidth = parseInt(widthSlider.value)
    agentMessages = [
      { author: 'Alice', text: 'Welcome to the team chat!', time: '9:00' },
      { author: 'Bob', text: 'Thanks! Just setting up my environment.', time: '9:01' },
    ]
    renderAgent()
  } else if (scenario === 'critic') {
    widthSlider.disabled = false
    widthSlider.style.opacity = '1'
    document.getElementById('critic-bar')!.classList.add('active')
    const cw = parseInt(widthSlider.value)
    const fs = parseInt(fontSlider.value)
    criticBrokenTree = buildBrokenTree(cw, fs)
    criticIssues = analyzeCriticIssues(criticBrokenTree, computeLayout(criticBrokenTree, { width: cw }), cw, fs)
    criticFixIdx = 0
    renderCritic()
  } else if (scenario === 'worldmodel') {
    widthSlider.disabled = false
    widthSlider.style.opacity = '1'
    document.getElementById('worldmodel-bar')!.classList.add('active')
    wmContainerWidth = parseInt(widthSlider.value)
    resetWorldModel()
    renderWorldModel()
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
  } else if (scenarioSelect.value === 'synth') {
    generateOneSynth()
    renderSynth()
  } else if (scenarioSelect.value === 'agent') {
    agentContainerWidth = parseInt(widthSlider.value)
    renderAgent()
  } else if (scenarioSelect.value === 'critic') {
    renderCritic()
  } else if (scenarioSelect.value === 'worldmodel') {
    wmContainerWidth = parseInt(widthSlider.value)
    renderWorldModel()
  } else {
    render()
  }
})

fontSlider.addEventListener('input', () => {
  fontLabel.textContent = `${fontSlider.value}px`
  if (scenarioSelect.value === 'morph') return
  if (scenarioSelect.value === 'aistream') { renderAiStream(); return }
  if (scenarioSelect.value === 'synth') { generateOneSynth(); renderSynth(); return }
  if (scenarioSelect.value === 'agent') { renderAgent(); return }
  if (scenarioSelect.value === 'critic') { renderCritic(); return }
  if (scenarioSelect.value === 'worldmodel') { renderWorldModel(); return }
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
  if (scenarioSelect.value === 'synth') { renderSynth(); return }
  if (scenarioSelect.value === 'agent') { renderAgent(); return }
  if (scenarioSelect.value === 'critic') { renderCritic(); return }
  if (scenarioSelect.value === 'worldmodel') { renderWorldModel(); return }
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

// Synth buttons
document.getElementById('synth-btn')!.addEventListener('click', startSynth)

document.getElementById('synth-mode-visual')!.addEventListener('click', () => {
  synthShowBbox = false
  document.getElementById('synth-mode-visual')!.classList.add('active')
  document.getElementById('synth-mode-bbox')!.classList.remove('active')
  renderSynth()
})

document.getElementById('synth-mode-bbox')!.addEventListener('click', () => {
  synthShowBbox = true
  document.getElementById('synth-mode-bbox')!.classList.add('active')
  document.getElementById('synth-mode-visual')!.classList.remove('active')
  renderSynth()
})

// Agent button
document.getElementById('agent-btn')!.addEventListener('click', startAgent)

// Critic button
document.getElementById('critic-btn')!.addEventListener('click', startCritic)

// World model button
document.getElementById('wm-btn')!.addEventListener('click', startWorldModel)
