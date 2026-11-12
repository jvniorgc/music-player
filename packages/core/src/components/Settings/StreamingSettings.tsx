import { useEffect, useState, type ReactNode } from 'react'
import { FolderOpen, FolderPen } from 'lucide-react'
import { useStreamingPrefs } from '../../stores/prefs/streaming'
import { useDownloadStore } from '../../stores/download'
import { useToastStore } from '../../stores/toast'
import { jellyfin } from '../../services/jellyfin'
import { CACHE_LIMIT_OPTIONS, DOWNLOAD_QUALITIES, STREAM_QUALITIES, isLocalServer } from '../../lib/streaming'
import { formatFileSize } from '../../lib/format'
import { formatNumber, useT } from '../../i18n'
import type { Messages } from '../../i18n/en'
import { buttonClass } from '../UI/Button'

const SELECT = 'bg-surface-2 border border-border rounded-sm px-3 py-2 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'

function Switch({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`relative w-10 h-6 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-white/15'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-text-primary">{label}</p>
        {hint && <p className="text-xs text-text-secondary">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

export function StreamingSettings() {
  const { t } = useT()
  const prefs = useStreamingPrefs(s => s.values)
  const setPrefs = useStreamingPrefs(s => s.set)
  const toast = useToastStore(s => s.show)
  const [cache, setCache] = useState<{ usedBytes: number; limitBytes: number } | null>(null)
  const [folder, setFolder] = useState('')
  const local = isLocalServer(jellyfin.serverUrl)

  useEffect(() => {
    window.api.getCacheInfo().then(setCache).catch(() => {})
    window.api.getDownloadsDir().then(setFolder).catch(() => {})
  }, [])

  const sizeLabel = (bytes: number) => bytes >= 1024 ** 3
    ? t('prefs.streaming.gb', { value: formatNumber(bytes / 1024 ** 3) })
    : t('prefs.streaming.mb', { value: formatNumber(bytes / 1024 ** 2) })

  const qualityLabel = (q: string) => q === 'original' ? t('prefs.streaming.original') : t('prefs.streaming.kbps', { value: q })

  const handleLimit = async (bytes: number) => {
    try {
      await window.api.setCacheLimit(bytes)
      setCache(await window.api.getCacheInfo())
    } catch {
      toast(t('prefs.streaming.cacheLimitFailed'), 'error')
    }
  }

  const handleChangeFolder = async () => {
    try {
      const dir = await window.api.chooseDownloadsDir()
      if (dir) setFolder(dir)
    } catch {
      toast(t('prefs.streaming.folderFailed'), 'error')
    }
  }

  const handleOpenFolder = () => {
    window.api.openDownloadsDir().catch(() => toast(t('prefs.streaming.folderFailed'), 'error'))
  }

  const handleAutoDownload = () => {
    const next = !prefs.autoDownloadLiked
    setPrefs({ autoDownloadLiked: next })
    if (next) void useDownloadStore.getState().syncLikedDownloads()
  }

  const qualitySelect = (key: 'localQuality' | 'remoteQuality', label: string) => (
    <select value={prefs[key]} onChange={e => setPrefs({ [key]: e.target.value })} aria-label={label} className={SELECT}>
      {STREAM_QUALITIES.map(q => <option key={q} value={q}>{qualityLabel(q)}</option>)}
    </select>
  )

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-medium">{t('prefs.streaming.quality')}</h3>
        <p className="text-xs text-text-secondary">{local ? t('prefs.streaming.serverLocal') : t('prefs.streaming.serverRemote')}</p>
        <Field label={t('prefs.streaming.qualityLocal')}>{qualitySelect('localQuality', t('prefs.streaming.qualityLocal'))}</Field>
        <Field label={t('prefs.streaming.qualityRemote')}>{qualitySelect('remoteQuality', t('prefs.streaming.qualityRemote'))}</Field>
        <Field label={t('prefs.streaming.dataSaver')} hint={t('prefs.streaming.dataSaverHint')}>
          <Switch checked={prefs.dataSaver} label={t('prefs.streaming.dataSaver')} onToggle={() => setPrefs({ dataSaver: !prefs.dataSaver })} />
        </Field>
      </div>

      <Field
        label={t('prefs.streaming.cacheLimit')}
        hint={cache ? t('prefs.streaming.cacheUsage', { used: formatFileSize(cache.usedBytes), limit: sizeLabel(cache.limitBytes) }) : undefined}
      >
        <select
          value={cache?.limitBytes ?? 2 * 1024 ** 3}
          onChange={e => handleLimit(Number(e.target.value))}
          aria-label={t('prefs.streaming.cacheLimit')}
          className={SELECT}
        >
          {CACHE_LIMIT_OPTIONS.map(b => <option key={b} value={b}>{sizeLabel(b)}</option>)}
        </select>
      </Field>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">{t('prefs.streaming.downloadsFolder')}</h3>
        <p className="text-xs text-text-secondary">{t('prefs.streaming.downloadsFolderHint')}</p>
        <p className="text-sm text-text-primary font-mono truncate" title={folder}>{folder}</p>
        <div className="flex gap-3">
          <button onClick={handleChangeFolder} className={buttonClass('secondary')}>
            <FolderPen size={14} /> {t('prefs.streaming.changeFolder')}
          </button>
          <button onClick={handleOpenFolder} className={buttonClass('secondary')}>
            <FolderOpen size={14} /> {t('prefs.streaming.openFolder')}
          </button>
        </div>
      </div>

      <Field label={t('prefs.streaming.downloadQuality')}>
        <select
          value={prefs.downloadQuality}
          onChange={e => setPrefs({ downloadQuality: e.target.value })}
          aria-label={t('prefs.streaming.downloadQuality')}
          className={SELECT}
        >
          {DOWNLOAD_QUALITIES.map(q => <option key={q} value={q}>{t(`prefs.streaming.download.${q}` as keyof Messages)}</option>)}
        </select>
      </Field>

      <Field label={t('prefs.streaming.autoDownloadLiked')} hint={t('prefs.streaming.autoDownloadHint')}>
        <Switch checked={prefs.autoDownloadLiked} label={t('prefs.streaming.autoDownloadLiked')} onToggle={handleAutoDownload} />
      </Field>
    </div>
  )
}
