// --- Input types: declarative UI tree description ---

/** CSS-like flexbox properties shared by all container nodes. */
export interface FlexProps {
  /** Default: 'column' */
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse'
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse'
  justifyContent?:
    | 'flex-start'
    | 'center'
    | 'flex-end'
    | 'space-between'
    | 'space-around'
    | 'space-evenly'
  alignItems?:
    | 'flex-start'
    | 'center'
    | 'flex-end'
    | 'stretch'
    | 'baseline'
  alignSelf?:
    | 'auto'
    | 'flex-start'
    | 'center'
    | 'flex-end'
    | 'stretch'
    | 'baseline'
  alignContent?:
    | 'flex-start'
    | 'center'
    | 'flex-end'
    | 'stretch'
    | 'space-between'
    | 'space-around'
    | 'space-evenly'

  flexGrow?: number
  flexShrink?: number
  flexBasis?: number | 'auto'

  width?: number | 'auto'
  height?: number | 'auto'
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number

  padding?: number
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
  paddingHorizontal?: number
  paddingVertical?: number

  margin?: number | 'auto'
  marginTop?: number | 'auto'
  marginRight?: number | 'auto'
  marginBottom?: number | 'auto'
  marginLeft?: number | 'auto'
  marginHorizontal?: number | 'auto'
  marginVertical?: number | 'auto'

  border?: number
  borderTop?: number
  borderRight?: number
  borderBottom?: number
  borderLeft?: number

  gap?: number
  rowGap?: number
  columnGap?: number

  position?: 'relative' | 'absolute'
  top?: number
  right?: number
  bottom?: number
  left?: number

  aspectRatio?: number
  overflow?: 'visible' | 'hidden' | 'scroll'
  display?: 'flex' | 'none'
}

/** A text leaf node. Has text content, font, and lineHeight for measurement. */
export interface TextNode extends FlexProps {
  text: string
  /** Canvas font shorthand, e.g. '16px Inter' */
  font: string
  /** Line height in pixels */
  lineHeight: number
  /** Pretext whiteSpace mode */
  whiteSpace?: 'normal' | 'pre-wrap'
}

/** A container (box) node that can have children. */
export interface BoxNode extends FlexProps {
  children?: LayoutNode[]
}

/** A node in the declarative layout tree. */
export type LayoutNode = TextNode | BoxNode

/** Type guard: is this node a text leaf? */
export function isTextNode(node: LayoutNode): node is TextNode {
  return 'text' in node && typeof (node as TextNode).text === 'string'
}

// --- Output types: computed layout geometry ---

/** Computed layout for a single node in the tree. */
export interface ComputedLayout {
  x: number
  y: number
  width: number
  height: number
  children: ComputedLayout[]
  /** Present only on text nodes: the measured line count. */
  lineCount?: number
  /** Present only on text nodes: the original text content. */
  text?: string
}
