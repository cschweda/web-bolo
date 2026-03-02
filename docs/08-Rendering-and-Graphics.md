# WebBolo: Rendering & Graphics System

**Document:** 08 of 09
**Version:** 0.2
**Date:** March 2026

---

## 1. Design Goal: Authentic to the Original

WebBolo's graphics should evoke the look and feel of the original Macintosh Bolo (1992–1995). That game rendered a top-down view of the battlefield using small square tiles on a monochrome-capable Mac — a 512×342 pixel screen with 1-bit graphics, later running on color-capable Macs but retaining the same compact, functional aesthetic. The visual language was clean, readable, and information-dense. You could glance at the screen and immediately understand: that's a forest, that's a road, that's an enemy tank near a pillbox.

WebBolo aims for this same quality: **clarity over beauty, readability over polish**. We're not making a modern RTS with high-res textures and particle effects. We're making a game that looks like a faithful evolution of the original — recognizable to anyone who played Mac Bolo or WinBolo, but running natively in a browser at modern resolutions.

### 1.1 What "Faithful" Means in Practice

- **Tile-based terrain** rendered on a grid, just like the original.
- **Small, pixel-art tiles** at 16×16 pixels — the standard size used by WinBolo and consistent with the original's visual density.
- **Top-down perspective** with no rotation of the camera — the map is always oriented with north at the top.
- **16-direction tank rotation** — the tank sprite has 16 rotational frames (every 22.5°), exactly like the original. No smooth rotation interpolation on the sprite itself.
- **Fog of war** rendered as black/dark tiles obscuring unexplored areas, with a circular visibility radius around the player's tank.
- **Minimal animation** — water ripples, tree sway, and explosion effects use 2–4 frame loops. The original was not animated terrain; WinBolo added subtle animations. We follow WinBolo's lead here.
- **No 3D, no parallax, no lighting effects.** The charm of Bolo is its simplicity. The battlefield is a flat map. Everything is visible from directly above.

### 1.2 What We Improve

A few places where we deviate from pixel-perfect reproduction, because the browser context demands it:

- **Resolution scaling**: The original was designed for 512×342 (Mac Classic) or 640×480 (later Macs). We render at whatever resolution the browser window provides, scaling the tile grid with integer scaling or nearest-neighbor interpolation so pixels stay crisp.
- **Viewport size**: The original showed a fixed ~15×15 tile viewport of the battlefield. We allow the viewport to scale with window size (more visible area on larger screens), but maintain a minimum and maximum zoom level so the game never feels too zoomed-in or too zoomed-out.
- **HUD**: The original had a separate info panel alongside the game view. We overlay HUD elements on the canvas or use DOM elements alongside it, adapting to modern screen sizes.
- **Color**: The original Mac Bolo was primarily black-and-white. WinBolo used a 256-color palette with a skin system. We use WinBolo's default color palette as our baseline, with support for custom skins.

---

## 2. Rendering Technology: HTML5 Canvas 2D

### 2.1 Why Canvas 2D, Not WebGL

For a 2D tile-based game with 16×16 pixel sprites, Canvas 2D is the right choice:

- **Simplicity**: Canvas 2D's `drawImage()` with source rectangle clipping is exactly the API you need for blitting tiles from a spritesheet. No shader programs, no texture atlases with UV coordinates, no GPU buffer management.
- **Performance headroom**: Drawing a 30×30 tile viewport (900 tiles) plus ~50 sprites per frame at 60 FPS is trivially within Canvas 2D's capabilities, even on low-end hardware. We're nowhere near the performance ceiling.
- **Pixel-perfect control**: Canvas 2D with `imageSmoothingEnabled = false` gives us crisp nearest-neighbor scaling, essential for pixel art. WebGL can do this too, but requires more setup.
- **Broad compatibility**: Canvas 2D works everywhere — every browser, every device, including older phones and Chromebooks. WebGL has occasional driver issues on low-end hardware.
- **Debuggability**: Canvas 2D operations are straightforward to reason about. When a tile renders wrong, you check the source rectangle coordinates. No shader debugging.

**When would we need WebGL?** If we wanted per-pixel lighting, real-time shadows, water reflections, or rendering 10,000+ sprites per frame. We don't want any of those things. Bolo's visual identity *is* its simplicity.

### 2.2 Canvas Setup

```javascript
// renderer.js
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Critical: disable image smoothing for crisp pixel art
ctx.imageSmoothingEnabled = false;

// The canvas element size matches the window (CSS pixels)
// The internal resolution is calculated based on zoom level
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = false; // Must re-set after resize
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
```

### 2.3 The Render Loop

The renderer runs at the browser's native refresh rate (typically 60 FPS) via `requestAnimationFrame`. The game simulation ticks at 20 Hz (server tick rate). The renderer interpolates between the last two simulation states to produce smooth motion at 60 FPS.

```javascript
function render(timestamp) {
  const alpha = getInterpolationAlpha(timestamp); // 0.0 to 1.0 between ticks

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Draw terrain tiles (only those visible in viewport)
  drawTerrain(ctx, viewportX, viewportY);

  // 2. Draw ground-level entities (mines, craters — below tanks)
  drawGroundEntities(ctx, alpha);

  // 3. Draw entity sprites (tanks, shells, engineer, pillboxes, bases)
  drawEntities(ctx, alpha);

  // 4. Draw fog of war overlay
  drawFogOfWar(ctx);

  // 5. Draw HUD overlay (armor, shells, mines, minimap)
  drawHUD(ctx);

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
```

---

## 3. The Tile System

### 3.1 Tile Dimensions

Every terrain tile is **16×16 pixels** at native resolution. This matches WinBolo's tile size and is the standard pixel-art tile size for games of this era and aesthetic.

At native 1:1 scale, a 1920×1080 screen would show a viewport of 120×67 tiles — far too zoomed out. In practice, tiles are rendered at an **integer scale factor**:

| Scale | Tile Display Size | Viewport on 1920×1080 | Feel |
|-------|-------------------|----------------------|------|
| 1x | 16×16 px | 120×67 tiles | Too small — like viewing the full map |
| 2x | 32×32 px | 60×33 tiles | Zoomed out, strategic overview |
| 3x | 48×48 px | 40×22 tiles | **Default** — close to original Bolo's viewport density |
| 4x | 64×64 px | 30×16 tiles | Zoomed in, tactical detail |

The **default scale is 3x**, giving approximately 40×22 visible tiles. The original Mac Bolo showed roughly 15×15 tiles on a small screen; at 3x on a modern monitor you see more, but the visual density feels similar because modern screens are physically larger.

Players can adjust zoom with scroll wheel or +/- keys, cycling through integer scale factors. Integer scaling is mandatory — fractional scaling produces blurry pixels that destroy the pixel art aesthetic.

### 3.2 Terrain Types and Tile Graphics

The map uses 16 logical terrain types (see doc 06). Each terrain type needs multiple tile *variants* to handle edges, corners, and transitions to adjacent terrain types. This is where the auto-tiling system comes in.

**Terrain types (definitive, from WinBolo `global.h` cross-referenced with the original Bolo manual):**

| ID | WinBolo Constant | Manual Name | Speed | Visual Description |
|----|-----------------|-------------|-------|-------------------|
| 0 | `BUILDING` | Buildings | Impassable | Brown-gray brick pattern. Also used for player-built walls. |
| 1 | `RIVER` | Water | Very slow (no boat) | Medium blue, flow pattern. Navigable by boat. Damages tank shells/mines over time. Bridges (roads on water) sit on top. |
| 2 | `SWAMP` | Swamp | Very slow (0.25x) | Dark green-brown murky texture. Looks similar to grass — easy to drive into accidentally. Natural defense. |
| 3 | `CRATER` | Crater | Very slow (0.25x) | Dark brown circular depression. Created by mine explosions. Floods if adjacent to water, creating artificial rivers/moats. |
| 4 | `ROAD` | Road / Bridge | Fast (1.33x) | Gray-tan smooth surface. When placed on a river tile, renders as a low floating bridge. Boats can't pass under bridges. |
| 5 | `FOREST` | Forest | Slow (0.50x) | Dark green tree canopy. Conceals tanks completely when surrounded on all 8 sides. Harvestable for building materials. Regrows over time. |
| 6 | `RUBBLE` | Rubble | Very slow (0.25x) | Gray-brown debris. Result of fully destroying a building. Passable but slow. |
| 7 | `GRASS` | Grass | Medium (1.0x) | Medium green with slight texture variation. Most of the island. Standard terrain. |
| 8 | `HALFBUILDING` | Damaged Building | Impassable | Broken brick pattern with visible damage. Intermediate state: shot but not yet rubble. Still blocks movement. |
| 9 | `BOAT` | Moored Boat | Fast (1.0x) | Small brown platform on water. One hit destroys it. Players spawn on a boat in deep sea. Costs 5 trees to build. |
| 10 | `MINE_SWAMP` | Mine (on swamp) | 0.25x (detonates) | Renders as swamp. Invisible to enemies. |
| 11 | `MINE_CRATER` | Mine (on crater) | 0.25x (detonates) | Renders as crater. Invisible to enemies. |
| 12 | `MINE_ROAD` | Mine (on road) | 1.33x (detonates) | Renders as road. Invisible to enemies. |
| 13 | `MINE_FOREST` | Mine (on forest) | 0.50x (detonates) | Renders as forest. Invisible to enemies. |
| 14 | `MINE_RUBBLE` | Mine (on rubble) | 0.25x (detonates) | Renders as rubble. Invisible to enemies. |
| 15 | `MINE_GRASS` | Mine (on grass) | 1.0x (detonates) | Renders as grass. Invisible to enemies. |
| 0xFF | `DEEP_SEA` | Deep Sea | Instant death (no boat) | Dark blue with animated dark ripples. Immutable ocean border. Can't build on it. |

**Key design points from the source and the original Bolo manual:**

1. **Mines are terrain variants, not separate entities.** A mined grass tile is terrain type 15 (`MINE_GRASS`). Subtract 8 to get the visual base terrain (`MINE_GRASS - 8 = GRASS`). Mines render as their base terrain to enemies. The owning player and allies see a small mine marker overlay.

2. **HALFBUILDING is the intermediate destruction state.** Buildings have two-stage destruction: `BUILDING` → `HALFBUILDING` (damaged, still impassable) → `RUBBLE` (passable debris). This gives buildings meaningful toughness.

3. **Bridge is not a separate terrain type.** A bridge is a `ROAD` placed on a `RIVER` tile. The renderer detects this context and draws a bridge graphic. Boats cannot pass under bridges; they must be shot to destroy.

4. **There is no separate "wall" type.** Player-built walls are `BUILDING` (ID 0). Mechanically identical to map-placed buildings.

5. **DEEP_SEA (0xFF) vs. RIVER (1).** Rivers are navigable by boat, can be bridged, and damage ammo. Deep sea is immutable — instant death, can't build on it.

6. **Fog of war is a rendering overlay, not a terrain type.** The map always stores real terrain.

7. **Tank spawn is on a boat at sea.** Players enter the game on a `BOAT` tile in `DEEP_SEA`.

8. **Forest concealment is binary.** A tank is only hidden when completely enclosed — all 8 neighboring tiles must be forest.

9. **Water degrades ammunition.** Driving through river without a boat damages shells and mines over time, making moats a powerful defensive tool.

10. **Color scheme is red/green/black.** Original Bolo uses red = hostile, green = friendly, black turret = your own tank. Pillbox guns are red (hostile) or green (friendly). Bases use dotted pattern (neutral), green (friendly), red (hostile).

**Entities requiring graphics (not terrain types):**

| Entity | Visual States | Notes from manual |
|--------|--------------|-------------------|
| **Pillbox** | 5+ damage states (full → damaged → nearly dead → dead). Red guns = hostile, green = friendly. | "You can estimate how damaged it is from its appearance." Dead pillboxes passable, picked up by driving over. |
| **Refueling Base** | Neutral (dotted), friendly (green), hostile (red). Stock bars: shells/mines/armour. | Captured by driving over when undefended. |
| **Tank** | 16 rotational frames. Red turret = hostile, green = friendly, black = your own. | Explicitly described in manual. |
| **Engineer (LGM)** | Walking, parachuting (respawn), carrying materials. | "If the man gets shot...a new man will be parachuted in...this may take several minutes." |
| **Shell** | 16 rotational frames, small projectile. Range-controllable for mine clearing. | Manual describes targeting cursor for range control. |
| **Mine marker** | Small overlay on terrain tile, visible only to owner + allies. | "Your computer informs your allies' computers whenever you lay mines." |

**Corrected total visual asset count:**

Terrain tiles: 11 visual types × 16 auto-tile edge variants = 176, plus bridge variants (~16), plus animation frames for water/deep sea (~8) = **~200 terrain tiles**.

Entity sprites: Tank (16 rotations × 3 turret colors = 48), shell (16), engineer (~20), pillbox (~10 damage states), base (~6), explosion (~6), mine detonation (~6), splash (~4), mine marker (~2), parachute (~3) = **~120 entity frames**.

**Grand total: ~320 sprite frames** — a very manageable pixel art asset set.

### 3.3 Auto-Tiling (Bitmasking)

Raw Bolo maps store one terrain type per tile. But rendering a grass tile next to a water tile as two flat-colored squares looks terrible — you need transition tiles that show the grass-to-water edge with a natural shoreline pattern.

This is solved with **4-bit neighbor bitmasking** (also called auto-tiling), the same technique used by WinBolo's `screencalc.c` and by virtually every 2D tile game.

**How it works:**

For each tile being rendered, check its four cardinal neighbors (N, E, S, W). For each neighbor that is a *different* terrain type, set a bit:

```
North = bit 0 (value 1)
East  = bit 1 (value 2)
South = bit 2 (value 4)
West  = bit 3 (value 8)
```

This produces a value from 0 (all neighbors same) to 15 (all neighbors different), giving **16 edge variants per terrain type**. For a terrain like water, this means:

- **Value 0**: Water tile surrounded by more water → open water tile.
- **Value 1**: Different terrain to the north only → water with a north shore.
- **Value 5**: Different terrain to north and south → water channel running east-west.
- **Value 15**: Different terrain on all four sides → isolated water pool.

**8-bit extended bitmasking** (checking all 8 neighbors including diagonals) gives 48 usable tile variants, producing smoother corners. The original Bolo used simpler transitions; WinBolo used the 4-bit approach. We start with 4-bit (16 variants per terrain type) and can extend to 8-bit (48 variants) later for polish.

```javascript
// screencalc.js — auto-tile index calculator
function getTileVariant(map, x, y) {
  const thisTerrain = map.getTerrain(x, y);
  let bitmask = 0;

  // Check N, E, S, W neighbors
  if (isDifferentGroup(map, x, y - 1, thisTerrain)) bitmask |= 1;  // North
  if (isDifferentGroup(map, x + 1, y, thisTerrain)) bitmask |= 2;  // East
  if (isDifferentGroup(map, x, y + 1, thisTerrain)) bitmask |= 4;  // South
  if (isDifferentGroup(map, x - 1, y, thisTerrain)) bitmask |= 8;  // West

  return bitmask; // 0–15, index into the terrain's tile variant strip
}
```

### 3.4 The Tile Spritesheet

All terrain tile variants are packed into a single **spritesheet PNG** — one image file containing every tile variant for every terrain type, arranged in a grid.

**Spritesheet layout:**

```
Row 0:  Deep Water variants  [16 tiles × 16px = 256px wide]
Row 1:  Water variants       [16 tiles]
Row 2:  Swamp variants       [16 tiles]
Row 3:  Grass variants       [16 tiles]
Row 4:  Forest variants      [16 tiles]
Row 5:  Rubble variants      [16 tiles]
Row 6:  Road variants        [16 tiles]
Row 7:  Building variants    [16 tiles]
Row 8:  Halfbuilding variants [16 tiles]
Row 9:  Crater variants      [16 tiles]
Row 10: Boat variants        [16 tiles]
...
```

Each row contains 16 tiles (one per bitmask value), each 16×16 pixels. The full spritesheet is 256×N pixels, where N = (number of terrain types × 16 pixels).

**Rendering a tile:**

```javascript
function drawTile(ctx, terrainType, bitmaskValue, screenX, screenY, scale) {
  const srcX = bitmaskValue * TILE_SIZE;       // Column in spritesheet
  const srcY = terrainType * TILE_SIZE;        // Row in spritesheet
  const destSize = TILE_SIZE * scale;

  ctx.drawImage(
    tileSheet,
    srcX, srcY, TILE_SIZE, TILE_SIZE,          // Source rectangle
    screenX, screenY, destSize, destSize       // Destination rectangle
  );
}
```

This is the core of the renderer. Every frame, for every visible tile, we compute the bitmask, look up the source rectangle in the spritesheet, and draw it. At 900 tiles per frame, this is ~900 `drawImage()` calls — well within budget.

### 3.5 Terrain Rendering Optimization

Even though 900 draws per frame is fast, we can optimize:

- **Tile buffer**: Pre-render the visible terrain to an offscreen canvas. Only re-render tiles that have changed (dirty tile tracking from the server's delta updates). Most frames, zero terrain tiles change, so the terrain layer is a single `drawImage()` from the buffer.
- **Viewport culling**: Only compute and draw tiles within the visible viewport plus a 1-tile margin (for smooth scrolling). Tiles outside the viewport are never touched.
- **Spritesheet pre-loading**: Load the entire spritesheet as a single `Image` object on startup. All tile draws reference this one image — the browser caches it in GPU texture memory automatically.

---

## 4. Entity Sprites

### 4.1 Tanks

The tank is the most visually complex entity. It needs:

- **16 rotational frames** (0°, 22.5°, 45°, ... 337.5°). The original Bolo used exactly 16 directions. This gives the tank its characteristic "clicking" rotation feel.
- **Per-player coloring**: Each player's tank is tinted a unique color. The base sprite is drawn in a neutral tone, and color is applied per-player (see Section 6).
- **Sprite size**: 16×16 pixels at native resolution (fits within one tile). The tank is roughly tile-sized, consistent with the original.

```
Tank spritesheet: 16 frames × 16px = 256px wide, 16px tall
Frame 0: facing north (0°)
Frame 1: north-northeast (22.5°)
Frame 2: northeast (45°)
...
Frame 15: north-northwest (337.5°)
```

**During rendering**, the tank's rotation is quantized to the nearest of 16 directions. The appropriate frame is drawn at the tank's interpolated world position.

### 4.2 Shells (Projectiles)

Shells are small (4×4 to 8×8 pixels) projectile sprites. They move fast, so they're rendered at interpolated positions between ticks. They also use 16 rotational frames, though the visual difference between shell rotations is subtle — a small elongated dot.

The original Bolo rendered shells as simple 1–2 pixel dots. WinBolo added slightly larger shell sprites. We follow WinBolo's approach: small but visible.

### 4.3 The Engineer (LGM — Little Green Man)

A tiny figure (8×8 to 12×12 pixels) that walks between the tank and its destination. Needs:

- Walk animation: 2–4 frames.
- 4 or 8 directional facing.
- Visual state: carrying materials (small bundle), empty-handed, parachuting (after respawn).

### 4.4 Pillboxes

Pillbox sprites need:

- **Health states**: Full health → damaged → destroyed → empty (collected). 3–4 visual stages.
- **Team coloring**: Same system as tanks — base sprite tinted to owning player/team color.
- **Turret rotation**: Optional. The original had static pillbox sprites. WinBolo showed the turret direction. Either approach works; a rotating turret on a 16-direction system matches the game's feel.

### 4.5 Bases

Bases need:

- **Ownership coloring**: Neutral (gray), friendly (player's color), enemy (red or enemy color).
- **Resource state**: Full (bright), partially depleted (dimmer), empty/depleted (darkened).
- **Flag or marker** showing ownership — a small pennant or colored dot.

### 4.6 Explosions and Effects

- **Explosion**: 4–6 frame animation, played once when a shell hits something. Drawn at the impact position, fading over ~200ms.
- **Mine detonation**: Similar to explosion but with a distinct "blast" shape.
- **Tree falling**: When an engineer harvests a forest tile, a brief 2-frame animation of the tree disappearing.
- **Splash**: When something enters water — 2–3 frame splash effect.

All effects are overlay sprites drawn on top of the terrain and entity layers, then removed after their animation completes.

### 4.7 Entity Spritesheet

All entity sprites are packed into a second spritesheet (separate from terrain tiles):

```
entity-sprites.png layout:
  Row 0: Tank frames (16 rotation × 16px)
  Row 1: Shell frames (16 rotation × 8px, centered)
  Row 2: Engineer frames (walk animations × directions)
  Row 3: Pillbox states (health levels × rotation)
  Row 4: Base states (ownership × resource level)
  Row 5: Explosion animation frames
  Row 6: Mine detonation frames
  Row 7: Splash, tree fall, misc effects
```

---

## 5. The Viewport and Camera

### 5.1 Camera Behavior

The camera follows the player's tank, centered on it. The viewport scrolls smoothly as the tank moves — this is one of the places where interpolation between server ticks matters most. The camera position is interpolated at 60 FPS even though the tank position updates at 20 Hz, producing fluid scrolling.

```javascript
function updateCamera(prevTankPos, currTankPos, alpha) {
  // Interpolate camera position between last two known tank positions
  cameraX = prevTankPos.x + (currTankPos.x - prevTankPos.x) * alpha;
  cameraY = prevTankPos.y + (currTankPos.y - prevTankPos.y) * alpha;
}
```

### 5.2 Viewport Calculation

```javascript
function getVisibleTiles(cameraX, cameraY, canvasWidth, canvasHeight, scale) {
  const tileDisplaySize = TILE_SIZE * scale;
  const tilesX = Math.ceil(canvasWidth / tileDisplaySize) + 2;  // +2 for margin
  const tilesY = Math.ceil(canvasHeight / tileDisplaySize) + 2;

  const startTileX = Math.floor(cameraX / TILE_SIZE) - Math.floor(tilesX / 2);
  const startTileY = Math.floor(cameraY / TILE_SIZE) - Math.floor(tilesY / 2);

  return { startTileX, startTileY, tilesX, tilesY };
}
```

### 5.3 Sub-Tile Scrolling

Because the camera position is a floating-point world coordinate (not locked to tile boundaries), the terrain grid must be drawn with a sub-tile pixel offset:

```javascript
const offsetX = -(cameraX % TILE_SIZE) * scale;
const offsetY = -(cameraY % TILE_SIZE) * scale;

// When drawing each tile, add offsetX/Y to the screen position
// This produces smooth pixel-level scrolling, not tile-jumping
```

This is how the original Bolo achieved smooth scrolling despite a tile-based map.

---

## 6. Player Colors and the Skin System

### 6.1 Player Color Assignment

Each player (up to 16) is assigned a unique color from a predefined palette. The original Bolo used the 16-color Mac palette. WinBolo expanded this. WebBolo uses a 16-color palette optimized for distinguishability:

```javascript
const PLAYER_COLORS = [
  '#00FF00', // Player 0: Green (local player default)
  '#FF0000', // Player 1: Red
  '#0088FF', // Player 2: Blue
  '#FFFF00', // Player 3: Yellow
  '#FF8800', // Player 4: Orange
  '#FF00FF', // Player 5: Magenta
  '#00FFFF', // Player 6: Cyan
  '#FFFFFF', // Player 7: White
  '#FF4444', // Player 8: Light Red
  '#44FF44', // Player 9: Light Green
  '#4444FF', // Player 10: Light Blue
  '#FFAA00', // Player 11: Gold
  '#AA00FF', // Player 12: Purple
  '#00FFAA', // Player 13: Teal
  '#FF66AA', // Player 14: Pink
  '#AAAAAA', // Player 15: Gray
];
```

### 6.2 Sprite Tinting

Tank and pillbox sprites need to display in each player's color. Two approaches:

**Approach A: Pre-rendered colored variants (recommended for Phase 1)**

Generate all 16 color variants of the tank/pillbox sprites at load time by drawing the base sprite to an offscreen canvas and applying a color multiply or hue-shift. Store these as offscreen canvases indexed by player ID.

```javascript
function generateColoredSprites(baseSprite, color) {
  const offscreen = document.createElement('canvas');
  offscreen.width = baseSprite.width;
  offscreen.height = baseSprite.height;
  const octx = offscreen.getContext('2d');

  // Draw base sprite
  octx.drawImage(baseSprite, 0, 0);

  // Apply color multiply
  octx.globalCompositeOperation = 'multiply';
  octx.fillStyle = color;
  octx.fillRect(0, 0, offscreen.width, offscreen.height);

  // Restore alpha from original (multiply affects transparency)
  octx.globalCompositeOperation = 'destination-in';
  octx.drawImage(baseSprite, 0, 0);

  return offscreen;
}
```

This produces 16 pre-colored tank spritesheets at startup. Drawing a player's tank is then a single `drawImage()` from the correct sheet — no per-frame color processing.

**Approach B: Palette-indexed sprites (advanced, for skin system)**

Design sprites with specific "key colors" (e.g., bright magenta = team color, bright cyan = team secondary). At load time, replace key colors with the player's actual colors by iterating over `ImageData` pixels. This is how WinBolo's skin system works — skins are BMP files with specific color slots that get swapped per player.

### 6.3 The Skin System (Phase 4)

WinBolo supported player-created skins — complete replacement tilesets and entity sprites. WebBolo will support the same:

- A skin is a directory containing `terrain.png` (tile spritesheet), `entities.png` (entity spritesheet), and a `skin.json` manifest describing tile layout and color key positions.
- The default skin ships with the game. Players can load custom skins from a URL or local file.
- Skins only affect the rendering layer — the game logic is identical regardless of skin.
- Skins are loaded at startup and cached as offscreen canvases.

---

## 7. Fog of War Rendering

### 7.1 The Three Visibility States

Each tile exists in one of three states for each player:

1. **Visible**: Currently within the player's visibility radius. Rendered normally.
2. **Previously seen (shroud)**: Was visible at some point but is no longer. Terrain is rendered from the player's last-known state, overlaid with a dark semi-transparent tint. Entities are not shown.
3. **Unexplored (black fog)**: Never seen. Rendered as solid black.

### 7.2 Visibility Radius

The player's tank has a circular visibility radius of approximately **10–12 tiles** (configurable in constants). Allied tanks and pillboxes also provide visibility in their radius. The visibility calculation is server-authoritative — the server only sends entity data for things the player can see (see doc 03).

### 7.3 Rendering the Fog

The fog is rendered as an overlay layer on top of the terrain and entity layers:

```javascript
function drawFogOfWar(ctx) {
  const { startTileX, startTileY, tilesX, tilesY } = getVisibleTiles(...);

  for (let dy = 0; dy < tilesY; dy++) {
    for (let dx = 0; dx < tilesX; dx++) {
      const tileX = startTileX + dx;
      const tileY = startTileY + dy;
      const visibility = fogMap[tileY * MAP_WIDTH + tileX];

      if (visibility === FOG_UNEXPLORED) {
        // Solid black
        ctx.fillStyle = '#000000';
        ctx.fillRect(screenX, screenY, tileDisplaySize, tileDisplaySize);
      } else if (visibility === FOG_SHROUD) {
        // Semi-transparent dark overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(screenX, screenY, tileDisplaySize, tileDisplaySize);
      }
      // FOG_VISIBLE: no overlay, terrain renders normally
    }
  }
}
```

**Optimization**: The fog overlay can be pre-rendered to an offscreen canvas and only updated when the player's visibility changes. For smooth edges (instead of tile-aligned fog), we can use a radial gradient mask centered on the player's tank — but the tile-aligned approach is more faithful to the original.

---

## 8. The Minimap

### 8.1 Purpose

The original Mac Bolo had a separate "map overview" window showing the full 256×256 tile map at 1 pixel per tile. WinBolo lacked this. PyBolo reintroduced it. WebBolo includes a minimap as a permanent HUD element.

### 8.2 Rendering

The minimap renders the entire 256×256 map at **1 pixel per tile** on an offscreen canvas (256×256 pixels), then scales it down to fit the HUD area (e.g., 200×200 display pixels in a corner of the screen).

```javascript
const minimapCanvas = document.createElement('canvas');
minimapCanvas.width = MAP_WIDTH;   // 256
minimapCanvas.height = MAP_HEIGHT; // 256
const mmCtx = minimapCanvas.getContext('2d');

function updateMinimap(knownMap, entities) {
  const imageData = mmCtx.createImageData(MAP_WIDTH, MAP_HEIGHT);
  const data = imageData.data;

  for (let i = 0; i < MAP_WIDTH * MAP_HEIGHT; i++) {
    const terrain = knownMap[i];
    const color = MINIMAP_COLORS[terrain]; // Pre-defined RGB per terrain type
    const offset = i * 4;
    data[offset]     = color[0]; // R
    data[offset + 1] = color[1]; // G
    data[offset + 2] = color[2]; // B
    data[offset + 3] = 255;     // A
  }

  // Draw entity dots (tanks, pillboxes, bases) as colored pixels
  for (const entity of entities) {
    const offset = (entity.tileY * MAP_WIDTH + entity.tileX) * 4;
    const color = PLAYER_COLORS_RGB[entity.owner];
    data[offset]     = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
  }

  mmCtx.putImageData(imageData, 0, 0);
}
```

The minimap shows:
- Terrain colors (green = grass, blue = water, gray = road, dark green = forest, etc.)
- Player's tank as a bright dot in their color.
- Friendly tanks/pillboxes/bases as dots in ally colors.
- Enemy entities **only if within fog-of-war visibility** (the minimap respects fog).
- The current viewport as a white rectangle outline.

---

## 9. HUD Elements

The HUD displays critical game information overlaid on or alongside the game canvas:

| Element | Display | Position |
|---------|---------|----------|
| Armor bar | Numeric + bar (0–40) | Top-left |
| Shells count | Numeric + bar (0–40) | Below armor |
| Mines count | Numeric (0–40) | Below shells |
| Trees/wood count | Numeric | Below mines |
| Engineer status | Icon: in tank / working / parachuting / dead + timer | Below wood |
| Pillboxes carried | Numeric (0–?) | Below engineer |
| Minimap | 200×200 px map overview | Bottom-right |
| Chat/messages | Text overlay, fades after 5 seconds | Bottom-left |
| FPS counter | Optional debug display | Top-right |

The HUD is rendered after all game layers, either directly on the game canvas or as separate DOM elements overlaid on the canvas. DOM elements are easier to style and animate; canvas-drawn HUD is more performant. The recommended approach is canvas-drawn for the minimap and resource bars, DOM for chat text.

---

## 10. Asset Creation

### 10.1 Who Creates the Art?

This is an important question. There are three viable paths:

**Option A: Hand-drawn pixel art (recommended)**

A human artist (or the developer using pixel art tools) creates the terrain tileset and entity sprites by hand in a tool like Aseprite, Piskel, or even a basic image editor. This is the most authentic approach — the original Bolo graphics were hand-pixeled by Stuart Cheshire.

Advantages:
- Full creative control over the exact look and feel.
- Authentic to the original game's aesthetic.
- Pixel art at 16×16 is a manageable scope — the full terrain tileset is roughly 16 terrain types × 16 variants = 256 tiles.

Time estimate: An experienced pixel artist could complete the full terrain tileset in 2–3 days. Entity sprites (tank, engineer, pillbox, base, effects) in another 2–3 days. Total: about a week of dedicated art time.

**Option B: AI-assisted pixel art**

Use an AI image generation tool (Stable Diffusion, DALL-E, etc.) to generate initial tile concepts, then manually clean up and pixel-snap them to 16×16 grids. AI struggles with exact pixel-level precision, so significant manual cleanup is required. This works best for generating *ideas* (what should a swamp tile look like?) rather than production-ready sprites.

**Option C: Adapt WinBolo's graphics (legal considerations)**

WinBolo's source code is GPL v2, but its graphic files are explicitly noted as "copyright 1993 Stuart Cheshire." This means we **cannot** use WinBolo's actual sprites. However, we can study them as reference for color palettes, proportions, and tile layout — then create new sprites that evoke the same feel without copying pixel-for-pixel.

**Recommendation:** Option A, using WinBolo and original Bolo screenshots as reference. The total asset count is small enough that hand-pixeling is practical, and the result will have the most authentic feel.

### 10.2 Asset Pipeline

The creation workflow:

1. **Design in Aseprite** (or similar): Create each tile variant at 16×16 pixels. Use indexed color mode with a limited palette (16–32 colors) for consistency.

2. **Export as spritesheet**: Aseprite can export animation frames and tile grids as a single PNG spritesheet with a JSON manifest describing frame positions. This is our `terrain.png` and `entities.png`.

3. **Palette file**: Export the color palette as a separate file. This allows the skin system to remap colors.

4. **Auto-tile verification**: Run a simple visual test that renders every bitmask combination for every terrain type. Verify that all transitions look correct — no mismatched edges, no visual seams.

5. **Integration test**: Load the spritesheets in the game renderer and verify on a test map with all terrain types and transitions.

### 10.3 Specific Asset Requirements

**Terrain tileset** (`terrain.png`):
- 16 terrain types × 16 bitmask variants = 256 tiles.
- Size: 256×256 pixels (16 tiles wide × 16 tiles tall, each 16×16 px).
- Plus: 2–4 animation frames for water and lava (separate rows or adjacent columns).

**Entity spritesheet** (`entities.png`):
- Tank: 16 rotational frames, base color (will be tinted per-player). 256×16 px.
- Shell: 16 rotational frames at 8×8 px, centered in 16×16 cells. 256×16 px.
- Engineer: 4 walk frames × 4 directions = 16 frames. 256×16 px or 64×64 px grid.
- Pillbox: 4 health states × 16 rotations = 64 frames. Or simplified: 4 health states, no rotation.
- Base: 3 ownership states × 3 resource levels = 9 frames. 144×16 px.
- Explosions: 6 frames × 16×16 px = 96×16 px.
- Mine marker: 1–2 frames, 8×8 px centered in 16×16 cell.
- Parachute (engineer respawning): 3 frames, 16×16 px.

**Total unique sprite frames**: Approximately 350–400 individual 16×16 pixel tiles and sprites. This is a modest asset set by any standard.

### 10.4 Can I (Claude) Create the Sprites?

Not directly — I can't generate pixel-perfect bitmap images. But I can:

- **Design the spritesheet layout** and create specification documents with exact pixel coordinates for every tile and frame.
- **Generate SVG or Canvas-based placeholder sprites** that are geometrically correct (colored rectangles, simple shapes, directional arrows for tanks) for use during development until final pixel art is created.
- **Write the code** that generates procedural placeholder terrain (e.g., `ctx.fillStyle = '#228B22'; ctx.fillRect(...)` for grass) so development can proceed without waiting for art.
- **Create the auto-tile lookup tables** and bitmask-to-spritesheet-coordinate mappings.
- **Write the spritesheet loading and rendering code** that will work with any compliant spritesheet.

The recommended development approach: start with solid-color placeholder tiles (green = grass, blue = water, gray = road) generated procedurally in code, get the game playing well, then replace with hand-pixeled art before release.

---

## 11. Animation System

### 11.1 Frame-Based Animation

All animations use a simple frame counter. No tweening, no skeletal animation — just frame-by-frame sprite swapping, as was standard for this era of game.

```javascript
class SpriteAnimation {
  constructor(frames, frameDuration, loop = true) {
    this.frames = frames;         // Array of { srcX, srcY } in spritesheet
    this.frameDuration = frameDuration; // Milliseconds per frame
    this.loop = loop;
    this.currentFrame = 0;
    this.elapsed = 0;
    this.finished = false;
  }

  update(dt) {
    this.elapsed += dt;
    if (this.elapsed >= this.frameDuration) {
      this.elapsed -= this.frameDuration;
      this.currentFrame++;
      if (this.currentFrame >= this.frames.length) {
        if (this.loop) {
          this.currentFrame = 0;
        } else {
          this.currentFrame = this.frames.length - 1;
          this.finished = true;
        }
      }
    }
  }

  getCurrentFrame() {
    return this.frames[this.currentFrame];
  }
}
```

### 11.2 Animation Catalog

| Animation | Frames | Duration/Frame | Loop | Trigger |
|-----------|--------|---------------|------|---------|
| Water ripple | 2 | 500ms | Yes | Always (ambient) |
| Explosion | 6 | 50ms | No | Shell impact, mine detonation |
| Tree harvest | 3 | 200ms | No | Engineer harvesting forest |
| Engineer walk | 4 | 150ms | Yes | Engineer moving |
| Parachute descent | 3 | 300ms | Yes | Engineer respawning |
| Base capture | 4 | 100ms | No | Player claims base |
| Shell muzzle flash | 2 | 50ms | No | Tank fires |

---

## 12. Performance Budget

### 12.1 Target: 60 FPS on Modest Hardware

The renderer should maintain 60 FPS on a mid-range laptop (e.g., 2020 MacBook Air, Intel Chromebook). The per-frame budget at 60 FPS is 16.6ms.

**Estimated render costs per frame:**

| Operation | Draw Calls | Estimated Cost |
|-----------|-----------|---------------|
| Terrain tiles (from buffer) | 1 (buffered) | 0.5ms |
| Terrain buffer rebuild (when dirty) | ~900 | 3ms (amortized: ~0.1ms/frame) |
| Entity sprites | 20–60 | 0.5ms |
| Fog of war overlay | 1 (buffered) | 0.3ms |
| Minimap update | 1 putImageData | 0.5ms |
| HUD elements | 10–15 | 0.2ms |
| **Total estimated** | | **~2ms per frame** |

This leaves 14ms of headroom — more than enough for JavaScript game logic, input handling, and network message processing.

### 12.2 Memory Budget

| Asset | Size |
|-------|------|
| Terrain spritesheet (256×256 px PNG) | ~20 KB compressed, ~256 KB in GPU memory |
| Entity spritesheet (~512×128 px PNG) | ~15 KB compressed, ~256 KB in GPU memory |
| 16 pre-colored tank spritesheets | ~256 KB in GPU memory |
| Terrain buffer offscreen canvas | ~2 MB (1920×1080 × 4 bytes) |
| Fog buffer offscreen canvas | ~2 MB |
| Minimap offscreen canvas (256×256) | ~256 KB |
| **Total estimated** | **~5–6 MB** |

This is negligible for any modern device.

### 12.3 Performance Profiling

Don't guess — measure. The game should include built-in profiling from Phase 1A onward.

**What to measure every frame:**

```javascript
// In the render loop
const frameStart = performance.now();

// ... render ...

const frameTime = performance.now() - frameStart;
perfStats.frameTime.push(frameTime);
if (perfStats.frameTime.length > 300) perfStats.frameTime.shift(); // Rolling 5-second window

// Display in debug HUD (toggle with F3 or backtick key)
// - Frame time: current, avg, max (over last 5 sec)
// - Draw calls per frame
// - Entities rendered
// - Dirty tiles redrawn
// - Server tick processing time (from Web Worker / server)
```

**When to investigate:**
- Average frame time > 8ms (50% of budget consumed).
- Any frame > 16ms (dropped frame).
- Server tick time > 25ms (half of 50ms budget consumed).
- Memory growth over time (leak detection).

**How to investigate:**
- Chrome DevTools Performance tab: record 10 seconds of gameplay, look for long frames.
- `ctx.drawImage()` count per frame — if it exceeds 2000, consider additional buffering.
- The offscreen terrain buffer is the primary optimization. If terrain rendering is slow, ensure dirty-tile tracking is working (most frames should draw 0 terrain tiles from scratch).

**CI performance gate (Phase 2+):**
Run a headless 60-second simulation with 16 bots. Assert average tick time < 10ms. This prevents accidental performance regressions from merging.

---

## 13. Accessibility

### 13.1 Color-Blind Support

The default friend/foe color scheme (green = friendly, red = hostile) is indistinguishable for the ~8% of males with red-green color blindness. This is not optional polish — it affects whether a significant portion of players can play the game at all.

**Requirement: shape and pattern differentiation in addition to color.**

| Element | Default | Color-Blind Mode |
|---------|---------|-----------------|
| Friendly pillbox | Green turret | Green turret + circle marker |
| Hostile pillbox | Red turret | Red turret + diamond marker |
| Neutral pillbox | Gray turret | Gray turret + square marker |
| Friendly tank | Player's color | Player's color + friendly chevron overlay |
| Hostile tank | Enemy's color | Enemy's color + hostile X overlay |
| Own tank | Distinct turret | Distinct turret + no change needed |
| Friendly base | Green fill | Green fill + diagonal stripe pattern |
| Hostile base | Red fill | Red fill + crosshatch pattern |
| Friendly mines | Visible marker | Circle marker |
| Enemy mines | Hidden (gameplay) | Hidden (no change) |

**Implementation:** A "Color-Blind Friendly" toggle in settings. When enabled, entity sprites use an alternate spritesheet row that includes shape markers (chevrons, diamonds, Xs) overlaid on the base sprite. This is a rendering-only change — no gameplay logic is affected.

### 13.2 Other Accessibility Considerations

- **Keyboard-only play**: The game is already keyboard-primary. Ensure all menus and UI (lobby, chat, settings) are navigable by keyboard without requiring mouse clicks.
- **Screen shake**: Explosions may trigger screen shake. Provide a toggle to disable it (important for motion-sensitive players).
- **Text scaling**: HUD text and chat should respect a size setting. Default is readable at 1080p; ensure it's readable at 720p.
- **Audio cues with visual fallback**: Every gameplay-critical sound (low armor warning, incoming fire) should have a corresponding visual indicator (flashing HUD element, screen edge flash). Players who are deaf or play muted should not miss critical information.

---

## 14. Rendering Layer Order

The complete draw order, back to front:

```
1. Sky / background color (solid dark green or brown for "outside map" areas)
2. Terrain tiles (from offscreen buffer)
3. Terrain animations (water ripple overlay, aligned to water tiles)
4. Ground-level entities:
   a. Mines (friendly — drawn as small markers on the terrain)
   b. Craters (if they have special overlay effects)
5. Shadows (optional — simple dark ovals under tanks/pillboxes)
6. Engineer sprites (when outside tank)
7. Tank sprites (all visible tanks, interpolated positions)
8. Pillbox sprites
9. Base sprites
10. Shell sprites (projectiles in flight)
11. Effect animations (explosions, splashes, muzzle flashes)
12. Fog of war overlay
13. HUD layer (armor/shells/mines bars, minimap, chat)
14. UI overlay (menus, pause screen, debug info)
```

---

## 15. Summary: What Needs to Be Built

### Phase 1 deliverables (rendering):

1. Canvas setup with integer scaling and `imageSmoothingEnabled = false`.
2. Terrain renderer with auto-tiling (4-bit bitmasking).
3. Procedural placeholder tiles (solid colors) so gameplay development isn't blocked on art.
4. Tank sprite with 16 rotational frames (placeholder: colored triangle).
5. Shell sprite (placeholder: small dot).
6. Camera system with smooth sub-tile scrolling.
7. Basic HUD (armor, shells, mines as text/bars).

### Phase 1B deliverables (solo play rendering):

8. Fog of war overlay.
9. Minimap.
10. Explosion animations.
11. Engineer sprite and walk animation.
12. Pillbox and base sprites with ownership coloring.

### Phase 3 deliverables (multiplayer polish):

13. Player color tinting system.
14. All 16 player colors pre-rendered.
15. Chat text rendering.

### Phase 4 deliverables (polish):

16. Hand-pixeled terrain tileset replacing procedural placeholders.
17. Hand-pixeled entity sprites.
18. Skin system (load custom spritesheets).
19. 8-bit extended auto-tiling for smoother terrain transitions.
20. Animated water and ambient terrain effects.
