import { useState, useEffect } from 'react'
import { Download, RefreshCw, X, CheckCircle2 } from 'lucide-react'
import { useT } from '../i18n'

type UpdateState = 'idle' | 'available' | 'downloading' | 'ready'

export default function UpdateDialog() {
  const { t } = useT()
  const [state, setState] = useState<UpdateState>('idle')
  const [version, setVersion] = useState('')
  const [progress, setProgress] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const cleanups: (() => void)[] = []

    cleanups.push(
      window.api.onUpdateAvailable((data) => {
        setVersion(data.version)
        setState('available')
        setDismissed(false)
      })
    )

    cleanups.push(
      window.api.onUpdateDownloadProgress((data) => {
        setProgress(Math.round(data.percent))
      })
    )

    cleanups.push(
      window.api.onUpdateDownloaded(() => {
        setState('ready')
      })
    )

    cleanups.push(
      window.api.onUpdateError(() => {
        setState('idle')
      })
    )

    return () => cleanups.forEach(fn => fn())
  }, [])

  if (state === 'idle' || dismissed) return null

  return (
    <div className="fixed top-4 right-4 z-[9999] w-80 bg-surface-2 border border-border rounded-lg shadow-lg p-4 fade-in">
      {state === 'available' && (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <RefreshCw size={18} className="text-accent shrink-0" />
              <div>
                <p className="text-sm font-medium text-text-primary">{t('update.available')}</p>
                <p className="text-xs text-text-secondary mt-0.5">{t('update.version', { version })}</p>
              </div>
            </div>
            <button
              onClick={() => setDismissed(true)}
              aria-label={t('update.dismiss')}
              title={t('update.dismiss')}
              className="text-text-tertiary hover:text-text-primary transition-colors p-1"
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => {
                setState('downloading')
                window.api.downloadUpdate()
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-sm transition-colors"
            >
              <Download size={13} />
              {t('update.install')}
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-1.5 text-text-secondary hover:text-text-primary text-xs rounded-sm border border-border hover:border-text-tertiary transition-colors"
            >
              {t('update.later')}
            </button>
          </div>
        </>
      )}

      {state === 'downloading' && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Download size={18} className="text-accent" />
            <p className="text-sm font-medium text-text-primary">{t('update.downloading')}</p>
          </div>
          <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-text-tertiary mt-1.5">{progress}%</p>
        </div>
      )}

      {state === 'ready' && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={18} className="text-success" />
            <p className="text-sm font-medium text-text-primary">{t('update.ready')}</p>
          </div>
          <p className="text-xs text-text-secondary mb-3">
            {t('update.restartHint')}
          </p>
          <button
            onClick={() => window.api.installUpdate()}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-sm transition-colors"
          >
            <RefreshCw size={13} />
            {t('update.restart')}
          </button>
        </div>
      )}
    </div>
  )
}
