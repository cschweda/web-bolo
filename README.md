# WebBolo

A browser-based reimplementation of **Bolo** — the legendary 1987 networked tank game that pioneered multiplayer gaming on personal computers.

## About Bolo

[Bolo](https://en.wikipedia.org/wiki/Bolo_(1987_video_game)) was created by **Stuart Cheshire** at the University of Edinburgh in 1987 and released for the Apple Macintosh. At a time when "multiplayer" meant passing a controller, Bolo let up to 16 players battle simultaneously over AppleTalk networks — making it one of the earliest real-time networked multiplayer games on personal computers.

The game was deceptively simple: a top-down tank on an island map. But beneath that simplicity lay deeply interacting systems — territorial control through refueling bases and automated pillbox turrets, an engineer that could harvest trees, build roads and fortifications, plant hidden mines, and relocate captured turrets. Teams formed and dissolved through diplomacy and betrayal. Emergent strategy arose from a handful of rules. A single game could last hours.

Bolo developed a devoted community through the 1990s, particularly at universities with Mac labs and fast local networks. Players created hundreds of custom maps, wrote AI "brains" (bot plugins), and developed sophisticated tactics like the "pilltake" — a multi-step wall-building maneuver to safely capture an enemy turret. The game was a formative experience for a generation of players and game developers.

Stuart Cheshire went on to join Apple, where he invented [mDNS/DNS-SD](https://en.wikipedia.org/wiki/Multicast_DNS) (marketed as Bonjour) — the zero-configuration networking protocol that lets devices find each other on a local network. The networking challenges he encountered while building Bolo directly influenced this work.

### Key Historical Links

| Resource | Link |
|----------|------|
| **Original Bolo** (Mac, 1987) | [Stuart Cheshire's Bolo page](https://www.cheshire.org/bolo/) |
| **WinBolo** (Windows port, GPL v2) | [GitHub: kippandrew/winbolo](https://github.com/kippandrew/winbolo) |
| **Bolo on Wikipedia** | [Bolo (1987 video game)](https://en.wikipedia.org/wiki/Bolo_(1987_video_game)) |
| **Stuart Cheshire** | [Personal site](https://www.cheshire.org/) |
| **Macintosh Garden archive** | [Bolo download](https://macintoshgarden.org/games/bolo) |

### Why Reimplement It?

Bolo's fatal flaw for a modern audience: it only runs on classic Mac OS (or Windows via WinBolo). The game requires finding other players on a local network. There's no easy way to play it today.

WebBolo fixes this. Open a URL, click Play, and you're in a game — against AI opponents or real players over the internet. The same deep gameplay, the same emergent strategy, but running in any modern browser.

## How It Works

WebBolo is built from the ground up using the **actual numeric constants** extracted from the [WinBolo C source code](https://github.com/kippandrew/winbolo). Every speed value, damage number, fire rate, build cost, and timing constant comes directly from the original implementation — not from approximations or guesswork. See [`docs/09-WinBolo-Source-Constants.md`](docs/09-WinBolo-Source-Constants.md) for the full extraction.

### Architecture

```
Browser (Nuxt 4 / Vue 3)          Node.js Server (Phase 2+)
┌─────────────────────┐           ┌──────────────────────┐
│  HTML5 Canvas 2D    │           │  Authoritative sim   │
│  60 FPS rendering   │◄─────────│  20 Hz game ticks    │
│  Client prediction  │  Binary   │  Fog of war filter   │
│  Entity interpolation│ WebSocket│  Collision detection  │
│  Web Audio (spatial) │──────────►  Entity management    │
│  Nuxt UI (lobby/HUD)│           │  AI bot decisions    │
└─────────────────────┘           └──────────────────────┘
         │                                    │
         └──────────── shared/ ───────────────┘
              Pure JS: physics, protocol,
              terrain, constants
              (identical on both sides)
```

**Solo play** runs the entire simulation in a Web Worker — no server needed. The client talks to the Worker via `postMessage` using the same binary protocol that goes over WebSocket for multiplayer. You can play offline against AI opponents just by opening the page.

### Technical Details

| Aspect | Detail |
|--------|--------|
| **Tick rate** | 20 Hz server, 60 FPS client with interpolation |
| **Coordinate system** | 256 world units per tile (16-bit, matching WinBolo's `WORLD` type) |
| **Angular system** | Bradians — 256 units per full circle (binary radians from the original) |
| **Rotation** | 16 discrete directions (22.5° each), matching original sprite frames |
| **Networking** | Client-side prediction + server reconciliation, entity interpolation |
| **Map size** | 256x256 tiles (65,536 bytes — same as original) |
| **Max players** | 16 (same as original) |
| **Transport** | Binary WebSocket (not JSON — tight protocol at ~12 bytes per entity) |

### Game Mechanics (from the original)

- **17 terrain types** with distinct speed modifiers (road: 1.33x, grass: 1.0x, swamp: 0.25x)
- **Pillbox turrets** with anger mechanic — fire rate accelerates from 0.65s to 0.10s when attacked
- **Refueling bases** with resource pools (90/90/90) that slowly restock
- **Engineer** who harvests trees, builds roads/walls/boats, plants mines, captures turrets
- **Hidden mines** — invisible to enemies, 10 damage (double a shell), chain-detonate through adjacency
- **Dynamic terrain** — buildings destructible in 2 stages, craters flood near water, forests regrow
- **Fog of war** — server-side visibility filtering, forests block line of sight

## Tech Stack

- **Client:** [Nuxt 4](https://nuxt.com) / [Vue 3](https://vuejs.org) / [Nuxt UI 4](https://ui.nuxt.com) — HTML5 Canvas 2D rendering, Web Audio API
- **Server:** Node.js, WebSocket (`ws`) — authoritative game simulation at 20 Hz
- **Shared:** Pure JavaScript game logic (`shared/`) — runs identically on client and server
- **Package Manager:** [pnpm](https://pnpm.io) workspaces
- **Tests:** Vitest

## Project Structure

```
webbolo/
├── shared/          # Framework-agnostic game logic (constants, physics, terrain, protocol)
├── client/          # Nuxt 4 app (Canvas renderer, UI, lobby)
├── server/          # Game server (Phase 2+)
├── docs/            # Design documentation (9 docs + audit + deployment guide)
└── package.json     # pnpm workspace root
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 20+ (tested with v22)
- [pnpm](https://pnpm.io) 9+ (tested with v10)

### Install and run

```bash
git clone https://github.com/cschweda/web-bolo.git
cd web-bolo
pnpm install
pnpm dev
```

This starts the Nuxt development server with hot module replacement:

- Open **http://localhost:3000** in your browser
- Click **Play** to enter the game
- **Arrow keys** or **WASD** — rotate and drive your tank
- Drive across different terrain to feel the speed differences (roads are fast, swamps are slow)

### Build for production

```bash
pnpm build
pnpm preview
```

## Development Phases

WebBolo is being built in phases. Each phase ends with a playable deliverable.

| Phase | Description | Status |
|-------|-------------|--------|
| **1A** | Local prototype — tank, shooting, pillboxes, bases, engineer, mines | In progress |
| **1B** | Solo play — AI bots in Web Worker, spatial audio, difficulty scaling | Planned |
| **2** | LAN multiplayer — WebSocket server, client-side prediction, interpolation | Planned |
| **3** | WAN multiplayer — fog of war, teams, alliances, chat, reconnection, TLS | Planned |
| **4** | Polish — map editor, spectator mode, replays, bot scripting API | Planned |

See [docs/PHASE-CHECKLIST.md](docs/PHASE-CHECKLIST.md) for detailed component tracking.

## Documentation

The `docs/` directory contains comprehensive design documentation:

| Doc | Contents |
|-----|----------|
| [01 - Project Overview](docs/01-Project-Overview.md) | Vision, goals, tech stack |
| [02 - Gameplay Mechanics](docs/02-Gameplay-Mechanics.md) | All game mechanics in detail |
| [03 - Networking Architecture](docs/03-Networking-Architecture.md) | Client-server protocol, prediction, interpolation |
| [04 - Project Structure](docs/04-Project-Structure.md) | Directory layout, shared code |
| [05 - Development Phases](docs/05-Development-Phases.md) | Build order, deliverables, testing strategy |
| [06 - Map System](docs/06-Map-System.md) | Terrain types, map format, editor spec |
| [07 - AI Bots & Community](docs/07-AI-Bots-Community.md) | AI architecture, difficulty, community features |
| [08 - Rendering & Graphics](docs/08-Rendering-and-Graphics.md) | Canvas renderer, auto-tiling, sprites, accessibility |
| [09 - WinBolo Source Constants](docs/09-WinBolo-Source-Constants.md) | Authoritative numeric values from C source |
| [PROMPT](docs/PROMPT.md) | Development prompt with build instructions |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | DigitalOcean/VPS deployment guide |

## License

[MIT](LICENSE) - Copyright (c) 2026 Christopher Schweda

## Acknowledgments

- **[Stuart Cheshire](https://www.cheshire.org/)** — creator of the original Bolo (1987). Pioneered real-time networked multiplayer gaming on personal computers, later invented mDNS/Bonjour at Apple.
- **[John Morrison](https://github.com/kippandrew/winbolo)** — WinBolo (GPL v2), the Windows port whose source code provided the authoritative game constants used in this project.
- **The Bolo community** — decades of maps, strategies, bot brains, and the shared memory of a game that was ahead of its time.
