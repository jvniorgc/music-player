import { useState, useEffect } from 'react'
import { JellyfinItem, jellyfin } from '../../services/jellyfin'
import {
  searchArtists, getArtistDetails, getArtistImageUrl,
  getArtistImageFromWikidata, MBArtist
} from '../../services/musicbrainz'
import { useToastStore } from '../../stores/toast'
import { Modal } from '../UI/Modal'
import {
  Search, Loader2, Check, X, User, ArrowLeft, Image, MapPin, Calendar
} from 'lucide-react'

interface ArtistMetadataEditorProps {
  artist: JellyfinItem
  open: boolean
  onClose: () => void
  onApplied: () => void
}

type Step = 'search' | 'results' | 'preview'

export default function ArtistMetadataEditor({ artist, open, onClose, onApplied }: ArtistMetadataEditorProps) {
  const toast = useToastStore(s => s.show)

  const [step, setStep] = useState<Step>('search')
  const [query, setQuery] = useState(artist.Name || '')
  const [results, setResults] = useState<MBArtist[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<MBArtist | null>(null)
  const [detailed, setDetailed] = useState<MBArtist | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [applying, setApplying] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loadingImage, setLoadingImage] = useState(false)

  useEffect(() => {
    if (open) {
      setStep('search')
      setQuery(artist.Name || '')
      setResults([])
      setSelected(null)
      setDetailed(null)
      setImageUrl(null)
    }
  }, [open, artist])

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await searchArtists(query.trim())
      setResults(res)
      setStep('results')
    } catch (err) {
      console.error('MusicBrainz artist search error:', err)
      toast('Error searching MusicBrainz', 'error')
    }
    setSearching(false)
  }

  const handleSelect = async (mbArtist: MBArtist) => {
    setSelected(mbArtist)
    setLoadingDetails(true)
    setLoadingImage(true)
    setStep('preview')
    setImageUrl(null)

    try {
      const details = await getArtistDetails(mbArtist.id)
      setDetailed(details)

      // Try to find an artist image
      let img = await getArtistImageUrl(mbArtist.id)
      if (!img && details) {
        img = await getArtistImageFromWikidata(details)
      }
      setImageUrl(img)
    } catch (err) {
      console.error('Failed to get artist details:', err)
      toast('Error loading details', 'error')
    }
    setLoadingDetails(false)
    setLoadingImage(false)
  }

  const handleApply = async () => {
    if (!selected) return
    setApplying(true)

    try {
      // Upload artist image if available
      if (imageUrl) {
        try {
          await jellyfin.uploadImage(artist.Id, imageUrl)
          toast('Artist image updated!', 'success')
        } catch (err) {
          console.warn('Artist image upload failed:', err)
          toast('Could not upload artist image', 'error')
        }
      } else {
        toast('No image found for this artist', 'error')
      }

      onApplied()
      onClose()
    } catch (err) {
      console.error('Failed to apply artist metadata:', err)
      toast('Error applying metadata', 'error')
    }

    setApplying(false)
  }

  const renderSearch = () => (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Search MusicBrainz for artist image
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Artist name..."
          className="flex-1 bg-bg-elevated border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition"
          autoFocus
        />
        <button
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          className="px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40"
        >
          {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        </button>
      </div>
    </div>
  )

  const renderResults = () => (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setStep('search')}
          className="p-1.5 rounded-full hover:bg-white/10 text-text-tertiary"
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-sm text-text-secondary">{results.length} results</span>
      </div>
      <div className="max-h-80 overflow-y-auto space-y-1 -mx-1">
        {results.map(mbArtist => (
          <button
            key={mbArtist.id}
            onClick={() => handleSelect(mbArtist)}
            className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/5 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-bg-elevated flex items-center justify-center flex-shrink-0">
                <User size={16} className="text-text-tertiary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{mbArtist.name}</p>
                <div className="flex items-center gap-2 text-xs text-text-tertiary">
                  {mbArtist.type && <span>{mbArtist.type}</span>}
                  {mbArtist.country && (
                    <span className="flex items-center gap-0.5">
                      <MapPin size={10} />
                      {mbArtist.country}
                    </span>
                  )}
                  {mbArtist['life-span']?.begin && (
                    <span className="flex items-center gap-0.5">
                      <Calendar size={10} />
                      {mbArtist['life-span'].begin.split('-')[0]}
                    </span>
                  )}
                  {mbArtist.disambiguation && (
                    <span className="truncate opacity-70">({mbArtist.disambiguation})</span>
                  )}
                </div>
              </div>
              <ChevronIcon />
            </div>
          </button>
        ))}
        {results.length === 0 && (
          <p className="text-center text-sm text-text-tertiary py-6">No artists found</p>
        )}
      </div>
    </div>
  )

  const renderPreview = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setStep('results')}
          className="p-1.5 rounded-full hover:bg-white/10 text-text-tertiary"
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-sm text-text-secondary">Preview</span>
      </div>

      {loadingDetails ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-text-tertiary" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4">
            {/* Image preview */}
            <div className="w-24 h-24 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0">
              {loadingImage ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 size={20} className="animate-spin text-text-tertiary" />
                </div>
              ) : imageUrl ? (
                <img src={imageUrl} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-tertiary">
                  <User size={32} className="text-text-tertiary" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold truncate">{selected?.name}</h3>
              {selected?.type && (
                <p className="text-xs text-text-tertiary">{selected.type}</p>
              )}
              {selected?.country && (
                <p className="text-xs text-text-tertiary flex items-center gap-1">
                  <MapPin size={10} /> {selected.country}
                </p>
              )}
              {selected?.['life-span']?.begin && (
                <p className="text-xs text-text-tertiary flex items-center gap-1">
                  <Calendar size={10} />
                  {selected['life-span'].begin}
                  {selected['life-span']?.end ? ` — ${selected['life-span'].end}` : ''}
                </p>
              )}
            </div>
          </div>

          {/* Tags */}
          {detailed?.tags && detailed.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {detailed.tags.slice(0, 8).map(tag => (
                <span key={tag.name} className="px-2 py-0.5 rounded-full bg-white/5 text-xs text-text-tertiary">
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          {/* Image status */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-bg-elevated">
            <Image size={16} className={imageUrl ? 'text-green-400' : 'text-text-tertiary'} />
            <span className="text-sm text-text-secondary">
              {loadingImage ? 'Searching for image...' : imageUrl ? 'Image found!' : 'No image available'}
            </span>
          </div>

          {/* Apply button */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-full text-sm text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={applying || !imageUrl}
              className="px-5 py-2.5 rounded-full text-sm font-semibold bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {applying ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Apply Image
            </button>
          </div>
        </>
      )}
    </div>
  )

  return (
    <Modal open={open} title="Artist Image Lookup" onClose={onClose}>
      {step === 'search' && renderSearch()}
      {step === 'results' && renderResults()}
      {step === 'preview' && renderPreview()}
    </Modal>
  )
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-tertiary flex-shrink-0">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}
