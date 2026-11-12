import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Marquee } from './Marquee'

function setSizes(scroll: number, client: number) {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => scroll })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => client })
}

afterEach(() => {
  delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth
})

describe('Marquee', () => {
  it('stays static and truncated when the text fits', () => {
    setSizes(100, 100)
    render(<Marquee text="Short" className="text-xs" />)
    const inner = screen.getByText('Short')
    expect(inner).not.toHaveClass('animate-marquee')
    expect(inner.parentElement).toHaveClass('truncate', 'text-xs')
    expect(inner.parentElement).toHaveAttribute('title', 'Short')
  })

  it('scrolls left by the overflow distance when the text is too long', () => {
    setSizes(250, 100)
    render(<Marquee text="A very long song title" />)
    const inner = screen.getByText('A very long song title')
    expect(inner).toHaveClass('animate-marquee')
    expect(inner.style.getPropertyValue('--marquee-distance')).toBe('-150px')
    expect(inner.style.animationDuration).toBe('9s')
    expect(inner.parentElement).not.toHaveClass('truncate')
  })
})
