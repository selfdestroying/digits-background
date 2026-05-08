# @selfdestroying/glyphs

Interactive, customizable animated grid of glyphs rendered on a single HTML5
`<canvas>`. Zero dependencies, zero build step, ships as plain ES modules
(~30 KB raw / ~8 KB gzipped for the core, ~43 KB / ~12 KB with the optional
control panel).

<p align="center">
    <img src="https://img.shields.io/badge/core-~8KB%20gzipped-4c8cff" alt="size" />
    <img src="https://img.shields.io/badge/deps-0-32c48d" alt="no dependencies" />
    <img src="https://img.shields.io/badge/license-MIT-f5a524" alt="license" />
</p>

<p align="center">
    <a href="https://selfdestroying.github.io/glyphs/"><strong>▶ Live demo</strong></a>
</p>

## Highlights

- **Fast.** Pre-computed color lookup tables, typed arrays for cell state,
  cached canvas state, invisible-cell culling, `pauseWhenHidden`.
- **Tiny.** Pure ES modules, no bundler required.
- **Configurable.** 25+ options for colors, interaction, glow, motion blur,
  noise, typography…
- **Interactive.** Optional pointer tracking with smooth follow, configurable
  falloff and animation shaping.
- **Accessible-friendly.** Honors `pauseWhenHidden`, degrades when the tab is
  inactive, supports `prefers-reduced-motion` in the demo stylesheet.
- **Control panel included.** Optional, schema-driven `ControlPanel` for quick
  prototyping.

---

## Install

```bash
npm install @selfdestroying/glyphs
# or
pnpm add @selfdestroying/glyphs
# or
yarn add @selfdestroying/glyphs
```

No build step is required — the package ships as native ES modules.

## Quick start

### 1. Drop the module into your page

```html
<canvas id="bg"></canvas>
<script type="module">
    import { DigitsBackground } from "@selfdestroying/glyphs";

    new DigitsBackground(document.getElementById("bg"), {
        pointerInteraction: true,
        colorMin: "#0a192f",
        colorMax: "#69b7ff",
        glow: 12,
    });
</script>
```

If you are not using a bundler and prefer to load the package straight from
a CDN, any npm CDN works:

```html
<script type="module">
    import { DigitsBackground } from "https://esm.sh/@selfdestroying/glyphs";
    // or: "https://cdn.jsdelivr.net/npm/@selfdestroying/glyphs/+esm"
</script>
```

### 2. Run the demo locally

The demo imports ES modules via relative paths. Browsers refuse to load
modules over the `file://` protocol — they require an HTTP(S) origin with a
proper `Content-Type`. Serve the folder over any static HTTP server:

```bash
npm run serve
# then open http://localhost:5173
```

Any static server works — `npx serve`, `python -m http.server`, VS Code's
Live Server extension, etc. The hosted demo on GitHub Pages works the same
way, just without the local step:

> https://selfdestroying.github.io/glyphs/

---

## API

### `new DigitsBackground(canvas, options?)`

Creates a new instance, sizes the canvas, and (by default) starts the
animation loop immediately.

#### Lifecycle

| Method       | Description                                               |
| ------------ | --------------------------------------------------------- |
| `start()`    | Start or resume the animation loop.                       |
| `stop()`     | Pause the loop. State is preserved.                       |
| `destroy()`  | Stop, detach listeners, release all buffers.              |
| `resize()`   | Re-measure the viewport and reallocate the grid.          |

#### Configuration

| Method                   | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `setOption(key, value)`  | Update a single option.                            |
| `setOptions(patch)`      | Merge a partial options object.                    |
| `resetOptions(patch?)`   | Reset all options to defaults, then apply `patch`. |
| `getOption(key)`         | Read a single option.                              |
| `getOptions()`           | Shallow copy of the full options object.           |
| `setPointerPosition(x,y)`| Feed a manual pointer position (touch / overlay).  |

#### Info

| Method    | Description                                   |
| --------- | --------------------------------------------- |
| `getFps()`| Last sampled FPS (updated twice per second).  |

### Options

Every option has a sensible default (see [`src/defaults.js`](./src/defaults.js)).

| Option                    | Type      | Default    | Notes                                                           |
| ------------------------- | --------- | ---------- | --------------------------------------------------------------- |
| `alphabet`                | `string`  | `0..9a..z…`| Characters drawn in the grid.                                   |
| `fontFamily`              | `string`  | `monospace`| Any CSS font-family.                                            |
| `fontWeight`              | `string`  | `normal`   | Any CSS font-weight.                                            |
| `fontSize`                | `number`  | `36`       | Base glyph size in CSS pixels.                                  |
| `startOpacity`            | `number`  | `0.2`      | Baseline opacity for every cell.                                |
| `pointerInteraction`      | `boolean` | `false`    | Respond to pointer movement.                                    |
| `innerRadius`             | `number`  | `0`        | Full-intensity radius, **in font sizes**.                       |
| `outerRadius`             | `number`  | `10`       | Zero-intensity radius, **in font sizes**.                       |
| `interactionSoftness`     | `number`  | `2`        | Exponent of the falloff curve (1 = linear).                     |
| `followSpeed`             | `number`  | `0.15`     | Pointer smoothing (0..1).                                       |
| `fadeInSpeed`             | `number`  | `0.25`     | Highlight fade-in speed (0..1).                                 |
| `fadeOutSpeed`            | `number`  | `0.05`     | Highlight fade-out speed (0..1).                                |
| `colorMin` / `colorMax`   | `string`  | `#ffffff`  | Glyph color at intensity 0 / 1 (hex).                           |
| `glowColorMin/Max`        | `string`  | `#ffffff`  | Glow color at intensity 0 / 1 (hex).                            |
| `startGlow` / `glow`      | `number`  | `0` / `1`  | Baseline glow + extra glow multiplied by intensity.             |
| `baseCharChangeChance`    | `number`  | `0.005`    | Idle probability of a random glyph change per tick.             |
| `activeCharChangeChance`  | `number`  | `0.25`     | Extra probability scaled by intensity².                         |
| `charChangeSpeed`         | `number`  | `1`        | Global multiplier for glyph changes.                            |
| `charChangeInterval`      | `number`  | `33`       | Minimum interval between char update ticks (ms).                |
| `sizeBoost`               | `number`  | `20`       | Pixel-size added at full intensity.                             |
| `spacingBoost`            | `number`  | `10`       | Radial displacement at full intensity.                          |
| `motionBlur`              | `number`  | `0`        | Trail strength (0 = hard clear, 0.99 = long trail).             |
| `maxPixelRatio`           | `number`  | `2`        | Cap for `devicePixelRatio` (perf safeguard).                    |
| `autoResize`              | `boolean` | `true`     | Listen for `window.resize`.                                     |
| `pauseWhenHidden`         | `boolean` | `true`     | Stop RAF when `document.hidden === true`.                       |
| `autoStart`               | `boolean` | `true`     | Start the loop from the constructor.                            |

### `new ControlPanel(host, background, options?)`

An optional, schema-driven settings panel. See
[`src/ControlPanel.js`](./src/ControlPanel.js) for the schema format.

```js
import { DigitsBackground, ControlPanel } from "./src/index.js";

const bg = new DigitsBackground(canvas);
new ControlPanel(document.getElementById("panel"), bg, {
    showReset: true,
    showFps: false,
});
```

---

## Design notes

- **Typed arrays.** Cell state (`opacity`, `intensity`, `charIndex`, center
  positions) is stored in parallel `Float32Array` / `Uint8Array` buffers for
  cache-friendly iteration and zero per-cell allocations.
- **Color LUTs.** Text and glow colors are precomputed into 256-entry
  `rgb(...)` string tables and rebuilt only when color options change.
- **Canvas state cache.** `ctx.font`, `ctx.fillStyle`, `ctx.globalAlpha`,
  `ctx.shadowColor`, and `ctx.shadowBlur` are only written when they change
  — `ctx.font` in particular parses a CSS string on every assignment.
- **Squared-distance culling.** Cells beyond `outerRadius` skip `Math.sqrt`
  entirely and their draw pass is skipped when `startOpacity + opacity`
  falls below the visibility threshold.
- **Debounced resize.** `resize` events are collapsed into a single RAF.
- **Pause on hidden tab.** Stops both char updates and RAF scheduling when
  the page is hidden.

## Browser support

Any evergreen browser that supports ES modules, typed arrays, and `canvas`
2D context (Chrome/Edge 63+, Firefox 60+, Safari 11+). Mobile Safari 15+ is
recommended for the backdrop-filter demo styling.

## License

MIT © see [`LICENSE`](./LICENSE).
