# WebBolo

Browser-based reimplementation of the classic 1987 networked tank game [Bolo](https://en.wikipedia.org/wiki/Bolo_(1987_video_game)).

Drive a tank on an island map, capture refueling bases, deploy pillbox turrets for territorial control, command your engineer to harvest trees and build fortifications, lay hidden mines, and form (and betray) alliances with other players. All in your browser.

## Tech Stack

- **Client:** [Nuxt 4](https://nuxt.com) / [Vue 3](https://vuejs.org) / [Nuxt UI 4](https://ui.nuxt.com) — HTML5 Canvas 2D rendering, Web Audio API
- **Server:** Node.js, WebSocket (`ws`) — authoritative game simulation at 20 Hz
- **Shared:** Pure JavaScript game logic (`shared/`) — runs identically on client and server
- **Package Manager:** [pnpm](https://pnpm.io) workspaces

## Project Structure

```
webbolo/
├── shared/          # Framework-agnostic game logic (constants, physics, terrain, protocol)
├── client/          # Nuxt 4 app (Canvas renderer, UI, lobby)
├── server/          # Game server (Phase 2+)
├── docs/            # Design documentation (9 docs + audit + deployment guide)
└── package.json     # pnpm workspace root
```

## Prerequisites

- [Node.js](https://nodejs.org) 20+ (tested with v22)
- [pnpm](https://pnpm.io) 9+ (tested with v10)

## Getting Started

### Install dependencies

```bash
pnpm install
```

### Start the dev server

```bash
pnpm dev
```

This starts the Nuxt development server with hot module replacement:

- Open **http://localhost:3000** in your browser
- Click **Play** to see the game canvas with a procedural test map
- Use **arrow keys** or **WASD** to scroll the viewport

### Build for production

```bash
pnpm build
```

### Preview the production build

```bash
pnpm preview
```

## Development Phases

| Phase | Description | Status |
|-------|-------------|--------|
| **1A** | Local prototype — tank, shooting, pillboxes, bases, engineer, mines | In progress |
| **1B** | Solo play — AI bots, Web Worker simulation, spatial audio | Planned |
| **2** | LAN multiplayer — WebSocket server, prediction, interpolation | Planned |
| **3** | WAN multiplayer — fog of war, teams, chat, reconnection, TLS | Planned |
| **4** | Polish — map editor, spectator mode, replays, leaderboards | Planned |

See [docs/PHASE-CHECKLIST.md](docs/PHASE-CHECKLIST.md) for detailed progress tracking.

## Documentation

The `docs/` directory contains comprehensive design documentation:

| Doc | Contents |
|-----|----------|
| [01 - Project Overview](docs/01-Project-Overview.md) | Vision, goals, tech stack |
| [02 - Gameplay Mechanics](docs/02-Gameplay-Mechanics.md) | All game mechanics in detail |
| [03 - Networking Architecture](docs/03-Networking-Architecture.md) | Client-server protocol, prediction, interpolation |
| [04 - Project Structure](docs/04-Project-Structure.md) | Directory layout, shared code architecture |
| [05 - Development Phases](docs/05-Development-Phases.md) | Build order, deliverables, testing strategy |
| [06 - Map System](docs/06-Map-System.md) | Terrain types, map format, editor |
| [07 - AI Bots & Community](docs/07-AI-Bots-Community.md) | AI architecture, difficulty, community features |
| [08 - Rendering & Graphics](docs/08-Rendering-and-Graphics.md) | Canvas renderer, auto-tiling, sprites, accessibility |
| [09 - WinBolo Source Constants](docs/09-WinBolo-Source-Constants.md) | Authoritative numeric values from C source |
| [PROMPT](docs/PROMPT.md) | Development prompt with build instructions |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | DigitalOcean/VPS deployment guide |

## Game Constants

All game constants are derived from the [WinBolo C source code](https://github.com/kippandrew/winbolo) and documented in `docs/09-WinBolo-Source-Constants.md`. The shared constants file (`shared/constants.js`) contains pre-scaled values for WebBolo's 20 Hz tick rate.

## License

[MIT](LICENSE) - Copyright (c) 2026 Christopher Schweda

## Acknowledgments

- [Stuart Cheshire](https://www.cheshire.org/) — creator of the original Bolo (1987)
- [John Morrison](https://github.com/kippandrew/winbolo) — WinBolo (GPL v2), whose source code provided the authoritative game constants
- The Bolo community — decades of maps, strategies, and bot brains
