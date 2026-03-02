# WebBolo Design Docs — Comprehensive Audit

**Date:** March 2026 (updated after v0.3 review)
**Scope:** All 9 documents + PROMPT.md reviewed against the WinBolo source code (doc 09)

---

## Status of Previously Identified Issues

### RESOLVED in v0.3 (P0 — Numeric Values)

The following critical issues from the initial audit have been **fixed** in the v0.3 docs:

| Issue | Status |
|-------|--------|
| Terrain speeds wrong in docs 02, 06, 08 (swamp/crater/rubble were 0.5x–0.75x, now correctly 0.25x; road was 1.5x, now 1.33x; forest was 0.75x, now 0.50x) | **Fixed** |
| Shell/pillbox damage was "1" in doc 02, now correctly "5 per hit" | **Fixed** |
| Mine damage was "5" in doc 02, now correctly "10 per hit" | **Fixed** |
| Pillbox health was "16 hits" in doc 02, now correctly "15 HP, 3 hits to destroy" | **Fixed** |
| Placing pillbox was "Free" in doc 02, now correctly "4 wood" | **Fixed** |
| Starting mines was "0" in doc 02, now correctly "40 (Open game)" | **Fixed** |
| Base pools were "40/20/40" in doc 02, now correctly "90/90/90" | **Fixed** |
| Engineer build time was "2–4 sec" in doc 02, now correctly "~0.4 sec" | **Fixed** |
| AI bots listed as Phase 4 in doc 07 priority matrix, now correctly Phase 1B | **Fixed** |
| Document count "of 07" in headers, now "of 09" | **Fixed** |
| Doc 01 index missing docs 08 and 09, now included | **Fixed** |
| Doc 04 `MINE_DAMAGE = 5` in sample code, now correctly 10 | **Fixed** |
| Shell fire rate "approximately 3/sec" in doc 02, now correctly "~3.8/sec" | **Fixed** |
| Pillbox range "approximately 7–8 tiles" in doc 02, now correctly "8 tiles exactly" | **Fixed** |

### RESOLVED in v0.3 Post-Review

| Issue | Fix Applied |
|-------|------------|
| Doc 06 terrain mod table had duplicate/conflicting "Explosion → Building → Rubble" row (skipping Halfbuilding stage) | **Removed duplicate row, clarified two-stage destruction** |
| Doc 08 spritesheet layout listed "Wall variants" (no such terrain type) | **Changed to "Halfbuilding variants," added missing Boat row** |

### RESOLVED — Missing Documentation

| Issue | Fix Applied |
|-------|------------|
| No testing strategy anywhere in docs | **Added Testing Strategy section to doc 05** — covers unit tests, property-based tests, integration tests, latency simulation, and CI performance gates |
| No accessibility considerations | **Added Accessibility section (§13) to doc 08** — color-blind support with shape/pattern markers, keyboard-only navigation, screen shake toggle, text scaling, visual fallbacks for audio cues |
| No performance profiling plan (only a static budget) | **Added Performance Profiling subsection (§12.3) to doc 08** — what to measure, when to investigate, debug HUD spec, CI gate |
| Sound design deferred entirely to Phase 3 (polish) despite being gameplay-critical | **Promoted basic spatial audio to Phase 1B in doc 05** — added Sound Design section with rationale and core sound list; updated Phase 3 to cover full spatial audio and occlusion |
| PROMPT.md lacked guidance on testing, accessibility, sound, performance | **Added development principles 8–11** covering all four areas with cross-references to detailed doc sections |

---

## REMAINING ISSUES

### DESIGN DECISION: Tick Rate (Acknowledged, Not a Bug)

| Document | Value |
|----------|-------|
| Docs 01, 03, 04, 05 | 20 ticks/sec |
| Doc 09 (WinBolo source) | 50 Hz game ticks, 100 Hz internal |

WebBolo intentionally uses 20 Hz server ticks (vs WinBolo's 50 Hz). This is a valid design choice for WebSocket-based networking with client-side prediction and 60 FPS interpolation. The PROMPT.md (principle 7) documents the scaling rule: multiply tick-based durations by 0.4, multiply world-unit speeds by 2.5×.

**Status:** Acknowledged design deviation. No fix needed.

### P2 — REDUNDANCY: Terrain Types Defined in 4 Places

The terrain enum/speed table still appears in docs 02, 06, 08, and 09. All four copies are now *correct* (matching doc 09), but maintaining 4 copies invites future drift.

**Recommendation:** When implementation begins, `shared/terrainTypes.js` becomes the single source of truth. Other docs should reference it rather than maintaining independent tables. Not worth fixing in the docs now — the risk is low while the values are consistent.

### P2 — REDUNDANCY: Solo Play Detailed in 3 Places

Solo play architecture appears in:
1. Doc 02 (Sections 8.1–8.7) — ~3000 words
2. Doc 05 (Phase 1B) — ~1500 words
3. Doc 07 (Sections 1–5) — ~4000 words (the authoritative version)

Doc 02's Section 8 is essentially a compressed copy of doc 07. This is informational redundancy, not a correctness issue — all three agree. A future cleanup could trim doc 02 §8 to a brief overview pointing to doc 07.

**Status:** Low priority. Not a correctness issue.

### P2 — REDUNDANCY: Deployment in Docs 03 and 04

Doc 04 includes nginx config, Docker setup, and hosting strategies that overlap with doc 03 §6. Both are consistent. A future cleanup could consolidate deployment content into doc 03 and keep doc 04 focused on code structure.

**Status:** Low priority.

### P3 — INFORMATIONAL: Mechanics Documented Only in Doc 09

Several mechanics from the WinBolo source are fully documented in doc 09 (the source reference) and mentioned in the PROMPT.md summary, but not expanded in the gameplay docs (02) or rendering docs (08):

1. **Bradians** (256-unit angular system) — in doc 09 §12 and PROMPT §Angles
2. **World coordinate system** (16-bit, 256 sub-units per tile) — in doc 09 §2 and PROMPT §World Coordinates
3. **Death static display** (different animations per death cause) — in doc 09 §3
4. **Tree regrowth scoring** (neighbor-based growth algorithm) — in doc 09 §11
5. **Game type starting inventories** (Tournament/Strict variants) — in doc 09 §3.1 and PROMPT

These are implementation details that belong in doc 09 (the source reference) and don't need to be duplicated in the gameplay docs. Implementers should read doc 09 before coding, as the PROMPT.md instructs.

**Status:** By design. Doc 09 is the authoritative reference for implementation details.

---

## SUMMARY

| Category | Count | Status |
|----------|-------|--------|
| P0 — Wrong numeric values | 14 | All **RESOLVED** in v0.3 |
| P1 — Factual errors/outdated refs | 4 | All **RESOLVED** in post-review fixes |
| New — Missing documentation | 4 | All **RESOLVED** (testing, accessibility, performance, sound) |
| P2 — Redundancy (non-breaking) | 3 | **Open** — low priority, no correctness impact |
| P3 — Info only in doc 09 | 5 | **By design** — doc 09 is the implementation reference |

**The docs are now consistent and implementation-ready.** All numeric values match the WinBolo source. All critical cross-cutting concerns (testing, accessibility, performance monitoring, sound design) are documented. The PROMPT.md development principles have been expanded to cover these areas.
