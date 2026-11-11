import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Loader2, LogOut, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { useToastStore } from '../../stores/toast'
import { useShallow } from 'zustand/react/shallow'
import { buttonClass } from '../UI/Button'
import { ProfileEditModal } from '../UI/ProfileEditModal'
import { LastfmSettings } from './LastfmSettings'
import { SlskdSettings } from './SlskdSettings'
import { shortcutList } from '../../lib/shortcuts'
import { LANGUAGE_OPTIONS, getLanguagePreference, setLanguagePreference, type LanguagePreference } from '../../lib/language'

/** Page strings, kept together for later extraction (i18n). */
const TEXT = {
  title: 'Settings',
  account: 'Account',
  server: 'Server',
  user: 'User',
  editProfile: 'Edit profile',
  signOut: 'Sign out',
  playback: 'Playback',
  shortcuts: 'Keyboard shortcuts',
  lastfm: 'Last.fm',
  soulseek: 'Soulseek (slskd)',
  storage: 'Cache and storage',
  storageHint: 'Cached audio is stored locally to speed up playback. Clearing it frees disk space; tracks will be fetched again when played.',
  clearCache: 'Clear audio cache',
  cacheCleared: 'Audio cache cleared',
  cacheFailed: 'Could not clear the cache',
  language: 'Language',
  languageHint: 'Takes effect after restarting the app.',
  about: 'About',
  version: 'Version',
  checkUpdates: 'Check for updates',
  upToDate: 'You are on the latest version',
  updateAvailable: (v: string) => `Version ${v} is available`,
  updateFailed: 'Could not check for updates',
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 border-t border-border pt-6">
      <h2 className="text-heading font-semibold mb-4">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className="text-text-primary truncate">{children}</span>
    </div>
  )
}

export default function SettingsView() {
  const { auth, logout } = useAuthStore(useShallow(s => ({ auth: s.auth, logout: s.logout })))
  const toast = useToastStore(s => s.show)
  const navigate = useNavigate()
  const { hash } = useLocation()
  const [profileOpen, setProfileOpen] = useState(false)
  const [language, setLanguage] = useState<LanguagePreference>(getLanguagePreference)
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)
  const [clearing, setClearing] = useState(false)
  const isMac = window.api?.platform === 'darwin'

  useEffect(() => {
    window.api?.getAppVersion?.().then(setVersion).catch(() => {})
  }, [])

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [hash])

  const handleSignOut = () => {
    logout()
    navigate('/')
  }

  const handleClearCache = async () => {
    setClearing(true)
    try {
      await window.api.clearCache()
      toast(TEXT.cacheCleared, 'success')
    } catch {
      toast(TEXT.cacheFailed, 'error')
    } finally {
      setClearing(false)
    }
  }

  const handleCheckUpdates = async () => {
    setChecking(true)
    try {
      const info = await window.api.checkForUpdates() as { version?: string } | null
      if (info?.version && info.version !== version) toast(TEXT.updateAvailable(info.version), 'success')
      else toast(TEXT.upToDate, 'success')
    } catch {
      toast(TEXT.updateFailed, 'error')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="fade-in max-w-2xl space-y-8 pb-8">
      <h1 className="text-title font-semibold">{TEXT.title}</h1>

      <Section id="account" title={TEXT.account}>
        <Row label={TEXT.server}>{auth?.serverUrl}</Row>
        <Row label={TEXT.user}>{auth?.username}</Row>
        <div className="flex gap-3 mt-4">
          <button onClick={() => setProfileOpen(true)} className={buttonClass('secondary')}>
            <Pencil size={14} /> {TEXT.editProfile}
          </button>
          <button onClick={handleSignOut} className={buttonClass('secondary')}>
            <LogOut size={14} /> {TEXT.signOut}
          </button>
        </div>
      </Section>

      <Section id="playback" title={TEXT.playback}>
        <h3 className="text-sm font-medium mb-2">{TEXT.shortcuts}</h3>
        <dl className="divide-y divide-border text-sm">
          {shortcutList(isMac).map(s => (
            <div key={s.action} className="flex justify-between py-2">
              <dt className="text-text-secondary">{s.action}</dt>
              <dd><kbd className="font-mono text-xs bg-surface-2 border border-border rounded-sm px-1.5 py-0.5">{s.keys}</kbd></dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="lastfm" title={TEXT.lastfm}>
        <LastfmSettings />
      </Section>

      <Section id="soulseek" title={TEXT.soulseek}>
        <SlskdSettings />
      </Section>

      <Section id="storage" title={TEXT.storage}>
        <p className="text-sm text-text-secondary mb-4">{TEXT.storageHint}</p>
        <button onClick={handleClearCache} disabled={clearing} className={buttonClass('secondary')}>
          {clearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} {TEXT.clearCache}
        </button>
      </Section>

      <Section id="language" title={TEXT.language}>
        <select
          value={language}
          onChange={e => {
            const v = e.target.value as LanguagePreference
            setLanguage(v)
            setLanguagePreference(v)
          }}
          className="bg-surface-2 border border-border rounded-sm px-3 py-2 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={TEXT.language}
        >
          {LANGUAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <p className="text-xs text-text-tertiary mt-2">{TEXT.languageHint}</p>
      </Section>

      <Section id="about" title={TEXT.about}>
        <Row label={TEXT.version}>{version || '—'}</Row>
        <button onClick={handleCheckUpdates} disabled={checking} className={`${buttonClass('secondary')} mt-4`}>
          {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {TEXT.checkUpdates}
        </button>
      </Section>

      <ProfileEditModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  )
}
