# WebBolo: Map System & Editor

**Document:** 06 of 09
**Version:** 0.3
**Date:** March 2026

---

## 1. Map Fundamentals

### 1.1 Tile Grid

The game world is a 2D grid of square tiles. Each tile occupies one byte (terrain type enum).

| Parameter | Value | Notes |
|-----------|-------|-------|
| Default map size | 256 × 256 tiles | Matches the original Bolo. Large enough for 16 players. |
| Tile size (rendering) | 16 × 16 pixels (base) | Scalable. At 16px, a 256x256 map is 4096x4096 pixels. |
| Viewport | ~40 × 30 tiles | Depends on screen resolution and zoom level. |
| Coordinate system | Origin (0,0) at top-left | X increases right, Y increases down. |

### 1.2 Terrain Type Enum

**Definitive values from WinBolo `global.h`, cross-referenced with the original Bolo manual.**

```javascript
// shared/terrainTypes.js
export const TERRAIN = {
  BUILDING:      0,    // Impassable barrier. Destructible → HALFBUILDING → RUBBLE. Also used for player-built walls.
  RIVER:         1,    // Water. Very slow without boat. Damages shell/mine inventory over time. Navigable by boat.
  SWAMP:         2,    // Very slow (0.25x). Looks similar to grass — easy to drive into accidentally.
  CRATER:        3,    // Very slow (0.25x). Created by mine explosions. Floods if adjacent to water.
  ROAD:          4,    // Fast (1.33x). When placed on a river tile, renders as a bridge. Boats can't pass under bridges.
  FOREST:        5,    // Slow (0.50x). Conceals tanks when surrounded on all 8 sides. Harvestable. Regrows over time.
  RUBBLE:        6,    // Very slow (0.25x). Remains of fully destroyed buildings.
  GRASS:         7,    // Standard terrain (1.0x). Most of the island.
  HALFBUILDING:  8,    // Impassable. Damaged building — intermediate destruction state. Still blocks movement.
  BOAT:          9,    // Moored boat on water. Fast. One hit destroys. Players spawn on boat. Costs 5 trees to build.
  MINE_SWAMP:   10,    // Mined swamp. Renders as swamp to enemies. Detonates on contact.
  MINE_CRATER:  11,    // Mined crater. Renders as crater to enemies.
  MINE_ROAD:    12,    // Mined road. Renders as road to enemies.
  MINE_FOREST:  13,    // Mined forest. Renders as forest to enemies.
  MINE_RUBBLE:  14,    // Mined rubble. Renders as rubble to enemies.
  MINE_GRASS:   15,    // Mined grass. Renders as grass to enemies.
  DEEP_SEA:     0xFF,  // Immutable ocean border. Instant death without boat. Can't build on it.
};
```

**Mine terrain helper:** Subtract 8 from any mine terrain ID to get the visual base terrain for rendering:

```javascript
export function getBaseTerrain(terrainId) {
  if (terrainId >= TERRAIN.MINE_SWAMP && terrainId <= TERRAIN.MINE_GRASS) {
    return terrainId - 8;  // MINE_GRASS (15) - 8 = GRASS (7), etc.
  }
  return terrainId;
}

export function isMined(terrainId) {
  return terrainId >= TERRAIN.MINE_SWAMP && terrainId <= TERRAIN.MINE_GRASS;
}
```

Each terrain type has associated properties:

```javascript
export const TERRAIN_PROPS = {
  [TERRAIN.BUILDING]:     { passable: false, deadly: false, speedMod: 0,    destructible: true,  blocksVision: true,  blocksShells: true  },
  [TERRAIN.RIVER]:        { passable: true,  deadly: false, speedMod: 0.25, destructible: false, blocksVision: false, blocksShells: false, degradesAmmo: true },
  [TERRAIN.SWAMP]:        { passable: true,  deadly: false, speedMod: 0.25, destructible: false, blocksVision: false, blocksShells: false },
  [TERRAIN.CRATER]:       { passable: true,  deadly: false, speedMod: 0.25, destructible: false, blocksVision: false, blocksShells: false, floodsNearWater: true },
  [TERRAIN.ROAD]:         { passable: true,  deadly: false, speedMod: 1.33, destructible: true,  blocksVision: false, blocksShells: false },
  [TERRAIN.FOREST]:       { passable: true,  deadly: false, speedMod: 0.50, destructible: true,  blocksVision: true,  blocksShells: true,  conceals: true, harvestable: true, regrows: true },
  [TERRAIN.RUBBLE]:       { passable: true,  deadly: false, speedMod: 0.25, destructible: false, blocksVision: false, blocksShells: false },
  [TERRAIN.GRASS]:        { passable: true,  deadly: false, speedMod: 1.0,  destructible: false, blocksVision: false, blocksShells: false },
  [TERRAIN.HALFBUILDING]: { passable: false, deadly: false, speedMod: 0,    destructible: true,  blocksVision: true,  blocksShells: true  },
  [TERRAIN.BOAT]:         { passable: true,  deadly: false, speedMod: 1.0,  destructible: true,  blocksVision: false, blocksShells: false, floatsOnWater: true },
  [TERRAIN.DEEP_SEA]:     { passable: false, deadly: true,  speedMod: 0,    destructible: false, blocksVision: false, blocksShells: false },
};

// Mine variants inherit properties from their base terrain (add detonatesOnContact: true)
for (let mineId = TERRAIN.MINE_SWAMP; mineId <= TERRAIN.MINE_GRASS; mineId++) {
  const baseId = mineId - 8;  // MINE_SWAMP(10)-8 = SWAMP(2), etc.
  TERRAIN_PROPS[mineId] = { ...TERRAIN_PROPS[baseId], mined: true, detonatesOnContact: true };
}
```

**Design notes:**

1. **No separate WALL type.** Player-built walls use `BUILDING` (ID 0). Mechanically identical to map-placed buildings.
2. **No RIVER_EDGE type.** River-to-land transitions are handled by auto-tiling bitmasking on the `RIVER` type.
3. **Bridge = ROAD on RIVER.** The renderer detects road tiles with water neighbors and draws a bridge graphic.
4. **Fog of war is a rendering overlay, not a terrain type.** Map stores real terrain; fog is client-side visibility state.
5. **Mine visibility:** Mines render as base terrain to all players. The owning player and allies see a marker overlay. Alliance mine positions are shared in real-time but NOT retroactively (mines laid before alliance formed stay secret).

---

## 2. Map File Format

### 2.1 WebBolo Native Format (.wbmap)

A compact binary format optimized for fast loading and small file size.

```
Header (16 bytes):
  Bytes 0–3:   Magic number "WBMP" (0x57424D50)
  Byte 4:      Format version (currently 1)
  Byte 5:      Reserved (0)
  Bytes 6–7:   Map width (uint16, little-endian)
  Bytes 8–9:   Map height (uint16, little-endian)
  Bytes 10–11: Pillbox count (uint16)
  Bytes 12–13: Base count (uint16)
  Bytes 14–15: Spawn point count (uint16)

Tile data (width × height bytes):
  Row-major order. Each byte is a terrain type enum value.
  For a 256×256 map: 65,536 bytes.

Pillbox data (pillboxCount × 5 bytes each):
  Bytes 0–1: X position (uint16)
  Bytes 2–3: Y position (uint16)
  Byte 4:    Starting health (uint8, 0–255)

Base data (baseCount × 7 bytes each):
  Bytes 0–1: X position (uint16)
  Bytes 2–3: Y position (uint16)
  Byte 4:    Starting armor supply (uint8)
  Byte 5:    Starting shell supply (uint8)
  Byte 6:    Starting mine supply (uint8)

Spawn point data (spawnCount × 5 bytes each):
  Bytes 0–1: X position (uint16)
  Bytes 2–3: Y position (uint16)
  Byte 4:    Team hint (uint8, 0 = any team, 1–8 = preferred team)

Metadata (variable length, optional):
  Byte 0:     Metadata section marker (0xFF)
  Bytes 1–2:  Name length (uint16)
  Bytes 3–N:  Map name (UTF-8)
  Bytes N+1–N+2: Author length (uint16)
  Bytes N+3–M:   Author name (UTF-8)
  Bytes M+1:     Recommended min players (uint8)
  Bytes M+2:     Recommended max players (uint8)
```

A 256x256 map with 16 pillboxes, 16 bases, and 16 spawn points is approximately 65,536 + 80 + 112 + 80 + metadata ≈ **66 KB**. With gzip compression (served over HTTP), this drops to roughly 10–15 KB.

### 2.2 JSON Format (Development & Editor)

During development and in the map editor, maps can also be stored as JSON for readability:

```json
{
  "name": "Everard Island",
  "author": "Classic",
  "version": 1,
  "width": 256,
  "height": 256,
  "recommendedPlayers": { "min": 4, "max": 16 },
  "tiles": "base64-encoded tile data",
  "pillboxes": [
    { "x": 120, "y": 80, "health": 16 },
    { "x": 135, "y": 92, "health": 16 }
  ],
  "bases": [
    { "x": 100, "y": 100, "armor": 40, "shells": 40, "mines": 20 },
    { "x": 200, "y": 150, "armor": 40, "shells": 40, "mines": 20 }
  ],
  "spawnPoints": [
    { "x": 50, "y": 50, "team": 0 },
    { "x": 200, "y": 200, "team": 0 }
  ]
}
```

The tile data is base64-encoded to keep the JSON manageable (65,536 raw bytes → ~87 KB base64). The JSON format converts to/from the binary `.wbmap` format.

### 2.3 Original Bolo .map Compatibility (Phase 4)

The original Bolo used a run-length encoded binary format for maps. A converter tool (`tools/convertBoloMap.js`) can translate original .map files to the WebBolo format, opening up the library of community-created classic maps.

The original format details:
- 256×256 tile grid with a different terrain type numbering.
- Pillbox and base positions embedded in the file.
- Run-length encoding for tile data (the maps are mostly water/grass with distinct island shapes).

---

## 3. Map Design Principles

Good Bolo maps follow patterns that the community refined over years of play:

### 3.1 Island Geography

The classic Bolo map is an island (or archipelago) surrounded by deep water. The water boundary constrains the play area and creates natural chokepoints at bridges and narrow land passages.

### 3.2 Base Distribution

- Bases should be spread across the map, not clustered.
- Each "side" of the map should have roughly equal access to bases.
- Some bases should be in defensible positions (surrounded by forest, accessible only through chokepoints). Others should be exposed and contested.
- Central bases should be harder to hold — they're attacked from multiple directions.

### 3.3 Pillbox Placement

- Starting pillboxes should be neutral and distributed to encourage early-game conflict.
- Some pillboxes should guard natural chokepoints.
- Pillbox density should be balanced — too few and the game lacks defensive options; too many and it stalemates.

### 3.4 Terrain Variety

- Forests for cover, wood resources, and ambush opportunities.
- Open ground for tank battles.
- Swamps as natural slow zones.
- Water features (rivers, lakes) that divide the map and create bridge chokepoints.
- Road networks that reward territorial control (move faster on captured territory).

### 3.5 Symmetry

For competitive play, maps should be roughly symmetrical (rotational or reflective) so no team has a geographic advantage. Asymmetric maps are fine for casual play and add variety.

---

## 4. Map Editor (Phase 4)

### 4.1 Overview

A browser-based map editor built with HTML5 Canvas. It shares rendering code with the game client (terrain tiles look the same in the editor and in-game).

### 4.2 Features

**Core:**
- Tile painting: select a terrain type, click/drag to paint tiles.
- Pillbox placement: click to place, click to remove.
- Base placement: click to place, click to remove.
- Spawn point placement: click to place with team assignment.
- Undo/redo (command stack).
- Zoom and pan.
- Grid overlay toggle.

**File operations:**
- New map (configurable size, default fill terrain).
- Save to `.wbmap` (binary download) or JSON.
- Load from `.wbmap` or JSON.
- Import from original Bolo `.map` format.

**Tools:**
- Brush: paint single tile.
- Fill: flood-fill a region with selected terrain.
- Rectangle: fill a rectangular area.
- Line: draw a line of tiles (useful for roads and walls).
- Eraser: revert to default terrain (grass).

**Validation:**
- Warn if no bases are placed.
- Warn if no spawn points are placed.
- Warn if the map has unreachable areas (islands with no base or bridge access).
- Display counts: pillboxes, bases, spawn points, terrain distribution.

### 4.3 Editor Architecture

```
tools/mapEditor/
├── index.html          # Editor page
├── css/
│   └── editor.css      # Editor-specific UI styling
└── js/
    ├── editor.js        # Main editor logic, tool state machine
    ├── editorRenderer.js  # Canvas rendering (imports shared terrain rendering)
    ├── tools/
    │   ├── brushTool.js
    │   ├── fillTool.js
    │   ├── rectTool.js
    │   ├── lineTool.js
    │   └── entityTool.js  # Pillbox, base, spawn placement
    ├── history.js        # Undo/redo command stack
    └── fileIO.js         # Save/load/import/export
```

The editor imports `shared/terrainTypes.js` and `shared/mapFormat.js` to ensure terrain definitions and file format handling are identical to the game.

### 4.4 Editor as a Standalone Tool

The map editor is a separate HTML page that does not require the game server to be running. It's a pure client-side tool. Maps are saved as local file downloads and can be uploaded to a game server for play.

For a hosted deployment, the map editor could be served alongside the game client, with an option to save maps directly to the server's map library.

---

## 5. Runtime Map State

During gameplay, the server maintains a runtime map state that extends the static tile data:

### 5.1 Tile State Array

```javascript
// server/map.js
class GameMap {
  constructor(mapData) {
    this.width = mapData.width;
    this.height = mapData.height;
    this.tiles = new Uint8Array(mapData.tiles);         // Current terrain state
    this.originalTiles = new Uint8Array(mapData.tiles);  // Initial state (for regrowth)
    this.regrowthTimers = new Float32Array(this.width * this.height); // Seconds until regrowth
    this.dirtyTiles = new Set();  // Tiles changed since last broadcast
  }

  setTile(x, y, terrainType) {
    const idx = y * this.width + x;
    this.tiles[idx] = terrainType;
    this.dirtyTiles.add(idx);

    // Start regrowth timer if this was a forest tile
    if (this.originalTiles[idx] === TERRAIN.FOREST && terrainType !== TERRAIN.FOREST) {
      this.regrowthTimers[idx] = FOREST_REGROWTH_TIME; // e.g., 300 seconds (5 minutes)
    }
  }

  tick(dt) {
    // Process regrowth timers
    for (let i = 0; i < this.regrowthTimers.length; i++) {
      if (this.regrowthTimers[i] > 0) {
        this.regrowthTimers[i] -= dt;
        if (this.regrowthTimers[i] <= 0) {
          this.regrowthTimers[i] = 0;
          if (this.originalTiles[i] === TERRAIN.FOREST && this.tiles[i] === TERRAIN.GRASS) {
            this.tiles[i] = TERRAIN.FOREST;
            this.dirtyTiles.add(i);
          }
        }
      }
    }
  }

  getDirtyTilesAndClear() {
    const dirty = Array.from(this.dirtyTiles);
    this.dirtyTiles.clear();
    return dirty; // Array of indices with their new terrain type
  }
}
```

### 5.2 Terrain Modification Events

| Trigger | Source Tile | Result Tile | Notes |
|---------|-----------|-------------|-------|
| Engineer harvests | Forest | Grass | Wood resource gained. Regrowth timer starts. |
| Explosion | Forest | Grass | Regrowth timer starts. |
| Explosion | Grass | Crater | |
| Explosion | Road | Crater | |
| Explosion | Building | Halfbuilding | First hit. Still impassable. |
| Explosion | Halfbuilding | Rubble | Second hit. Now passable. |
| Crater floods | Crater (adjacent to water) | Water | Only if adjacent tile is Water or Deep Water. |
| Engineer builds road | Grass or Swamp | Road | Costs wood. |
| Engineer builds wall | Grass | Building | Costs wood. |
| Engineer builds boat | Water (at edge) | Boat | Costs wood. Boat is fragile. |
| Boat destroyed | Boat | Water | Reverts to water tile. |
| Regrowth timer expires | Grass (was Forest) | Forest | Only if original tile was Forest. |

---

## 6. Default Maps

WebBolo should ship with 3–5 default maps suitable for different player counts:

| Map Name | Size | Bases | Pillboxes | Recommended Players | Description |
|----------|------|-------|-----------|-------------------|-------------|
| Tutorial Island | 64×64 | 4 | 4 | 1–2 | Small, simple layout for learning mechanics. |
| Everard Island | 256×256 | 16 | 16 | 8–16 | Classic Bolo-style island with varied terrain. |
| Twin Peaks | 256×256 | 12 | 12 | 4–8 | Two large landmasses connected by bridges. |
| Archipelago | 256×256 | 16 | 16 | 8–16 | Multiple small islands with boat crossings. |
| The Corridor | 128×256 | 8 | 8 | 2–4 | Narrow map for intense head-to-head battles. |

These maps should be designed to demonstrate the full range of Bolo's terrain and tactical mechanics.

---

*See also: [02 - Gameplay Mechanics](./02-Gameplay-Mechanics.md) for terrain behavior rules.*
*See also: [05 - Development Phases](./05-Development-Phases.md) for when the map editor is built.*
