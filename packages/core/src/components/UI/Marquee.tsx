import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

const PX_PER_SECOND = 30
const PAUSE_SECONDS = 4

/** Single-line text that scrolls left (and back) when it overflows its container; otherwise renders static. */
export function Marquee({ text, className = '' }: { text: string; className?: string }) {
  const outer = useRef<HTMLSpanElement>(null)
  const inner = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(0)

  useLayoutEffect(() => {
    setOverflow(Math.max(0, inner.current!.scrollWidth - outer.current!.clientWidth))
  }, [text])

  const style = overflow > 0
    ? { '--marquee-distance': `-${overflow}px`, animationDuration: `${Math.ceil(overflow / PX_PER_SECOND) + PAUSE_SECONDS}s` } as CSSProperties
    : undefined

  return (
    <span ref={outer} title={text} className={`block overflow-hidden whitespace-nowrap ${overflow > 0 ? '' : 'truncate'} ${className}`}>
      <span ref={inner} className={overflow > 0 ? 'inline-block animate-marquee' : ''} style={style}>{text}</span>
    </span>
  )
}
