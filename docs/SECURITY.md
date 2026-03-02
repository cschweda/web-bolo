# WebBolo: Security Audit & Remediation

**Audit date:** March 2, 2026
**Scope:** Full codebase, dependencies, deployment configuration, architecture design
**Status:** All CRITICAL issues resolved. HIGH/MEDIUM items tracked for Phase 2+.

---

## Executive Summary

WebBolo is **safe to deploy on DigitalOcean for solo and LAN play (Phases 1A-1B)**. The game currently runs entirely client-side with no server component, no user accounts, and no persistent data — the attack surface is minimal.

**For multiplayer deployment (Phase 2+)**, the server-side security architecture designed in `docs/03-Networking-Architecture.md` section 8 is well-conceived: authoritative server, server-side fog of war, input validation, and rate limiting. These must be implemented before exposing a public game server.

---

## Issues Found & Resolution

### CRITICAL (3 found, 3 fixed)

#### C1. `serialize-javascript` RCE vulnerability (GHSA-5c6j-r48x-rmvq)
- **Risk:** Remote code execution via prototype pollution in `serialize-javascript <=7.0.2`, a transitive dependency of Nuxt/Nitro.
- **Fix:** Added `pnpm.overrides` in root `package.json` to force `serialize-javascript >=7.0.3`.
- **Verification:** `pnpm audit` now reports zero vulnerabilities.

#### C2. `.vscode/` directory not gitignored
- **Risk:** IDE settings, launch configs, and extension recommendations can leak internal paths, debug configurations, and environment assumptions.
- **Fix:** Added `.vscode/` to `.gitignore`.

#### C3. `curl | bash` pattern in deployment guide
- **Risk:** Piping remote scripts directly into a shell skips any opportunity to review the code before execution (supply chain attack vector).
- **Fix:** Changed both instances in `docs/DEPLOYMENT.md` to download-then-inspect-then-execute pattern:
  ```bash
  curl -fsSL <url> -o /tmp/script.sh
  # Review: less /tmp/script.sh
  sudo bash /tmp/script.sh
  ```

---

### HIGH (8 identified, deferred to relevant phases)

#### H1. No Content Security Policy (CSP) headers
- **Phase:** 2 (server deployment)
- **Action:** Add strict CSP via Nitro middleware: `default-src 'self'; script-src 'self'; connect-src 'self' wss://; style-src 'self' 'unsafe-inline'`

#### H2. No rate limiting on WebSocket connections
- **Phase:** 2
- **Action:** Implement connection rate limiting (max connections per IP, message rate per connection) as designed in doc 03 section 8.

#### H3. No input validation on game protocol messages
- **Phase:** 2
- **Action:** Server must validate all incoming binary messages — check message type, bounds-check coordinates, verify action legality. Never trust client state.

#### H4. No CORS configuration
- **Phase:** 2
- **Action:** Configure Nitro CORS to allow only the game's origin domain.

#### H5. WebSocket origin checking not implemented
- **Phase:** 2
- **Action:** Validate `Origin` header on WebSocket upgrade requests to prevent cross-site WebSocket hijacking.

#### H6. No request size limits
- **Phase:** 2
- **Action:** Set max WebSocket message size (protocol max is ~100 bytes per message — reject anything larger).

#### H7. Missing `Strict-Transport-Security` header
- **Phase:** 2 (after TLS setup)
- **Action:** Add HSTS header via nginx: `add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;`

#### H8. PM2 ecosystem config uses `NODE_ENV=production` but no other hardening
- **Phase:** 2
- **Action:** Add `--max-old-space-size`, `--max-http-header-size`, and drop privileges in PM2 config.

---

### MEDIUM (9 identified)

| ID | Issue | Phase | Mitigation |
|----|-------|-------|------------|
| M1 | No game state integrity checks | 2 | Server is authoritative — client predictions are overridden |
| M2 | Canvas rendering has no anti-tamper | 1B | Accept as inherent to client-side rendering; server validates all game state |
| M3 | `generateTestMap` uses `Math.random` | 1B | Replace with seeded PRNG for reproducible maps; server generates authoritative maps |
| M4 | No reconnection token rotation | 3 | Implement token rotation on reconnect as designed in doc 03 |
| M5 | Deployment guide stores `.env` adjacent to code | 2 | Use systemd `EnvironmentFile` or Docker secrets instead |
| M6 | No dependency pinning (uses `^` ranges) | 2 | Consider lockfile-only installs for production (`pnpm install --frozen-lockfile`) |
| M7 | No subresource integrity for CDN assets | 2 | Generate SRI hashes if any CDN resources are added |
| M8 | `imageSmoothingEnabled = false` set once | 1A | Minor — reset on context loss. Add canvas context-lost handler |
| M9 | No error boundary for game crashes | 1B | Add Vue error boundary to catch and display game loop errors gracefully |

---

### LOW (10 identified)

| ID | Issue | Phase | Mitigation |
|----|-------|-------|------------|
| L1 | No `X-Content-Type-Options` header | 2 | Add `nosniff` via server middleware |
| L2 | No `X-Frame-Options` header | 2 | Add `DENY` or `SAMEORIGIN` via server middleware |
| L3 | No `Referrer-Policy` header | 2 | Add `strict-origin-when-cross-origin` |
| L4 | Debug stats visible in production | 1B | Gate debug overlay behind dev mode or keyboard toggle |
| L5 | No privacy policy / cookie notice | 3 | Add if analytics or cookies are used |
| L6 | `onlyBuiltDependencies` allows native builds | — | Acceptable; these are trusted packages (esbuild, parcel/watcher, vue-demi) |
| L7 | No automated dependency scanning | 2 | Add `pnpm audit` to CI pipeline |
| L8 | Map data transmitted without compression | 2 | Use WebSocket permessage-deflate or custom delta compression |
| L9 | No abuse reporting mechanism | 3 | Add in-game report button for multiplayer |
| L10 | Keyboard event handlers don't check `e.target` | 1B | Ignore game keys when focused on input/textarea elements |

---

## Architecture Security Assessment

The networking architecture in `docs/03-Networking-Architecture.md` section 8 specifies a strong security model:

- **Authoritative server** — clients send inputs, server computes state. No client can teleport, speed-hack, or fake kills.
- **Server-side fog of war** — enemy positions are never sent to clients who can't see them. Wall-hacking is impossible by design.
- **Binary protocol** — tight message format (~12 bytes per entity) with defined message types makes injection harder than JSON-based protocols.
- **Rate limiting** — designed at both connection and message levels.
- **Input validation** — all actions validated server-side before applying.

This is a well-designed security architecture. The key is implementing it faithfully in Phase 2.

---

## Deployment Safety by Phase

| Phase | Safe to Deploy? | Notes |
|-------|----------------|-------|
| **1A** (current) | Yes | Client-only, no server, no user data, no network exposure |
| **1B** | Yes | Web Worker solo play, still no server |
| **2** (LAN) | Yes, with caution | Implement H1-H8 before exposing server publicly |
| **3** (WAN) | Requires full hardening | All HIGH/MEDIUM items must be resolved before public internet exposure |
| **4** | Production-ready | Polish, monitoring, automated scanning |

---

## Resolved Items Log

| Date | ID | Fix |
|------|----|-----|
| 2026-03-02 | C1 | `pnpm.overrides` for serialize-javascript >=7.0.3 |
| 2026-03-02 | C2 | Added `.vscode/` to `.gitignore` |
| 2026-03-02 | C3 | Changed curl\|bash to download-inspect-execute in DEPLOYMENT.md |
