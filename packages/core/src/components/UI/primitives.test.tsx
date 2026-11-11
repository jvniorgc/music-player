import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import CoverArt from './CoverArt'
import TrackRow, { TrackIndex } from './TrackRow'
import MediaCard from './MediaCard'
import { Button } from './Button'

afterEach(() => cleanup())

describe('CoverArt', () => {
  it('renders a lazy, async-decoded image when src is set', () => {
    const { container } = render(<CoverArt src="http://img/a.jpg" />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('decoding')).toBe('async')
  })

  it('shows the fallback when there is no src or the image fails', () => {
    const { container, rerender } = render(<CoverArt src={null} fallback={<span>none</span>} />)
    expect(screen.getByText('none')).toBeTruthy()
    rerender(<CoverArt src="http://img/b.jpg" fallback={<span>none</span>} />)
    fireEvent.error(container.querySelector('img')!)
    expect(screen.getByText('none')).toBeTruthy()
    rerender(<CoverArt src="http://img/c.jpg" fallback={<span>none</span>} />)
    expect(container.querySelector('img')).not.toBeNull()
  })
})

describe('TrackRow / TrackIndex', () => {
  it('highlights the current track and forwards clicks', () => {
    const onClick = vi.fn()
    render(<TrackRow title="Song" subtitle="Artist" isCurrent onClick={onClick} />)
    expect(screen.getByText('Song').className).toContain('text-accent')
    fireEvent.click(screen.getByText('Artist'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('omits the subtitle line when falsy', () => {
    render(<TrackRow title="Song" subtitle={false} />)
    expect(screen.getByText('Song').parentElement!.children).toHaveLength(1)
  })

  it('shows equalizer bars instead of the number while playing', () => {
    const { rerender } = render(<TrackIndex number={3} isCurrent isPlaying={false} />)
    expect(screen.getByText('3')).toBeTruthy()
    rerender(<TrackIndex number={3} isCurrent isPlaying />)
    expect(screen.queryByText('3')).toBeNull()
  })
})

describe('MediaCard', () => {
  it('play button does not trigger the card click', () => {
    const onClick = vi.fn()
    const onPlay = vi.fn()
    const { container } = render(<MediaCard title="Album" fallback="x" onClick={onClick} onPlay={onPlay} />)
    fireEvent.click(container.querySelector('button')!)
    expect(onPlay).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('Button', () => {
  it('defaults to type=button and appends extra classes to the variant', () => {
    render(<Button variant="secondary" className="extra">Go</Button>)
    const btn = screen.getByText('Go')
    expect(btn.getAttribute('type')).toBe('button')
    expect(btn.className).toMatch(/bg-surface-2.* extra$/)
  })
})
