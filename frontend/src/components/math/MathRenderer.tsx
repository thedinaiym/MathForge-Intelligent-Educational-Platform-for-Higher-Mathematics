import { InlineMath, BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'

interface MathRendererProps {
  latex: string
  block?: boolean
  className?: string
}

/**
 * Renders a pure LaTeX string using KaTeX.
 * Use block=true for display (centered) mode, false for inline.
 * Input must be raw LaTeX without $ delimiters.
 */
export default function MathRenderer({ latex, block = false, className }: MathRendererProps) {
  if (!latex) return null

  try {
    return (
      <span className={className}>
        {block ? <BlockMath math={latex} /> : <InlineMath math={latex} />}
      </span>
    )
  } catch {
    return <span className={`font-mono text-sm text-red-500 ${className ?? ''}`}>{latex}</span>
  }
}

type Segment =
  | { type: 'text';   content: string }
  | { type: 'inline'; content: string }
  | { type: 'block';  content: string }

/**
 * Renders a mixed text + LaTeX string.
 * Parses $$...$$ (block) and $...$ (inline) delimiters and renders each
 * segment with KaTeX. Plain text segments are rendered as-is.
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  if (!text) return null

  const segments: Segment[] = []
  // Match $$...$$ first (block), then $...$ (inline)
  const re = /\$\$([^$]+)\$\$|\$([^$]+)\$/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    if (match[1] !== undefined) {
      segments.push({ type: 'block', content: match[1] })
    } else {
      segments.push({ type: 'inline', content: match[2] })
    }
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) })
  }

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        try {
          if (seg.type === 'block')  return <BlockMath  key={i} math={seg.content} />
          if (seg.type === 'inline') return <InlineMath key={i} math={seg.content} />
          return <span key={i}>{seg.content}</span>
        } catch {
          return <span key={i} className="font-mono text-sm text-red-500">{seg.content}</span>
        }
      })}
    </span>
  )
}
