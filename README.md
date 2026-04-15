# 🎵 Jellyfin Music Player

Um player de música desktop para servidores [Jellyfin](https://jellyfin.org/), inspirado na UI/UX do Apple Music. Construído com Electron, React e TypeScript.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)
![Electron](https://img.shields.io/badge/electron-33.4.0-47848F)

## ✨ Features

### 🎶 Player
- Streaming direto do servidor Jellyfin
- Fila de reprodução com drag & reorder
- Shuffle e repeat (single/all)
- Player em tela cheia com artwork
- Integração com controles de mídia do macOS (Control Center) — artwork, play/pause, next/prev, seek

### 📚 Biblioteca
- Navegação por álbuns, artistas e músicas
- Busca global com resultados agrupados
- Visualização de álbum com lista de faixas
- Páginas de artista com discografia
- Seção "Ouvidos Recentemente" e "Adicionados Recentemente"

### 📋 Playlists
- Criar, renomear e excluir playlists
- Adicionar/remover músicas das playlists
- Gerenciamento completo via API do Jellyfin

### ✏️ Metadados
- Busca de metadados via MusicBrainz
- Atualização de título, artista, ano e gênero
- Upload de capa de álbum a partir do Cover Art Archive
- Opção de limpar todos os metadados

### 🔍 Soulseek (via slskd)
- Busca de músicas na rede Soulseek
- Resultados agrupados por usuário e pasta
- Download direto para a biblioteca de músicas
- Monitoramento de transferências em tempo real

### ⚡ Performance
- Cache local de áudio com SQLite (better-sqlite3)
- Download de músicas para reprodução offline
- Botão de refresh para sincronizar biblioteca com o servidor
- Filtro automático de itens com metadados vazios/corrompidos

## 📸 Screenshots

> *Em desenvolvimento — screenshots serão adicionados em breve.*

## 🛠️ Tech Stack

| Tecnologia | Uso |
|---|---|
| **Electron 33** | Runtime desktop |
| **React 18** | UI framework |
| **TypeScript 5** | Type safety |
| **Tailwind CSS 4** | Estilização |
| **Zustand 5** | Gerenciamento de estado |
| **better-sqlite3** | Cache local e downloads |
| **electron-vite** | Build tooling |
| **electron-builder** | Empacotamento macOS |

## 🚀 Getting Started

### Pré-requisitos

- **Node.js** 20+
- **npm** 9+
- Um servidor **Jellyfin** acessível na rede
- *(Opcional)* **slskd** para integração com Soulseek

### Instalação

```bash
# Clone o repositório
git clone https://github.com/jvniorgc/music-player.git
cd music-player

# Instale as dependências
npm install
```

### Desenvolvimento

```bash
npm run dev
```

> **Nota:** Se estiver usando o terminal integrado do VS Code, o app já desativa a variável `ELECTRON_RUN_AS_NODE` automaticamente.

### Build (macOS)

```bash
npm run build:mac
```

O DMG será gerado em `dist/Jellyfin Music Player-{version}-arm64.dmg`.

Para executar diretamente sem instalar:

```bash
open "dist/mac-arm64/Jellyfin Music Player.app"
```

> Na primeira execução, o macOS pode bloquear o app por não ter assinatura. Vá em **Ajustes > Privacidade e Segurança** e clique "Abrir Mesmo Assim".

### Build (Windows)

A build para Windows deve ser executada em uma máquina Windows, pois o `better-sqlite3` é um módulo nativo que precisa ser compilado para o OS alvo.

```powershell
# Clone o repositório
git clone https://github.com/jvniorgc/music-player.git
cd music-player

# Instale as dependências
npm install

# Gere o instalador
npm run build:win
```

O instalador será gerado em `dist/Jellyfin Music Player Setup {version}.exe`.

**Pré-requisitos para Windows:**
- **Node.js** 20+ e **npm** 9+
- **Python 3** e **Visual Studio Build Tools** (necessários para compilar o `better-sqlite3`)
  - Instale com: `npm install --global windows-build-tools` (PowerShell como Admin)
  - Ou instale o [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) com o workload "Desktop development with C++"

> **Nota:** Cross-compilation do macOS para Windows não é suportada devido a módulos nativos. Use GitHub Actions ou uma máquina Windows para gerar builds.

## 📁 Estrutura do Projeto

```
src/
├── main/               # Processo principal do Electron
│   └── index.ts        # IPC handlers, cache, downloads
├── preload/            # Bridge segura entre main e renderer
│   └── index.ts
└── renderer/           # Interface React
    ├── components/
    │   ├── Auth/       # Tela de login
    │   ├── Home/       # Página inicial
    │   ├── Layout/     # Sidebar, NowPlayingBar, AppLayout
    │   ├── Library/    # Álbuns, artistas, playlists, downloads
    │   ├── Metadata/   # Editor de metadados (MusicBrainz)
    │   ├── Player/     # Fullscreen player, fila
    │   ├── Search/     # Busca global
    │   ├── Soulseek/   # Integração slskd
    │   └── UI/         # Modais, toasts
    ├── services/
    │   ├── jellyfin.ts # Cliente API Jellyfin
    │   ├── playback.ts # Engine de reprodução
    │   ├── musicbrainz.ts # API MusicBrainz
    │   └── slskd.ts    # Cliente API slskd
    └── stores/         # Zustand stores (auth, library, player, toast)
```

## ⚙️ Configuração

Na tela de login, forneça:

1. **URL do servidor** — ex: `http://192.168.1.100:8096`
2. **Usuário** e **senha** do Jellyfin

Para o Soulseek, o app se conecta ao **slskd** (configurado no código em `services/slskd.ts`).

## 📝 Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia em modo de desenvolvimento |
| `npm run build` | Compila o projeto (electron-vite) |
| `npm run build:mac` | Gera o .app e .dmg para macOS |
| `npm run build:win` | Gera o .exe instalador para Windows |

## 📄 Licença

Este projeto é de uso pessoal. Todos os direitos reservados.
