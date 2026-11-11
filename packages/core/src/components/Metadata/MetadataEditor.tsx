import { useState, useEffect } from 'react'
import { JellyfinItem, jellyfin } from '../../services/jellyfin'
import {
  searchReleases, getReleaseDetails, getCoverArtUrl, hasCoverArt, getArtistName,
  formatMBDate, getLabel, MBRelease, MBTrack
} from '../../services/musicbrainz'
import { useToastStore } from '../../stores/toast'
import { Search, Loader2, X, Disc3, Calendar, Tag, Music, ArrowLeft, ChevronRight, Download, Trash2 } from 'lucide-react'
import { Button, Input, buttonClass } from '../UI/Button'

interface MetadataEditorProps {
  album: JellyfinItem
  tracks: JellyfinItem[]
  open: boolean
  onClose: () => void
  onApplied: () => void
}

type Step = 'search' | 'results' | 'preview'

export default function MetadataEditor({ album, tracks, open, onClose, onApplied }: MetadataEditorProps) {
  const toast = useToastStore(s => s.show)

  const [step, setStep] = useState<Step>('search')
  const [query, setQuery] = useState(album.Name || '')
  const [artistQuery, setArtistQuery] = useState(album.AlbumArtist || '')
  const [results, setResults] = useState<MBRelease[]>([])
  const [searching, setSearching] = useState(false)
  const [detailed, setDetailed] = useState<MBRelease | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [applying, setApplying] = useState(false)
  const [coverAvailable, setCoverAvailable] = useState(false)

  // Options for what to apply
  const [applyTitle, setApplyTitle] = useState(true)
  const [applyArtist, setApplyArtist] = useState(true)
  const [applyYear, setApplyYear] = useState(true)
  const [applyCover, setApplyCover] = useState(true)
  const [applyTracks, setApplyTracks] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  useEffect(() => {
    if (open) {
      setStep('search')
      setQuery(album.Name || '')
      setArtistQuery(album.AlbumArtist || '')
      setResults([])
      setDetailed(null)
    }
  }, [open, album])

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await searchReleases(query.trim(), artistQuery.trim() || undefined)
      setResults(res)
      setStep('results')
    } catch (err) {
      console.error('MusicBrainz search error:', err)
      toast('Error searching MusicBrainz', 'error')
    }
    setSearching(false)
  }

  const handleSelect = async (release: MBRelease) => {
    setLoadingDetails(true)
    setStep('preview')
    try {
      const details = await getReleaseDetails(release.id)
      setDetailed(details)

      // Check if cover art exists
      setCoverAvailable(await hasCoverArt(release.id))
    } catch (err) {
      console.error('Failed to get release details:', err)
      toast('Error loading details', 'error')
    }
    setLoadingDetails(false)
  }

  const handleApply = async () => {
    if (!detailed) return
    setApplying(true)

    try {
      // 1. Update album metadata
      const albumUpdates: Record<string, any> = {}
      if (applyTitle) albumUpdates.Name = detailed.title
      if (applyArtist) {
        const artist = getArtistName(detailed)
        if (artist) {
          albumUpdates.AlbumArtist = artist
          albumUpdates.AlbumArtists = detailed['artist-credit']?.map(ac => ({
            Name: ac.artist.name, Id: ac.artist.id
          }))
        }
      }
      if (applyYear && detailed.date) {
        albumUpdates.ProductionYear = parseInt(formatMBDate(detailed.date))
        albumUpdates.PremiereDate = detailed.date.length >= 10 ? `${detailed.date}T00:00:00.0000000Z` : null
      }

      if (Object.keys(albumUpdates).length > 0) {
        await jellyfin.updateItem(album.Id, albumUpdates)
      }

      // 2. Upload cover art
      if (applyCover && coverAvailable) {
        try {
          const coverUrl = getCoverArtUrl(detailed.id, 1200)
          await jellyfin.uploadImage(album.Id, coverUrl)
        } catch (err) {
          console.warn('Cover art upload failed:', err)
          toast('Cover art could not be updated', 'error')
        }
      }

      // 3. Update track metadata
      if (applyTracks && detailed.media) {
        const mbTracks: MBTrack[] = []
        for (const media of detailed.media) {
          if (media.tracks) mbTracks.push(...media.tracks)
        }

        const albumArtist = applyArtist ? getArtistName(detailed) : undefined

        for (let i = 0; i < Math.min(tracks.length, mbTracks.length); i++) {
          const jellyTrack = tracks[i]
          const mbTrack = mbTracks[i]
          try {
            const trackUpdates: Record<string, any> = {
              Name: mbTrack.recording.title,
              IndexNumber: mbTrack.position
            }
            // Propagate album artist to tracks so Jellyfin resolves the correct artist entity
            if (albumArtist) {
              trackUpdates.AlbumArtist = albumArtist
              trackUpdates.Artists = [albumArtist]
              trackUpdates.AlbumArtists = detailed['artist-credit']?.map(ac => ({
                Name: ac.artist.name, Id: ac.artist.id
              }))
            }
            await jellyfin.updateItem(jellyTrack.Id, trackUpdates)
          } catch (err) {
            console.warn(`Failed to update track ${i + 1}:`, err)
          }
        }
      }

      // 4. Refresh item so Jellyfin re-indexes artist associations
      try {
        await jellyfin.refreshItem(album.Id)
      } catch {
        // Non-critical, ignore
      }

      toast('Metadata updated', 'success')
      onApplied()
      onClose()
    } catch (err) {
      console.error('Failed to apply metadata:', err)
      toast('Error applying metadata', 'error')
    }

    setApplying(false)
  }

  const handleClear = async () => {
    setClearing(true)
    try {
      // Clear album metadata
      await jellyfin.updateItem(album.Id, {
        Name: '',
        AlbumArtist: '',
        AlbumArtists: [],
        ProductionYear: null,
        PremiereDate: null,
        Genres: [],
        Tags: [],
        Studios: []
      })

      // Delete cover art
      try {
        await jellyfin.deleteImage(album.Id)
      } catch {
        // Image might not exist, ignore
      }

      // Clear track metadata
      for (const track of tracks) {
        try {
          await jellyfin.updateItem(track.Id, {
            Name: '',
            IndexNumber: null,
            Artists: [],
            AlbumArtist: ''
          })
        } catch (err) {
          console.warn(`Failed to clear track ${track.Name}:`, err)
        }
      }

      toast('Metadata removed', 'success')
      onApplied()
      onClose()
    } catch (err) {
      console.error('Failed to clear metadata:', err)
      toast('Error clearing metadata', 'error')
    }
    setClearing(false)
    setShowClearConfirm(false)
  }

  if (!open) return null

  const allTracks = detailed?.media?.flatMap(m => m.tracks || []) || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-surface-1 rounded-lg shadow-lg w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            {step !== 'search' && (
              <button
                onClick={() => setStep(step === 'preview' ? 'results' : 'search')}
                className="p-1 rounded-full hover:bg-white/10 text-text-tertiary transition-colors"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <h2 className="text-lg font-semibold">
              {step === 'search' && 'Search metadata'}
              {step === 'results' && 'Results'}
              {step === 'preview' && 'Preview'}
            </h2>
          </div>
          <Button variant="icon" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* STEP: Search */}
          {step === 'search' && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                Search MusicBrainz metadata to update this album.
              </p>
              <div>
                <label className="text-xs text-text-tertiary mb-1.5 block">Album</label>
                <Input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Album name"

                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-text-tertiary mb-1.5 block">Artist (optional)</label>
                <Input
                  type="text"
                  value={artistQuery}
                  onChange={e => setArtistQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Artist name"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={searching || !query.trim()}
                className={buttonClass('primary')}
              >
                {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                Search
              </button>

              {/* Separator */}
              <div className="border-t border-border pt-4 mt-2">
                <h4 className="text-xs text-text-tertiary mb-2">Actions</h4>
                {!showClearConfirm ? (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="flex items-center gap-2 text-danger hover:text-danger text-sm transition-colors"
                  >
                    <Trash2 size={15} />
                    Clear all metadata
                  </button>
                ) : (
                  <div className="bg-danger/10 border border-danger/30 rounded-md p-4">
                    <p className="text-sm text-danger mb-3">
                      This will delete the title, artist, year, cover art, and track names. Do you want to continue?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleClear}
                        disabled={clearing}
                        className={buttonClass('danger')}
                      >
                        {clearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        {clearing ? 'Clearing...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setShowClearConfirm(false)}
                        className={buttonClass('secondary')}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP: Results */}
          {step === 'results' && (
            <div className="space-y-2">
              {results.length === 0 ? (
                <div className="text-center py-12 text-text-tertiary">
                  <Search size={32} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No results found</p>
                </div>
              ) : (
                results.map(release => (
                  <button
                    key={release.id}
                    onClick={() => handleSelect(release)}
                    className="w-full flex items-center gap-4 px-4 py-3 rounded-sm hover:bg-white/5 transition-colors text-left"
                  >
                    <Disc3 size={20} className="text-text-tertiary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{release.title}</p>
                      <p className="text-xs text-text-secondary truncate">
                        {getArtistName(release)}
                        {release.date ? ` · ${formatMBDate(release.date)}` : ''}
                        {release.country ? ` · ${release.country}` : ''}
                        {release.media?.[0]?.['track-count'] ? ` · ${release.media[0]['track-count']} tracks` : ''}
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-text-tertiary shrink-0" />
                  </button>
                ))
              )}
            </div>
          )}

          {/* STEP: Preview */}
          {step === 'preview' && (
            <div className="space-y-6">
              {loadingDetails ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-text-tertiary" />
                </div>
              ) : detailed && (
                <>
                  {/* Release info */}
                  <div className="flex gap-5">
                    {coverAvailable ? (
                      <img
                        src={getCoverArtUrl(detailed.id, 250)}
                        className="w-28 h-28 rounded-md object-cover shadow-lg shrink-0"
                        alt=""
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-28 h-28 rounded-md bg-surface-2 flex items-center justify-center shrink-0">
                        <Disc3 size={32} className="text-text-tertiary" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold truncate">{detailed.title}</h3>
                      <p className="text-sm text-accent truncate">{getArtistName(detailed)}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-text-secondary">
                        {detailed.date && <span className="flex items-center gap-1"><Calendar size={12} /> {detailed.date}</span>}
                        {getLabel(detailed) && <span className="flex items-center gap-1"><Tag size={12} /> {getLabel(detailed)}</span>}
                        {detailed.media && <span className="flex items-center gap-1"><Music size={12} /> {allTracks.length} tracks</span>}
                      </div>
                    </div>
                  </div>

                  {/* Options */}
                  <div className="space-y-2">
                    <h4 className="text-xs text-text-tertiary">What to update</h4>
                    <ToggleOption checked={applyTitle} onChange={setApplyTitle} label="Album title" value={detailed.title} />
                    <ToggleOption checked={applyArtist} onChange={setApplyArtist} label="Artist" value={getArtistName(detailed)} />
                    <ToggleOption checked={applyYear} onChange={setApplyYear} label="Year" value={formatMBDate(detailed.date)} />
                    <ToggleOption checked={applyCover} onChange={setApplyCover} label="Cover art" value={coverAvailable ? 'Available' : 'Unavailable'} disabled={!coverAvailable} />
                    <ToggleOption checked={applyTracks} onChange={setApplyTracks} label="Track names" value={`${Math.min(tracks.length, allTracks.length)} tracks`} />
                  </div>

                  {/* Track comparison */}
                  {applyTracks && allTracks.length > 0 && (
                    <div>
                      <h4 className="text-xs text-text-tertiary mb-2">Tracks</h4>
                      <div className="bg-surface-2/50 rounded-md overflow-hidden text-xs">
                        <div className="flex px-4 py-2 border-b border-border text-text-tertiary">
                          <span className="w-8">#</span>
                          <span className="flex-1">Current</span>
                          <span className="flex-1">MusicBrainz</span>
                        </div>
                        {allTracks.slice(0, tracks.length).map((mbTrack, i) => {
                          const current = tracks[i]
                          const changed = current?.Name !== mbTrack.recording.title
                          return (
                            <div key={mbTrack.id} className={`flex px-4 py-1.5 ${changed ? 'bg-accent/5' : ''}`}>
                              <span className="w-8 text-text-tertiary">{mbTrack.position}</span>
                              <span className="flex-1 truncate text-text-secondary">{current?.Name || '—'}</span>
                              <span className={`flex-1 truncate ${changed ? 'text-accent font-medium' : 'text-text-secondary'}`}>
                                {mbTrack.recording.title}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'preview' && detailed && !loadingDetails && (
          <div className="px-6 py-4 border-t border-border flex justify-end gap-3 shrink-0">
            <Button
              variant="secondary"
              onClick={onClose}
            >
              Cancel
            </Button>
            <button
              onClick={handleApply}
              disabled={applying}
              className={buttonClass('primary')}
            >
              {applying ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {applying ? 'Applying...' : 'Apply metadata'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ToggleOption({ checked, onChange, label, value, disabled }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  value: string
  disabled?: boolean
}) {
  return (
    <label className={`flex items-center gap-3 px-4 py-2.5 rounded-sm hover:bg-white/5 transition-colors cursor-pointer ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
      <input
        type="checkbox"
        checked={checked && !disabled}
        onChange={e => !disabled && onChange(e.target.checked)}
        className="w-4 h-4 rounded accent-accent"
      />
      <div className="min-w-0 flex-1">
        <span className="text-sm">{label}</span>
        {value && <span className="text-xs text-text-tertiary ml-2">— {value}</span>}
      </div>
    </label>
  )
}
