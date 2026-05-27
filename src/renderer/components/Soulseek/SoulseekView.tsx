import { useState, useEffect, useRef, useCallback } from 'react'
import {
  startSearch, getSearch, getSearchResponses, deleteSearch, downloadFiles, getDownloads, removeDownload, removeCompletedDownloads,
  SlskdResponse, SlskdFile, SlskdSearch, SlskdTransferGroup,
  isAudioFile, getFileName, getFileExtension, formatFileSize, formatSpeed, formatDuration,
  groupFilesByDirectory, configure, getConfig, deriveDefaultUrl, isConfigured
} from '../../services/slskd'
import { jellyfin } from '../../services/jellyfin'
import { useToastStore } from '../../stores/toast'
import {
  Search, Loader2, Download, FolderDown, ChevronDown, ChevronRight,
  User, HardDrive, Zap, Check, X, Music, AlertCircle, RefreshCw, Settings, Filter
} from 'lucide-react'

type Tab = 'search' | 'transfers'

export default function SoulseekView() {
  const toast = useToastStore(s => s.show)

  // Settings state
  const [showSettings, setShowSettings] = useState(false)
  const [settingsUrl, setSettingsUrl] = useState('')
  const [settingsUser, setSettingsUser] = useState('')
  const [settingsPass, setSettingsPass] = useState('')
  const [testingConnection, setTestingConnection] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(null)

  // Auto-configure on mount
  useEffect(() => {
    if (!isConfigured()) {
      const defaultUrl = deriveDefaultUrl(jellyfin.serverUrl)
      configure({ url: defaultUrl, username: 'slskd', password: 'slskd' })
    }
    const cfg = getConfig()
    setSettingsUrl(cfg.url)
    setSettingsUser(cfg.username)
    setSettingsPass(cfg.password)
  }, [])

  // Search state
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchId, setSearchId] = useState<string | null>(null)
  const [searchState, setSearchState] = useState<SlskdSearch | null>(null)
  const [responses, setResponses] = useState<SlskdResponse[]>([])
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set())
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const currentSearchRef = useRef<string | null>(null)

  // Transfers state
  const [tab, setTab] = useState<Tab>('search')
  const [transfers, setTransfers] = useState<SlskdTransferGroup[]>([])
  const [loadingTransfers, setLoadingTransfers] = useState(false)
  const transferPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Format filter state
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set())

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (transferPollRef.current) clearInterval(transferPollRef.current)
    }
  }, [])

  // Poll transfers when on transfers tab
  useEffect(() => {
    if (tab === 'transfers') {
      loadTransfers()
      transferPollRef.current = setInterval(loadTransfers, 3000)
    } else {
      if (transferPollRef.current) {
        clearInterval(transferPollRef.current)
        transferPollRef.current = null
      }
    }
    return () => {
      if (transferPollRef.current) clearInterval(transferPollRef.current)
    }
  }, [tab])

  const loadTransfers = async () => {
    try {
      const data = await getDownloads()
      setTransfers(data)
    } catch (err) {
      console.error('Failed to load transfers:', err)
    }
  }

  const handleSearch = async () => {
    if (!query.trim()) return

    // Cancel previous search polling
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }

    // Clean up old search on slskd
    if (searchId) {
      deleteSearch(searchId).catch(() => {})
    }

    setSearching(true)
    setResponses([])
    setSearchState(null)
    setExpandedUsers(new Set())
    setExpandedDirs(new Set())
    setActiveFormats(new Set())

    try {
      const search = await startSearch(query.trim())
      setSearchId(search.id)
      setSearchState(search)
      currentSearchRef.current = search.id

      // Poll for results
      pollRef.current = setInterval(async () => {
        if (currentSearchRef.current !== search.id) {
          if (pollRef.current) clearInterval(pollRef.current)
          return
        }

        try {
          const status = await getSearch(search.id)
          setSearchState(status)

          if (status.responseCount > 0) {
            const resps = await getSearchResponses(search.id)
            // Sort: free slot first, then by upload speed
            resps.sort((a, b) => {
              if (a.hasFreeUploadSlot !== b.hasFreeUploadSlot) return a.hasFreeUploadSlot ? -1 : 1
              return b.uploadSpeed - a.uploadSpeed
            })
            // Filter to only show users with audio files
            const withAudio = resps.filter(r =>
              r.files.some(f => isAudioFile(f.filename))
            )
            setResponses(withAudio)
          }

          if (status.isComplete || status.state.includes('Completed')) {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            setSearching(false)
          }
        } catch (err) {
          console.error('Poll error:', err)
        }
      }, 2000)
    } catch (err) {
      console.error('Search error:', err)
      toast('Error searching Soulseek', 'error')
      setSearching(false)
    }
  }

  const handleDownloadFile = async (username: string, file: SlskdFile) => {
    try {
      await downloadFiles(username, [{ filename: file.filename, size: file.size }])
      toast(`Download started: ${getFileName(file.filename)}`, 'success')
    } catch (err) {
      console.error('Download error:', err)
      toast('Error starting download', 'error')
    }
  }

  const handleDownloadFolder = async (username: string, files: SlskdFile[]) => {
    try {
      const audioFiles = files.filter(f => isAudioFile(f.filename))
      await downloadFiles(username, audioFiles.map(f => ({ filename: f.filename, size: f.size })))
      toast(`Download of ${audioFiles.length} files started`, 'success')
    } catch (err) {
      console.error('Folder download error:', err)
      toast('Error starting downloads', 'error')
    }
  }

  const handleRefreshLibrary = async () => {
    try {
      await jellyfin.refreshItem(jellyfin.userId!)
      toast('Jellyfin library scan started', 'success')
    } catch {
      // Try alternative endpoint
      try {
        const res = await fetch(`${jellyfin.serverUrl}/Library/Refresh`, {
          method: 'POST',
          headers: { 'X-Emby-Authorization': `MediaBrowser Token="${jellyfin.token}"` }
        })
        if (res.ok) toast('Jellyfin library scan started', 'success')
        else toast('No permission to scan the library', 'error')
      } catch {
        toast('Error updating library', 'error')
      }
    }
  }

  const toggleUser = (username: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev)
      if (next.has(username)) next.delete(username)
      else next.add(username)
      return next
    })
  }

  const toggleDir = (key: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSaveSettings = () => {
    configure({ url: settingsUrl, username: settingsUser, password: settingsPass })
    setConnected(null)
    setShowSettings(false)
    toast('slskd settings saved', 'success')
  }

  const handleTestConnection = async () => {
    setTestingConnection(true)
    setConnected(null)
    try {
      configure({ url: settingsUrl, username: settingsUser, password: settingsPass })
      const res = await fetch(`${settingsUrl.replace(/\/+$/, '')}/api/v0/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: settingsUser, password: settingsPass })
      })
      setConnected(res.ok)
    } catch {
      setConnected(false)
    } finally {
      setTestingConnection(false)
    }
  }

  // Compute format counts from search results
  const allAudioFiles = responses.flatMap(r => r.files.filter(f => isAudioFile(f.filename)))
  const formatCounts = allAudioFiles.reduce<Record<string, number>>((acc, f) => {
    const ext = getFileExtension(f.filename).toUpperCase()
    if (ext) acc[ext] = (acc[ext] || 0) + 1
    return acc
  }, {})
  const availableFormats = Object.entries(formatCounts).sort((a, b) => b[1] - a[1])

  const toggleFormat = (fmt: string) => {
    setActiveFormats(prev => {
      const next = new Set(prev)
      if (next.has(fmt)) next.delete(fmt)
      else next.add(fmt)
      return next
    })
  }

  // Filter responses by active formats
  const filteredResponses = activeFormats.size > 0
    ? responses
        .map(r => ({
          ...r,
          files: r.files.filter(f => {
            if (!isAudioFile(f.filename)) return false
            return activeFormats.has(getFileExtension(f.filename).toUpperCase())
          })
        }))
        .filter(r => r.files.length > 0)
    : responses

  return (
    <div className="fade-in">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Soulseek</h1>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-white/10 text-accent' : 'text-text-tertiary hover:text-text-primary hover:bg-white/5'}`}
          title="slskd settings"
        >
          <Settings size={18} />
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-bg-elevated border border-border rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold mb-4">slskd connection</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1 ml-1">Server address</label>
              <input
                type="text"
                value={settingsUrl}
                onChange={e => setSettingsUrl(e.target.value)}
                placeholder="http://192.168.1.100:5030"
                className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-text-secondary mb-1 ml-1">User</label>
                <input
                  type="text"
                  value={settingsUser}
                  onChange={e => setSettingsUser(e.target.value)}
                  placeholder="slskd"
                  className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-text-secondary mb-1 ml-1">Password</label>
                <input
                  type="password"
                  value={settingsPass}
                  onChange={e => setSettingsPass(e.target.value)}
                  placeholder="password"
                  className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleTestConnection}
                disabled={testingConnection || !settingsUrl}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
              >
                {testingConnection ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                Test connection
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={!settingsUrl}
                className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
              >
                <Check size={14} />
                Save
              </button>
              {connected === true && (
                <span className="flex items-center gap-1 text-sm text-green-400">
                  <Check size={14} /> Connected
                </span>
              )}
              {connected === false && (
                <span className="flex items-center gap-1 text-sm text-red-400">
                  <X size={14} /> Connection failed
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-bg-elevated/50 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('search')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'search' ? 'bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Search size={14} className="inline mr-2 -mt-0.5" />
          Search
        </button>
        <button
          onClick={() => setTab('transfers')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'transfers' ? 'bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Download size={14} className="inline mr-2 -mt-0.5" />
          Transfers
        </button>
      </div>

      {/* Search Tab */}
      {tab === 'search' && (
        <div>
          {/* Search bar */}
          <div className="flex gap-3 mb-6">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Search songs, albums, artists..."
                className="w-full bg-bg-elevated border border-border rounded-xl pl-11 pr-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-40"
            >
              {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Search
            </button>
          </div>

          {/* Search status */}
          {searchState && (
            <div className="flex items-center gap-3 mb-4 text-sm text-text-secondary">
              {searching && <Loader2 size={14} className="animate-spin text-accent" />}
              <span>
                {searchState.responseCount} users · {searchState.fileCount} files
                {searchState.isComplete && ' · Complete'}
              </span>
            </div>
          )}

          {/* Format filters */}
          {availableFormats.length > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Filter size={14} className="text-text-tertiary" />
              <button
                onClick={() => setActiveFormats(new Set())}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeFormats.size === 0 ? 'bg-accent text-white' : 'bg-white/5 text-text-secondary hover:bg-white/10'
                }`}
              >
                All
              </button>
              {availableFormats.map(([fmt, count]) => (
                <button
                  key={fmt}
                  onClick={() => toggleFormat(fmt)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeFormats.has(fmt) ? 'bg-accent text-white' : 'bg-white/5 text-text-secondary hover:bg-white/10'
                  }`}
                >
                  {fmt} <span className="opacity-60">({count})</span>
                </button>
              ))}
            </div>
          )}

          {/* Results */}
          <div className="space-y-2">
            {filteredResponses.map(response => (
              <UserResult
                key={response.username}
                response={response}
                expanded={expandedUsers.has(response.username)}
                expandedDirs={expandedDirs}
                onToggle={() => toggleUser(response.username)}
                onToggleDir={toggleDir}
                onDownloadFile={(f) => handleDownloadFile(response.username, f)}
                onDownloadFolder={(files) => handleDownloadFolder(response.username, files)}
              />
            ))}
          </div>

          {!searching && filteredResponses.length === 0 && searchState && (
            <div className="text-center py-16 text-text-tertiary">
              <Search size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">No results with audio files</p>
            </div>
          )}
        </div>
      )}

      {/* Transfers Tab */}
      {tab === 'transfers' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-text-secondary">
              {transfers.length > 0 ? `${transfers.length} download group(s)` : 'No active transfers'}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  await removeCompletedDownloads().catch(() => {})
                  loadTransfers()
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-white/5 transition-colors"
              >
                <X size={14} />
                Clear completed
              </button>
              <button
                onClick={handleRefreshLibrary}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-accent hover:bg-accent/10 transition-colors"
              >
                <RefreshCw size={14} />
                Update Jellyfin
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {transfers.map(group => (
              <TransferGroup key={group.username} group={group} onRemove={(id) => removeDownload(group.username, id).then(loadTransfers)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// -- Sub Components --

function UserResult({ response, expanded, expandedDirs, onToggle, onToggleDir, onDownloadFile, onDownloadFolder }: {
  response: SlskdResponse
  expanded: boolean
  expandedDirs: Set<string>
  onToggle: () => void
  onToggleDir: (key: string) => void
  onDownloadFile: (f: SlskdFile) => void
  onDownloadFolder: (files: SlskdFile[]) => void
}) {
  const audioFiles = response.files.filter(f => isAudioFile(f.filename))
  const dirs = groupFilesByDirectory(audioFiles)

  return (
    <div className="bg-bg-secondary/40 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
      >
        {expanded ? <ChevronDown size={16} className="text-text-tertiary shrink-0" /> : <ChevronRight size={16} className="text-text-tertiary shrink-0" />}
        <User size={14} className="text-text-tertiary shrink-0" />
        <span className="text-sm font-medium truncate flex-1">{response.username}</span>
        <div className="flex items-center gap-3 text-xs text-text-tertiary shrink-0">
          {response.hasFreeUploadSlot && (
            <span className="flex items-center gap-1 text-green-400">
              <Zap size={11} /> Free
            </span>
          )}
          <span>{audioFiles.length} audio{audioFiles.length !== 1 ? 's' : ''}</span>
          {response.uploadSpeed > 0 && (
            <span>{formatSpeed(response.uploadSpeed)}</span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border-subtle">
          {Array.from(dirs.entries()).map(([dir, files]) => {
            const dirKey = `${response.username}:${dir}`
            const dirExpanded = expandedDirs.has(dirKey)
            const dirName = dir.split(/[/\\]/).slice(-2).join(' / ') || dir

            return (
              <div key={dir}>
                <div className="flex items-center gap-2 px-4 py-2 bg-bg-elevated/30">
                  <button
                    onClick={() => onToggleDir(dirKey)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    {dirExpanded ? <ChevronDown size={14} className="text-text-tertiary shrink-0" /> : <ChevronRight size={14} className="text-text-tertiary shrink-0" />}
                    <HardDrive size={13} className="text-text-tertiary shrink-0" />
                    <span className="text-xs text-text-secondary truncate">{dirName}</span>
                    <span className="text-xs text-text-tertiary shrink-0">({files.length})</span>
                  </button>
                  <button
                    onClick={() => onDownloadFolder(files)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-text-tertiary hover:text-accent transition-colors shrink-0"
                    title="Download folder"
                  >
                    <FolderDown size={14} />
                  </button>
                </div>

                {dirExpanded && files.map(file => (
                  <FileRow
                    key={file.filename}
                    file={file}
                    onDownload={() => onDownloadFile(file)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FileRow({ file, onDownload }: { file: SlskdFile; onDownload: () => void }) {
  const ext = getFileExtension(file.filename).toUpperCase()
  const name = getFileName(file.filename)

  return (
    <div className="flex items-center gap-3 px-6 py-2 hover:bg-white/5 transition-colors group">
      <Music size={13} className="text-text-tertiary shrink-0" />
      <span className="text-sm truncate flex-1">{name}</span>
      <div className="flex items-center gap-3 text-xs text-text-tertiary shrink-0">
        <span className="px-1.5 py-0.5 rounded bg-white/5 font-mono">{ext}</span>
        {file.bitRate && <span>{file.bitRate}kbps</span>}
        {file.bitDepth && <span>{file.bitDepth}bit</span>}
        {file.sampleRate && <span>{(file.sampleRate / 1000).toFixed(1)}kHz</span>}
        <span>{formatFileSize(file.size)}</span>
        {file.length && <span>{formatDuration(file.length)}</span>}
      </div>
      <button
        onClick={onDownload}
        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/10 text-text-tertiary hover:text-accent transition-all shrink-0"
        title="Download"
      >
        <Download size={14} />
      </button>
    </div>
  )
}

function TransferGroup({ group, onRemove }: { group: SlskdTransferGroup; onRemove: (id: string) => void }) {
  return (
    <div className="bg-bg-secondary/40 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
        <User size={14} className="text-text-tertiary" />
        <span className="text-sm font-medium">{group.username}</span>
      </div>
      {group.directories.map(dir => (
        <div key={dir.directory}>
          <div className="px-4 py-1.5 bg-bg-elevated/30">
            <span className="text-xs text-text-tertiary truncate block">
              {dir.directory.split(/[/\\]/).slice(-2).join(' / ')}
            </span>
          </div>
          {dir.files.map(file => (
            <TransferRow key={file.id || file.filename} file={file} onRemove={() => onRemove(file.id)} />
          ))}
        </div>
      ))}
    </div>
  )
}

function TransferRow({ file, onRemove }: { file: { id: string; filename: string; size: number; state: string; percentComplete: number; averageSpeed: number; bytesTransferred: number }; onRemove: () => void }) {
  const name = getFileName(file.filename)
  const isComplete = file.state.includes('Succeeded')
  const isFailed = file.state.includes('Errored') || file.state.includes('Rejected') || file.state.includes('Cancelled')
  const isInProgress = file.state.includes('InProgress')
  const isQueued = file.state.includes('Queued') || file.state.includes('Requested') || file.state.includes('Initializing')

  return (
    <div className="flex items-center gap-3 px-5 py-2">
      <div className="shrink-0">
        {isComplete && <Check size={14} className="text-green-400" />}
        {isFailed && <X size={14} className="text-red-400" />}
        {isInProgress && <Loader2 size={14} className="animate-spin text-accent" />}
        {isQueued && <AlertCircle size={14} className="text-yellow-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{name}</p>
        {isInProgress && (
          <div className="mt-1 flex items-center gap-3">
            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${file.percentComplete}%` }}
              />
            </div>
            <span className="text-[10px] text-text-tertiary whitespace-nowrap">
              {file.percentComplete.toFixed(0)}% · {formatSpeed(file.averageSpeed)}
            </span>
          </div>
        )}
      </div>
      <span className="text-xs text-text-tertiary shrink-0">
        {isComplete ? formatFileSize(file.size) : isQueued ? 'Queued' : ''}
      </span>
      {(isComplete || isFailed) && (
        <button
          onClick={onRemove}
          className="shrink-0 p-1 rounded hover:bg-white/10 text-text-tertiary hover:text-red-400 transition-colors"
          title="Remove"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}
