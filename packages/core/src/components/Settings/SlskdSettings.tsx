import { useEffect, useState } from 'react'
import { Loader2, Zap, Check, X } from 'lucide-react'
import { configure, getConfig, deriveDefaultUrl, isConfigured, testConnection as slskdTestConnection } from '../../services/slskd'
import { jellyfin } from '../../services/jellyfin'
import { useToastStore } from '../../stores/toast'
import { Input } from '../UI/Button'
import { useT } from '../../i18n'

export function SlskdSettings() {
  const { t } = useT()
  const toast = useToastStore(s => s.show)
  const [settingsUrl, setSettingsUrl] = useState('')
  const [settingsUser, setSettingsUser] = useState('')
  const [settingsPass, setSettingsPass] = useState('')
  const [testingConnection, setTestingConnection] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(null)

  useEffect(() => {
    if (!isConfigured()) {
      configure({ url: deriveDefaultUrl(jellyfin.serverUrl), username: 'slskd', password: 'slskd' })
    }
    const cfg = getConfig()
    setSettingsUrl(cfg.url)
    setSettingsUser(cfg.username)
    setSettingsPass(cfg.password)
  }, [])

  const handleSaveSettings = () => {
    configure({ url: settingsUrl, username: settingsUser, password: settingsPass })
    setConnected(null)
    toast(t('slskd.saved'), 'success')
  }

  const handleTestConnection = async () => {
    setTestingConnection(true)
    setConnected(null)
    try {
      configure({ url: settingsUrl, username: settingsUser, password: settingsPass })
      await window.api?.allowOrigin?.(settingsUrl)
      setConnected(await slskdTestConnection({ url: settingsUrl, username: settingsUser, password: settingsPass }))
    } catch {
      setConnected(false)
    } finally {
      setTestingConnection(false)
    }
  }

  return (
    <div>
                <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1 ml-1">{t('slskd.serverAddress')}</label>
          <Input
            variant="subtle"
            type="text"
            value={settingsUrl}
            onChange={e => setSettingsUrl(e.target.value)}
            placeholder="http://192.168.1.100:5030"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-text-secondary mb-1 ml-1">{t('login.user')}</label>
            <Input
              variant="subtle"
              type="text"
              value={settingsUser}
              onChange={e => setSettingsUser(e.target.value)}
              placeholder="slskd"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-text-secondary mb-1 ml-1">{t('login.password')}</label>
            <Input
              variant="subtle"
              type="password"
              value={settingsPass}
              onChange={e => setSettingsPass(e.target.value)}
              placeholder={t('login.passwordPlaceholder')}
            />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleTestConnection}
            disabled={testingConnection || !settingsUrl}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white px-4 py-2 rounded-sm text-sm font-medium transition-colors disabled:opacity-40"
          >
            {testingConnection ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {t('slskd.test')}
          </button>
          <button
            onClick={handleSaveSettings}
            disabled={!settingsUrl}
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-sm text-sm font-medium transition-colors disabled:opacity-40"
          >
            <Check size={14} />
            {t('common.save')}
          </button>
          {connected === true && (
            <span className="flex items-center gap-1 text-sm text-success">
              <Check size={14} /> {t('slskd.connected')}
            </span>
          )}
          {connected === false && (
            <span className="flex items-center gap-1 text-sm text-danger">
              <X size={14} /> {t('slskd.connectionFailed')}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
