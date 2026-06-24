# Copilot Instructions

## Build & Run

```bash
npm install          # Installs the workspace (root + packages/* via npm workspaces)
npm run dev          # Start in development mode (electron-vite dev)
npm run build        # Compile TypeScript + bundle (electron-vite build)
npm run build:mac    # Build + package macOS .dmg
npm run build:win    # Build + package Windows .exe installer
npm test             # Run the test suite once (vitest run)
npm run test:watch   # Run vitest in watch mode
npm run test:coverage # Run tests + v8 coverage (enforces 100% stmts/lines/funcs, 90% branches)
```

- Requires **Node.js 20+**.
- **Windows** needs Visual Studio Build Tools ("Desktop development with C++") to compile `better-sqlite3`.
- Pushing a `v*` tag triggers `.github/workflows/build.yml`, which builds/packages for macOS, Windows, and Linux on their respective runners and publishes a GitHub release.
- `.github/workflows/test.yml` runs `npm run test:coverage` on every push and pull request.

## Testing

Tests use **Vitest** and live next to the code they cover (`*.test.ts` / `*.test.tsx`). `vitest.config.ts` defines two projects:
- **`core`** (jsdom) — `packages/core/**`; setup `test/setup.core.ts` imports `jest-dom` and installs a `window.api` stub (`makeApiStub()`) before each test.
- **`node`** (node) — `src/main/**` and `src/preload/**`; `electron` / `electron-updater` are mocked.

### Workflow: test-first (TDD)

Development in this repo is **test-first**. Always follow the red → green → refactor cycle:
- **New feature:** write the failing test(s) that describe the desired behavior *before* writing the implementation. Watch them fail (red), implement the minimum to make them pass (green), then refactor with the tests as the safety net.
- **Changing an existing feature:** update the matching `*.test.ts` first to reflect the new expected behavior (so it fails against the old code), then change the implementation until it passes. Never change behavior without updating its test in the same change.
- **Fixing a bug:** add a failing test that reproduces the bug first, then fix it so the test goes green — this guarantees a regression test for the fix.
- Run `npm run test:coverage` before considering any change done; the coverage gate (below) must stay green.

Conventions:
- These are **characterization tests**: they pin current, known-good behavior so regressions surface fast. When you intentionally change behavior, update the matching test in the same change.
- Mock `fetch` with the helpers in `test/http.ts` (`jsonRes`, `textRes`, `emptyRes`, `mockFetchRouter`) — they use the real Node 20 `Response`.
- The shared `afterEach` runs `vi.clearAllMocks()` (call history only), so define `vi.mock()` factory return values once and re-assert as needed.
- Main-process tests use a **real temp SQLite DB** plus mocked `electron` (capturing `ipcMain.handle` callbacks) and a stubbed global `fetch`.
- Coverage gate is 100% statements/functions/lines and 90% branches over `services/`, `stores/`, `src/main/`, and `src/preload/`. The remaining ~8% branch gap is defensive optional-chaining/`||` fallbacks in the service layer.

## Architecture

This is an **Electron + React + TypeScript** desktop music player for Jellyfin servers, organized as an **npm-workspaces monorepo** with two tiers:

- **`packages/core/`** (`@music-player/core`) — Platform-agnostic React UI and app logic: the root `App`, `components/` (by domain), `services/`, `stores/`, `app.css`, and the `PlatformApi` contract (`platform.ts`). This package is intended to be shared by the desktop (Electron) and a future mobile (Capacitor) client. **It must not import Electron or Node APIs** — it only reaches the host through `window.api`.
- **`src/`** — The Electron **desktop client** (a thin shell), built with `electron-vite` into three processes:
  - **`src/main/`** — Main process. Handles IPC, SQLite database (`better-sqlite3`, `database.ts`), file downloads, audio caching (2 GB LRU eviction), the auto-updater, and a custom `local-audio://` protocol for offline playback.
  - **`src/preload/`** — Context bridge that exposes the typed `window.api` object. The `api` object `satisfies PlatformApi`, so it is the desktop implementation of the shared contract.
  - **`src/renderer/`** — Minimal entry point. `main.tsx` just mounts `App` from `@music-player/core`; the actual UI lives in the core package.

### The PlatformApi contract

`packages/core/src/platform.ts` defines `PlatformApi` — the full native surface the UI relies on (auth, downloads, audio/lyrics cache, settings, file URLs, event listeners, auto-updater). Each client implements this contract: the desktop implements it over Electron IPC in `src/preload/index.ts`; a mobile client would implement it over Capacitor plugins. `global.d.ts` types `window.api` as `PlatformApi`.

### State Management

Zustand stores in `packages/core/src/stores/`:
- `auth.ts` — Login/logout, session persistence via `window.api`
- `library.ts` — Albums, artists, songs, playlists fetched from Jellyfin
- `player.ts` — Playback state, queue, shuffle/repeat
- `download.ts` — Downloaded tracks for offline use
- `toast.ts` — UI notifications

### Services (Singletons)

Service classes in `packages/core/src/services/` are instantiated once and imported as singletons:
- `jellyfin.ts` — Jellyfin REST API client (auth, library, images, streaming URLs)
- `playback.ts` — Audio engine wrapping `HTMLAudioElement` with queue, shuffle, repeat, preloading, and source resolution (stream → cache → download)
- `musicbrainz.ts` — Metadata lookup via MusicBrainz + Cover Art Archive
- `slskd.ts` — Soulseek integration via slskd REST API

### Adding a native capability (IPC pattern)

Because the UI is shared, adding a native call is a four-step flow:
1. Add the method to `PlatformApi` in `packages/core/src/platform.ts` (the source of truth).
2. Implement the handler in `src/main/index.ts` via `ipcMain.handle('channel', ...)`.
3. Wire it in `src/preload/index.ts` via `ipcRenderer.invoke('channel', ...)` — the `api` object `satisfies PlatformApi`, so TypeScript enforces the shape.
4. Call it from the UI as `window.api.methodName(...)`.

The `ElectronAPI` type is exported from the preload for type safety.

## Key Conventions

- **Keep `packages/core` platform-agnostic**: no `electron`, `node:*`, or filesystem imports in core — reach the host only through `window.api`. This is what lets the mobile client reuse the package.
- **Path aliases**: `@/` → `src/renderer/` (desktop-only code), `@music-player/core` → `packages/core/src`. Configured in `electron.vite.config.ts` and `tsconfig.web.json`.
- **Tailwind theme tokens**: Custom colors are defined as CSS variables in `packages/core/src/app.css` under `@theme {}`. Use semantic names like `bg-bg-primary`, `text-text-secondary`, `text-accent` rather than raw hex values.
- **No node integration**: The renderer has `contextIsolation: true` and `nodeIntegration: false`. All Node/Electron access must go through the preload bridge.
- **SQLite in main only**: The database (`better-sqlite3`, `src/main/database.ts`) runs exclusively in the main process. The renderer accesses it via IPC.
- **Native module builds**: `better-sqlite3` requires platform-specific compilation. Cross-compilation is not supported; build on the target OS (CI builds per-OS).
- **Audio autoplay**: The app disables Chrome's autoplay policy (`--autoplay-policy=no-user-gesture-required`) because async source resolution breaks the user gesture chain.
- **Session vs persistent cache**: Audio cache and lyrics cache are cleared on app start. Downloads and downloaded lyrics persist across sessions.
- **No Co-authored-by**: Never include `Co-authored-by` trailers in commit messages.
