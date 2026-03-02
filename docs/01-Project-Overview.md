# WebBolo: Project Overview & Vision

**Document:** 01 of 09
**Version:** 0.3
**Date:** March 2026

---

## What Is Bolo?

Bolo is a networked multiplayer tank battle game created by Stuart Cheshire in 1987 for the BBC Micro and later ported to the Macintosh. It was one of the earliest real-time multiplayer networked games. Players control tanks on a top-down island map, competing to capture refueling bases and deploy pillboxes (automated turrets) for territorial control. Each tank has an engineer — a "Little Green Man" — who exits the tank to harvest wood, build roads and walls, plant mines, and relocate captured pillboxes.

What made Bolo special wasn't just the mechanics — it was the social layer. As Cheshire wrote: "Bolo is the Hindi word for communication. Bolo is about computers communicating on the network, and more important about humans communicating with each other, as they argue, negotiate, form alliances, agree strategies, etc." Games featured dynamic alliances, betrayals, coordinated front-line pushes, and emergent strategy that arose from the interaction of simple systems.

The Mac version supported up to 16 concurrent players over AppleTalk (LAN) or UDP (internet). A Windows port called WinBolo, developed by John Morrison, remains in operation with a small active player base.

---

## What Is WebBolo?

WebBolo is a modern, browser-based reimplementation of Bolo, built entirely in JavaScript with WebSocket networking. The goals:

1. **Faithful gameplay.** Recreate the core Bolo experience — tank combat, pillbox capture, base control, engineer mechanics, terrain modification, mine warfare, team alliances — without dumbing anything down.

2. **Zero installation.** Open a browser, enter a URL, play. No downloads, no plugins, no configuration. This is the single biggest advantage over the original and WinBolo.

3. **LAN and WAN.** Play across a living room or across the internet, with the same client. LAN play should be as simple as one player clicking "Host" and others connecting to their IP. WAN play connects through a hosted server.

4. **Self-hostable.** Anyone can run their own WebBolo server with a single command (`npx webbolo-server` or `docker run webbolo`). No vendor lock-in, no central authority required.

5. **Open and extensible.** Open-source. Community maps. Eventually, a bot scripting API in the spirit of the original Bolo's "brain" plugins.

6. **Solo play from day one.** The original Bolo required human opponents — no one online meant no game. WebBolo ships with AI opponents that play through the same interface as humans, at configurable difficulty levels with an adaptive mode. Click "Play Solo" and you're in a full game in seconds, running entirely in the browser with no server. This is how most people will first experience WebBolo, and it must be genuinely fun — not a tutorial afterthought.

---

## Technology Stack

### Client

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Rendering | HTML5 Canvas (2D) | Bolo is a 2D tile-based game. Canvas is more than sufficient, simpler than WebGL, and universally supported. |
| Input | Keyboard events, Gamepad API | Keyboard-primary like the original. Gamepad is a stretch goal. |
| Audio | Web Audio API | Spatial sound for engine noise, gunfire, explosions. |
| Language | Vanilla JavaScript (or TypeScript) | No framework needed for the game itself. Minimal DOM for UI overlays (lobby, chat, HUD). |
| Networking | Native WebSocket API | Binary messages via `ArrayBuffer` / `DataView`. |

### Server

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Runtime | Node.js | JavaScript on both ends means shared code (physics, protocol) between client and server. |
| WebSocket | `ws` npm package | Lightweight, no protocol overhead. Full control over binary messages. |
| Game loop | Fixed-timestep (20 ticks/sec) | Deterministic simulation. Server is authoritative. (WinBolo runs at 50 Hz internally; WebBolo uses 20 Hz with 60 FPS client interpolation — see doc 09.) |
| State | In-memory per room | No database during gameplay. Optional persistent storage for stats/leaderboards later. |

### Shared (Client + Server)

| Component | Purpose |
|-----------|---------|
| `protocol.js` | Message type definitions, binary encode/decode. Identical on both ends. |
| `physics.js` | Tank movement, shell trajectories, collision math. Client uses this for prediction; server uses it for authoritative simulation. |
| `terrainTypes.js` | Terrain enum, speed modifiers, passability rules. |
| `constants.js` | Tick rate, entity limits, balance values. |

### Deployment

| Scenario | Approach |
|----------|----------|
| LAN | One player runs the server locally (Node.js process or embedded Web Worker). Others connect via local IP. |
| WAN (self-hosted) | Run `npx webbolo-server` or `docker run webbolo` on any VPS. Players connect via public URL. |
| WAN (community) | A community-hosted server with lobby and room listing. One small VPS handles multiple concurrent games. |
| Client hosting | Static files served from anywhere — Netlify, GitHub Pages, S3, or the game server itself. |

---

## What WebBolo Is Not

- **Not a mobile game.** Desktop-first, keyboard-driven. Touch controls are a potential future addition but not a design target.
- **Not an MMO.** 16 players per room, like the original. The architecture supports multiple concurrent rooms on one server, but each room is a self-contained game.
- **Not a pixel-art nostalgia project.** The visuals should be clean and readable, but the priority is gameplay fidelity, not retro aesthetics. That said, the original's clean tile-based look is a fine starting point.
- **Not a commercial product.** Open-source, community-driven. The Bolo community is small but passionate — this is for them and for anyone who appreciates elegant game design.

---

## Document Index

| Doc | Title | Contents |
|-----|-------|----------|
| **01** | **Project Overview** | This document. Vision, tech stack, goals. |
| 02 | Gameplay Mechanics | Tank, engineer, pillboxes, bases, terrain, mines, teams, win conditions. |
| 03 | Networking Architecture | Server model, client-side prediction, interpolation, protocol, bandwidth, self-hosting. |
| 04 | Project Structure & Codebase | Directory layout, shared code strategy, build tooling, deployment. |
| 05 | Development Phases & Roadmap | Phased plan with milestones. What to build, in what order, and why. |
| 06 | Map System & Editor | Tile format, map file spec, browser-based editor, original .map compatibility. |
| 07 | AI Bots & Community Features | Bot system, replay/spectator, leaderboards, bot scripting API. |
| 08 | Rendering & Graphics | Canvas 2D renderer, auto-tiling, sprites, fog of war, camera, animation. |
| 09 | WinBolo Source Constants | Authoritative numeric values from WinBolo C source code. |

---

*Working title: "WebBolo." Open to renaming.*
