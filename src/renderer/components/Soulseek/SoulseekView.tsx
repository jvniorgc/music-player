import { useState, useEffect, useRef, useCallback } from 'react'
import {
  startSearch, getSearch, getSearchResponses, deleteSearch, downloadFiles, getDownloads,
  SlskdResponse, SlskdFile, SlskdSearch, SlskdTransferGroup,
  isAudioFile, getFileName, getFileExtension, formatFileSize, formatSpeed, formatDuration,
  groupFilesByDirectory
} from '../../services/slskd'
import { jellyfin } from '../../services/jellyfin'
import { useToastStore } from '../../stores/toast'
import {
  Search, Loader2, Download, FolderDown, ChevronDown, ChevronRight,
  User, HardDrive, Zap, Check, X, Music, AlertCircle, RefreshCw
} from 'lucide-react'

type Tab = 'search' | 'transfers'

export default function SoulseekView() {
  const toast = useToastStore(s => s.show)

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
      toast('Erro ao buscar no Soulseek', 'error')
      setSearching(false)
    }
  }

  const handleDownloadFile = async (username: string, file: SlskdFile) => {
    try {
      await downloadFiles(username, [{ filename: file.filename, size: file.size }])
      toast(`Download iniciado: ${getFileName(file.filename)}`, 'success')
    } catch (err) {
      console.error('Download error:', err)
      toast('Erro ao iniciar download', 'error')
    }
  }

  const handleDownloadFolder = async (username: string, files: SlskdFile[]) => {
    try {
      const audioFiles = files.filter(f => isAudioFile(f.filename))
      await downloadFiles(username, audioFiles.map(f => ({ filename: f.filename, size: f.size })))
      toast(`Download de ${audioFiles.length} arquivos iniciado`, 'success')
    } catch (err) {
      console.error('Folder download error:', err)
      toast('Erro ao iniciar downloads', 'error')
    }
  }

  const handleRefreshLibrary = async () => {
    try {
      await jellyfin.refreshItem(jellyfin.userId!)
      toast('Scan da biblioteca Jellyfin iniciado', 'success')
    } catch {
      // Try alternative endpoint
      try {
        const res = await fetch(`${jellyfin.serverUrl}/Library/Refresh`, {
          method: 'POST',
          headers: { 'X-Emby-Authorization': `MediaBrowser Token="${jellyfin.token}"` }
        })
        if (res.ok) toast('Scan da biblioteca Jellyfin iniciado', 'success')
        else toast('Sem permissão para scan da biblioteca', 'error')
      } catch {
        toast('Erro ao atualizar biblioteca', 'error')
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

  return (
    <div className="fade-in">
      <h1 className="text-3xl font-bold tracking-tight mb-6">Soulseek</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-bg-elevated/50 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('search')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'search' ? 'bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Search size={14} className="inline mr-2 -mt-0.5" />
          Buscar
        </button>
        <button
          onClick={() => setTab('transfers')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'transfers' ? 'bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Download size={14} className="inline mr-2 -mt-0.5" />
          Transferências
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
                placeholder="Buscar músicas, álbuns, artistas..."
                className="w-full bg-bg-elevated border border-border rounded-xl pl-11 pr-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-40"
            >
              {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Buscar
            </button>
          </div>

          {/* Search status */}
          {searchState && (
            <div className="flex items-center gap-3 mb-4 text-sm text-text-secondary">
              {searching && <Loader2 size={14} className="animate-spin text-accent" />}
              <span>
                {searchState.responseCount} usuários · {searchState.fileCount} arquivos
                {searchState.isComplete && ' · Completo'}
              </span>
            </div>
          )}

          {/* Results */}
          <div className="space-y-2">
            {responses.map(response => (
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

          {!searching && responses.length === 0 && searchState && (
            <div className="text-center py-16 text-text-tertiary">
              <Search size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">Nenhum resultado com arquivos de áudio</p>
            </div>
          )}
        </div>
      )}

      {/* Transfers Tab */}
      {tab === 'transfers' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-text-secondary">
              {transfers.length > 0 ? `${transfers.length} grupo(s) de download` : 'Nenhuma transferência ativa'}
            </p>
            <button
              onClick={handleRefreshLibrary}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-accent hover:bg-accent/10 transition-colors"
            >
              <RefreshCw size={14} />
              Atualizar Jellyfin
            </button>
          </div>

          <div className="space-y-4">
            {transfers.map(group => (
              <TransferGroup key={group.username} group={group} />
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
              <Zap size={11} /> Livre
            </span>
          )}
          <span>{audioFiles.length} áudio{audioFiles.length !== 1 ? 's' : ''}</span>
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
                    title="Baixar pasta"
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
        title="Baixar"
      >
        <Download size={14} />
      </button>
    </div>
  )
}

function TransferGroup({ group }: { group: SlskdTransferGroup }) {
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
            <TransferRow key={file.id || file.filename} file={file} />
          ))}
        </div>
      ))}
    </div>
  )
}

function TransferRow({ file }: { file: { filename: string; size: number; state: string; percentComplete: number; averageSpeed: number; bytesTransferred: number } }) {
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
        {isComplete ? formatFileSize(file.size) : isQueued ? 'Na fila' : ''}
      </span>
    </div>
  )
}
