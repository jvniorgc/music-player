import { useState } from 'react'
import { useAuthStore } from '../../stores/auth'
import { Loader2, Server, AlertCircle } from 'lucide-react'
import { Button, Input } from '../UI/Button'
import AppIcon from '../UI/AppIcon'
import { loadLastLogin } from '../../lib/url'
import { useShallow } from 'zustand/react/shallow'
import { useT, type MessageKey } from '../../i18n'

export default function LoginScreen() {
  const { login, isLoading, error } = useAuthStore(useShallow(s => ({ login: s.login, isLoading: s.isLoading, error: s.error })))
  const { t } = useT()
  const [last] = useState(loadLastLogin)
  const [serverUrl, setServerUrl] = useState(last.serverUrl)
  const [username, setUsername] = useState(last.username)
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (serverUrl.trim() && username.trim()) {
      login(serverUrl, username, password)
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-bg">
      <div className="w-full max-w-sm mx-auto px-6">
        <div className="flex flex-col items-center text-center mb-8">
          <AppIcon size={72} className="mb-4" />
          <h1 className="text-heading font-semibold">Musga</h1>
          <p className="text-text-secondary mt-1 text-sm">{t('login.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('login.server')}</label>
            <div className="relative">
              <Server size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <Input
                type="text"
                value={serverUrl}
                onChange={e => setServerUrl(e.target.value)}
                placeholder="http://192.168.1.100:8096"
                className="pl-9"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('login.user')}</label>
            <Input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={t('login.usernamePlaceholder')}
              autoFocus={!last.username}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">{t('login.password')}</label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('login.passwordPlaceholder')}
              autoFocus={!!last.username}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 rounded-sm px-3 py-2">
              <AlertCircle size={14} className="shrink-0" />
              <span className="flex-1">{error.startsWith('login.') ? t(error as MessageKey) : error}</span>
              <button type="submit" disabled={isLoading} className="text-xs font-medium underline underline-offset-2 hover:text-text-primary shrink-0">
                {t('login.tryAgain')}
              </button>
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading || !serverUrl || !username}
            className="w-full h-9 !mt-5"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t('login.connecting')}
              </>
            ) : (
              t('login.submit')
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
