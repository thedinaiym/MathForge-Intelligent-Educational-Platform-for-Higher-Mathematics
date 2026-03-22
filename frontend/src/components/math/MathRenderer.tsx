import { InlineMath, BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'

interface MathRendererProps {
  latex: string
  block?: boolean
  className?: string
}

/**
 * Renders a LaTeX string using KaTeX.
 * Use block=true for display (centered) mode, false for inline.
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
    // Fall back to plain text if LaTeX is malformed
    return <span className={`font-mono text-sm text-red-500 ${className ?? ''}`}>{latex}</span>
  }
}
