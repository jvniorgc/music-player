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
import { SocialServerSettings } from './SocialServerSettings'
import { EqualizerSettings } from './EqualizerSettings'
import { InterfaceSettings } from './InterfaceSettings'
import { PlaybackPrefsSettings } from './PlaybackPrefsSettings'
import { AudioOutputSettings } from './AudioOutputSettings'
import { StreamingSettings } from './StreamingSettings'
import { ShortcutSettings } from './ShortcutSettings'
import { NotificationSettings } from './NotificationSettings'
import { LANGUAGE_OPTIONS, type LanguagePreference } from '../../lib/language'
import { useI18nStore, useT } from '../../i18n'
import { getDiscordEnabled, setDiscordEnabled } from '../../services/discord'

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
  const { t } = useT()
  const language = useI18nStore(s => s.preference)
  const setLanguage = useI18nStore(s => s.setPreference)
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [discordOn, setDiscordOn] = useState(false)
  const isMac = window.api?.platform === 'darwin'

  useEffect(() => {
    getDiscordEnabled().then(setDiscordOn).catch(() => {})
  }, [])

  const handleToggleDiscord = async () => {
    const next = !discordOn
    try {
      await setDiscordEnabled(next)
      setDiscordOn(next)
    } catch {
      toast(t('settings.discordFailed'), 'error')
    }
  }

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
      toast(t('settings.cacheCleared'), 'success')
    } catch {
      toast(t('settings.cacheFailed'), 'error')
    } finally {
      setClearing(false)
    }
  }

  const handleCheckUpdates = async () => {
    setChecking(true)
    try {
      const info = await window.api.checkForUpdates() as { version?: string } | null
      if (info?.version && info.version !== version) toast(t('settings.updateAvailable', { version: info.version }), 'success')
      else toast(t('settings.upToDate'), 'success')
    } catch {
      toast(t('settings.updateFailed'), 'error')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="fade-in max-w-2xl space-y-8 pb-8">
      <h1 className="text-title font-semibold">{t('settings.title')}</h1>

      <Section id="account" title={t('settings.account')}>
        <Row label={t('settings.server')}>{auth?.serverUrl}</Row>
        <Row label={t('settings.user')}>{auth?.username}</Row>
        <div className="flex gap-3 mt-4">
          <button onClick={() => setProfileOpen(true)} className={buttonClass('secondary')}>
            <Pencil size={14} /> {t('settings.editProfile')}
          </button>
          <button onClick={handleSignOut} className={buttonClass('secondary')}>
            <LogOut size={14} /> {t('settings.signOut')}
          </button>
        </div>
      </Section>

      <Section id="playback" title={t('settings.playback')}>
        <ShortcutSettings isMac={isMac} />
      </Section>

      <Section id="notifications" title={t('prefs.notify.title')}>
        <NotificationSettings />
      </Section>

      <Section id="playback-prefs" title={t('prefs.playback.title')}>
        <PlaybackPrefsSettings />
      </Section>

      <Section id="equalizer" title={t('settings.equalizer')}>
        <EqualizerSettings />
      </Section>

      <Section id="audio-output" title={t('prefs.audio.title')}>
        <AudioOutputSettings />
      </Section>

      <Section id="lastfm" title={'Last.fm'}>
        <LastfmSettings />
      </Section>

      <Section id="discord" title={t('settings.discord')}>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-text-secondary">{t('settings.discordPresence')}</p>
          <button
            role="switch"
            aria-checked={discordOn}
            aria-label={t('settings.discordPresence')}
            onClick={handleToggleDiscord}
            className={`relative w-10 h-6 shrink-0 rounded-full transition-colors ${discordOn ? 'bg-accent' : 'bg-white/15'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${discordOn ? 'translate-x-4' : ''}`} />
          </button>
        </div>
      </Section>

      <Section id="soulseek" title={t('settings.soulseek')}>
        <SlskdSettings />
      </Section>

      <Section id="social-server" title={t('settings.socialServer')}>
        <SocialServerSettings />
      </Section>

      <Section id="streaming" title={t('prefs.streaming.title')}>
        <StreamingSettings />
      </Section>

      <Section id="storage" title={t('settings.storage')}>
        <p className="text-sm text-text-secondary mb-4">{t('settings.storageHint')}</p>
        <button onClick={handleClearCache} disabled={clearing} className={buttonClass('secondary')}>
          {clearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} {t('settings.clearCache')}
        </button>
      </Section>

      <Section id="interface" title={t('prefs.ui.section')}>
        <InterfaceSettings />
      </Section>

      <Section id="language" title={t('settings.language')}>
        <select
          value={language}
          onChange={e => {
            const v = e.target.value as LanguagePreference
            setLanguage(v)
          }}
          className="bg-surface-2 border border-border rounded-sm px-3 py-2 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={t('settings.language')}
        >
          {LANGUAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value === 'system' ? t('settings.languageSystem') : o.label}</option>)}
        </select>
      </Section>

      <Section id="about" title={t('settings.about')}>
        <Row label={t('settings.version')}>{version || '—'}</Row>
        <button onClick={handleCheckUpdates} disabled={checking} className={`${buttonClass('secondary')} mt-4`}>
          {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {t('settings.checkUpdates')}
        </button>
      </Section>

      <ProfileEditModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  )
}
