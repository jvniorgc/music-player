<div align="center">
  <img src="build/icon.png" width="120" height="120" alt="Jellyfin Music Player" />

  # Jellyfin Music Player

  A desktop music player for [Jellyfin](https://jellyfin.org/) servers, inspired by Apple Music.

  [![Version](https://img.shields.io/badge/version-0.3.0-blue?style=flat-square)](https://github.com/jvniorgc/music-player/releases)
  [![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat-square)](#download)
  [![Electron](https://img.shields.io/badge/electron-33-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
  [![TypeScript](https://img.shields.io/badge/typescript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

</div>

---

<!-- TODO: add screenshots here -->
<!-- ![Screenshot](docs/screenshot.png) -->

## Features

- [x] Direct streaming from Jellyfin server
- [x] Playback queue with drag & reorder
- [x] Shuffle and repeat (single/all)
- [x] Full-screen player with artwork
- [x] System media controls (macOS Control Center)
- [x] Browse albums and artists with infinite scroll
- [x] Album sorting (A–Z / Recently Added)
- [x] Global search with grouped results (artists, albums, songs)
- [x] Playlists — create, rename, delete, add/remove tracks
- [x] Social tab — user profiles with top artists/albums (last.fm-style)
- [x] Local audio cache with LRU eviction (2 GB)
- [x] Download for offline playback
- [x] Metadata editor via MusicBrainz + Cover Art Archive
- [x] Soulseek integration via [slskd](https://github.com/slskd/slskd)
- [ ] [Request a feature](https://github.com/jvniorgc/music-player/issues/new)

## Download

| Platform | Format | Command |
|---|---|---|
| macOS | `.dmg` | `npm run build:mac` |
| Windows | `.exe` (NSIS) | `npm run build:win` |
| Linux | `.AppImage` | via [GitHub Actions](https://github.com/jvniorgc/music-player/actions) |

> Builds are published under **Releases** when a `v*` tag is pushed.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- A [Jellyfin](https://jellyfin.org/) server accessible on the network
- *(Optional)* [slskd](https://github.com/slskd/slskd) for Soulseek

**Windows:** requires [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload to compile `better-sqlite3`.

### Setup

```bash
git clone https://github.com/jvniorgc/music-player.git
cd music-player
npm install
```

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start in development mode with hot-reload |
| `npm run build` | Compile the project (electron-vite) |
| `npm run build:mac` | Compile + package `.dmg` for macOS |
| `npm run build:win` | Compile + package `.exe` for Windows |

### Platform Notes

<details>
<summary><strong>macOS</strong></summary>

The DMG is generated in `dist/`. On first launch, macOS may block the unsigned app:

```bash
xattr -cr "dist/mac-arm64/Jellyfin Music Player.app"
```

Or go to **System Settings > Privacy & Security > Open Anyway**.

</details>

<details>
<summary><strong>Windows</strong></summary>

Cross-compilation is not supported due to native modules. Build on a Windows machine or use the CI workflow.

The installer is generated at `dist/Jellyfin Music Player Setup {version}.exe`.

</details>

## Tech Stack

| | Technology | Version |
|---|---|---|
| ⚡ | [Electron](https://www.electronjs.org/) | 33 |
| ⚛️ | [React](https://react.dev/) | 18 |
| 🎨 | [Tailwind CSS](https://tailwindcss.com/) | 4 |
| 🐻 | [Zustand](https://zustand.docs.pmnd.rs/) | 5 |
| 🗄️ | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | 12 |
| 📦 | [electron-vite](https://electron-vite.org/) | 5 |

## Architecture

```
src/
├── main/          → Main process: IPC, SQLite, downloads, audio cache
├── preload/       → Context bridge (window.api) — sole main↔renderer channel
└── renderer/      → React SPA (HashRouter)
    ├── components/   UI organized by domain (Auth, Library, Player, etc.)
    ├── services/     API clients: jellyfin, playback, musicbrainz, slskd
    └── stores/       Global state with Zustand (auth, library, player, download, toast)
```

The renderer has **no** Node.js access — all system communication goes through the preload bridge via `ipcRenderer.invoke`.

## Configuration

On the login screen, provide your Jellyfin server URL (e.g. `http://192.168.1.100:8096`) and credentials.

Soulseek integration connects to an [slskd](https://github.com/slskd/slskd) instance — configurable in the app preferences.

## License

This project is for personal use. All rights reserved.
