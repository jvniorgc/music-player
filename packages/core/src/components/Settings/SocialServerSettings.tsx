import { useEffect, useState } from 'react'
import { Loader2, Zap, Check, X } from 'lucide-react'
import { configure, getConfig, deriveDefaultUrl, loadConfig, testConnection } from '../../services/social'
import { jellyfin } from '../../services/jellyfin'
import { useToastStore } from '../../stores/toast'
import { Input } from '../UI/Button'
import { useT } from '../../i18n'

export function SocialServerSettings() {
  const { t } = useT()
  const toast = useToastStore(s => s.show)
  const [url, setUrl] = useState('')
  const [testing, setTesting] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(null)

  useEffect(() => {
    loadConfig().then(() => setUrl(getConfig().url || deriveDefaultUrl(jellyfin.serverUrl)))
  }, [])

  const handleSave = () => {
    configure(url)
    setConnected(null)
    toast(t('socialServer.saved'), 'success')
  }

  const handleTest = async () => {
    setTesting(true)
    setConnected(null)
    await window.api?.allowOrigin?.(url)?.catch(() => {})
    setConnected(await testConnection(url))
    setTesting(false)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">{t('socialServer.hint')}</p>
      <div>
        <label htmlFor="social-url" className="block text-xs font-medium text-text-secondary mb-1 ml-1">{t('slskd.serverAddress')}</label>
        <Input id="social-url" variant="subtle" type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://jellyfin.example.com/mp-api" />
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleTest}
          disabled={testing || !url}
          className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white px-4 py-2 rounded-sm text-sm font-medium transition-colors disabled:opacity-40"
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          {t('slskd.test')}
        </button>
        <button
          onClick={handleSave}
          disabled={!url}
          className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-sm text-sm font-medium transition-colors disabled:opacity-40"
        >
          <Check size={14} />
          {t('common.save')}
        </button>
        {connected === true && <span className="flex items-center gap-1 text-sm text-success"><Check size={14} /> {t('slskd.connected')}</span>}
        {connected === false && <span className="flex items-center gap-1 text-sm text-danger"><X size={14} /> {t('slskd.connectionFailed')}</span>}
      </div>
    </div>
  )
}
