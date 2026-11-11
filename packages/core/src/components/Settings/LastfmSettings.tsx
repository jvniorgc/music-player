import { useEffect, useState } from 'react'
import { Radio, Loader2, Check, ExternalLink } from 'lucide-react'
import * as lastfm from '../../services/lastfm'
import type { LastfmStatus } from '../../platform'
import { buttonClass } from '../UI/Button'
import { useToastStore } from '../../stores/toast'

const EMPTY_STATUS: LastfmStatus = { configured: false, connected: false, enabled: false, username: null }

export function LastfmSettings() {
  const toast = useToastStore(s => s.show)

  const [status, setStatus] = useState<LastfmStatus>(EMPTY_STATUS)
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [pendingToken, setPendingToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    try {
      setStatus(await lastfm.getStatus())
    } catch {
      /* main not ready / not desktop — leave defaults */
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleSaveCredentials = async () => {
    if (!apiKey.trim() || !apiSecret.trim()) return
    setBusy(true)
    try {
      await lastfm.setCredentials(apiKey.trim(), apiSecret.trim())
      setApiSecret('')
      await refresh()
      toast('Last.fm credentials saved', 'success')
    } catch (err: any) {
      toast(err?.message || 'Failed to save credentials', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleConnect = async () => {
    setBusy(true)
    try {
      const { token } = await lastfm.startAuth()
      setPendingToken(token)
      toast('Authorize the app in your browser, then click "Finish"', 'info')
    } catch (err: any) {
      toast(err?.message || 'Failed to start Last.fm auth', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleFinish = async () => {
    if (!pendingToken) return
    setBusy(true)
    try {
      const { username } = await lastfm.finishAuth(pendingToken)
      setPendingToken(null)
      await refresh()
      toast(`Connected to Last.fm as ${username}`, 'success')
    } catch (err: any) {
      toast(err?.message || 'Failed to finish Last.fm auth', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleToggleEnabled = async () => {
    setBusy(true)
    try {
      await lastfm.setEnabled(!status.enabled)
      await refresh()
    } catch (err: any) {
      toast(err?.message || 'Failed to update scrobbling', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    setBusy(true)
    try {
      await lastfm.disconnect()
      setPendingToken(null)
      await refresh()
      toast('Disconnected from Last.fm', 'success')
    } catch (err: any) {
      toast(err?.message || 'Failed to disconnect', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full border-t border-border pt-5">
      <div className="flex items-center gap-2 mb-3">
        <Radio size={16} className="text-accent" />
        <h3 className="text-xs font-semibold text-text-secondary">Last.fm Scrobbling</h3>
      </div>

      {!status.configured ? (
        <div className="space-y-3">
          <p className="text-xs text-text-tertiary">
            Create an API account at last.fm/api, then paste your API key and shared secret.
          </p>
          <input
            type="text"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="API key"
            className="w-full bg-surface-2 border border-border rounded-sm px-3 h-9 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition"
          />
          <input
            type="password"
            value={apiSecret}
            onChange={e => setApiSecret(e.target.value)}
            placeholder="Shared secret"
            className="w-full bg-surface-2 border border-border rounded-sm px-3 h-9 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition"
          />
          <button
            onClick={handleSaveCredentials}
            disabled={busy || !apiKey.trim() || !apiSecret.trim()}
            className={buttonClass('primary')}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Save credentials
          </button>
        </div>
      ) : !status.connected ? (
        <div className="space-y-3">
          <p className="text-xs text-text-tertiary">Link your Last.fm account to start scrobbling.</p>
          <div className="flex gap-2">
            <button
              onClick={handleConnect}
              disabled={busy}
              className={buttonClass('primary')}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
              {pendingToken ? 'Re-open authorize page' : 'Connect account'}
            </button>
            {pendingToken && (
              <button
                onClick={handleFinish}
                disabled={busy}
                className={buttonClass('secondary')}
              >
                <Check size={14} />
                Finish
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-text-primary">
              <Check size={14} className="text-success" />
              Connected as <span className="font-semibold">{status.username}</span>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={busy}
              className="text-xs text-text-tertiary hover:text-danger transition-colors disabled:opacity-40"
            >
              Disconnect
            </button>
          </div>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-text-secondary">Scrobble played tracks</span>
            <button
              role="switch"
              aria-checked={status.enabled}
              onClick={handleToggleEnabled}
              disabled={busy}
              className={`relative w-10 h-6 rounded-full transition-colors disabled:opacity-40 ${status.enabled ? 'bg-accent' : 'bg-white/15'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${status.enabled ? 'translate-x-4' : ''}`}
              />
            </button>
          </label>
        </div>
      )}
    </div>
  )
}
