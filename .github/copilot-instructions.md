# Copilot Instructions

## Build & Run

```bash
npm run dev          # Start in development mode (electron-vite dev)
npm run build        # Compile TypeScript + bundle (electron-vite build)
npm run build:mac    # Build + package macOS .dmg
npm run build:win    # Build + package Windows .exe installer
```

There is no test framework or linter configured in this project.

## Architecture

This is an **Electron + React + TypeScript** desktop music player for Jellyfin servers, structured with `electron-vite` into three processes:

- **`src/main/`** — Electron main process. Handles IPC, SQLite database (better-sqlite3), file downloads, audio caching (2GB LRU eviction), and a custom `local-audio://` protocol for offline playback.
- **`src/preload/`** — Context bridge that exposes a typed `window.api` object to the renderer. All main↔renderer communication goes through IPC channels defined here.
- **`src/renderer/`** — React 18 SPA using HashRouter. UI is styled with Tailwind CSS 4 and uses Apple Music-inspired dark theme.

### State Management

Zustand stores in `src/renderer/stores/` manage all app state:
- `auth.ts` — Login/logout, session persistence via IPC
- `library.ts` — Albums, artists, songs, playlists fetched from Jellyfin
- `player.ts` — Playback state, queue, shuffle/repeat
- `download.ts` — Downloaded tracks for offline use
- `toast.ts` — UI notifications

### Services (Singletons)

Service classes in `src/renderer/services/` are instantiated once and imported as singletons:
- `jellyfin.ts` — Jellyfin REST API client (auth, library, images, streaming URLs)
- `playback.ts` — Audio engine wrapping `HTMLAudioElement` with queue, shuffle, repeat, preloading, and source resolution (stream → cache → download)
- `musicbrainz.ts` — Metadata lookup via MusicBrainz + Cover Art Archive
- `slskd.ts` — Soulseek integration via slskd REST API

### IPC Pattern

Renderer → Main communication always follows:
1. Define the IPC handler in `src/main/index.ts` via `ipcMain.handle('channel', ...)`
2. Expose it in `src/preload/index.ts` via `ipcRenderer.invoke('channel', ...)`
3. Call it from the renderer as `window.api.methodName(...)`

The `ElectronAPI` type is exported from the preload for type safety.

## Key Conventions

- **Path alias**: Use `@/` to reference `src/renderer/` in renderer imports (configured in electron.vite.config.ts).
- **Tailwind theme tokens**: Custom colors are defined as CSS variables in `src/renderer/app.css` under `@theme {}`. Use semantic names like `bg-bg-primary`, `text-text-secondary`, `text-accent` rather than raw hex values.
- **No node integration**: The renderer has `contextIsolation: true` and `nodeIntegration: false`. All Node/Electron access must go through the preload bridge.
- **SQLite in main only**: The database (better-sqlite3) runs exclusively in the main process. The renderer accesses it via IPC.
- **Native module builds**: `better-sqlite3` requires platform-specific compilation. Cross-compilation is not supported; build on the target OS.
- **Audio autoplay**: The app disables Chrome's autoplay policy (`--autoplay-policy=no-user-gesture-required`) because async source resolution breaks the user gesture chain.
- **Session vs persistent cache**: Audio cache and lyrics cache are cleared on app start. Downloads and downloaded lyrics persist across sessions.
- **No Co-authored-by**: Never include `Co-authored-by` trailers in commit messages.
