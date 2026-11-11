import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PopularitySummary, TrackPopularity } from './Popularity'
import { _resetPopularity, usePopularityStore, CACHE_STORAGE_KEY } from '../../services/popularity'
import type { JellyfinItem } from '../../services/jellyfin'

const track: JellyfinItem = { Id: 't', Name: 'Airbag', Type: 'Audio', Artists: ['Radiohead'] }

describe('Popularity UI', () => {
  beforeEach(() => { localStorage.removeItem(CACHE_STORAGE_KEY); _resetPopularity() })

  it('renders a compact header summary', () => {
    render(<PopularitySummary stats={{ listeners: 1_234_567, playcount: 15_000_000, userPlaycount: 42 }} />)
    expect(screen.getByTestId('popularity-summary')).toHaveTextContent('1.2M listeners · 15M plays · 42 by you')
  })

  it('renders nothing without stats', () => {
    const { container } = render(<PopularitySummary stats={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('reserves space while loading, then shows a meter with an exact tooltip', async () => {
    usePopularityStore.setState({ enabled: true, available: true, loaded: true, maxPlays: { g: 2000 } })
    vi.mocked(window.api.lastfmGetInfo).mockResolvedValue({ track: { listeners: '1500', playcount: '1000' } })
    render(<TrackPopularity item={track} group="g" />)
    const meter = screen.getByTestId('track-popularity')
    expect(meter).toHaveClass('w-[18px]')
    await waitFor(() => expect(meter).toHaveAttribute('data-level', '3'))
    expect(meter).toHaveAttribute('title', '1,500 listeners · 1,000 plays on Last.fm')
  })
})
