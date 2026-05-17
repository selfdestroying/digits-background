import { DEFAULT_OPTIONS, DEFAULT_ALPHABET } from "./defaults.js";
import { buildColorLUT, lookupColor } from "./color-utils.js";

/** Minimal opacity below which a cell is not drawn. */
const MIN_VISIBLE_ALPHA = 0.002;

/** Intensity below which glow is skipped entirely. */
const GLOW_INTENSITY_THRESHOLD = 0.02;

/** Size of the color LUT. 256 steps are indistinguishable by eye. */
const COLOR_LUT_SIZE = 256;

/** A target coordinate far outside the viewport – used to disable highlights. */
const OFFSCREEN_TARGET = -1e9;

/** Update the FPS counter this often. */
const FPS_SAMPLE_INTERVAL_MS = 500;

/**
 * An interactive grid of glyphs rendered on a `<canvas>`.
 *
 * Usage:
 *
 * ```js
 * import { DigitsBackground } from "./src/index.js";
 *
 * const bg = new DigitsBackground(document.getElementById("bg"), {
 *     pointerInteraction: true,
 *     colorMin: "#0a192f",
 *     colorMax: "#69b7ff",
 * });
 * ```
 */
export class DigitsBackground {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {Partial<import("./defaults.js").DigitsBackgroundOptions>} [options]
     */
    constructor(canvas, options = {}) {
        if (
            typeof HTMLCanvasElement !== "undefined" &&
            !(canvas instanceof HTMLCanvasElement)
        ) {
            throw new TypeError(
                "DigitsBackground: first argument must be an HTMLCanvasElement",
            );
        }

        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) {
            throw new Error("DigitsBackground: unable to get 2D context");
        }

        this.canvas = canvas;
        this.ctx = ctx;

        this.options = { ...DEFAULT_OPTIONS, ...options };

        // --- lifecycle flags
        this._running = false;
        this._destroyed = false;
        this._rafId = 0;
        this._listenersAttached = false;
        this._resizeScheduled = false;

        // --- grid geometry
        this._width = 0;
        this._height = 0;
        this._dpr = 1;
        this._columns = 0;
        this._rows = 0;
        this._cellCount = 0;

        // --- cell storage (parallel typed arrays for cache locality)
        this._charIndices = null; // Uint8Array
        this._opacity = null;     // Float32Array
        this._intensity = null;   // Float32Array
        this._centerX = null;     // Float32Array, precomputed cell center X
        this._centerY = null;     // Float32Array, precomputed cell center Y

        // --- pointer state
        this._mouseX = OFFSCREEN_TARGET;
        this._mouseY = OFFSCREEN_TARGET;
        this._targetMouseX = OFFSCREEN_TARGET;
        this._targetMouseY = OFFSCREEN_TARGET;

        // --- timing
        this._lastCharUpdateTime = 0;
        this._lastFpsTime = 0;
        this._fpsFrameCount = 0;
        this._currentFps = 0;

        // --- color lookup tables
        this._textColorLUT = null;
        this._glowColorLUT = null;

        // --- canvas state cache (avoid redundant property writes)
        this._curShadowBlur = 0;
        this._curShadowColor = "";
        this._curFillStyle = "";
        this._curFont = "";
        this._curFontSize = -1;
        this._curGlobalAlpha = -1;

        // --- bound handlers
        this._onResize = this._onResize.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerLeave = this._onPointerLeave.bind(this);
        this._onVisibilityChange = this._onVisibilityChange.bind(this);
        this._loop = this._loop.bind(this);

        this._rebuildColorLUTs();
        this._applyResize();
        this._attachListeners();

        if (this.options.autoStart) this.start();
    }

    // ---------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------

    /** Start the animation loop. */
    start() {
        if (this._destroyed) {
            throw new Error("DigitsBackground: instance has been destroyed");
        }
        if (this._running) return;
        this._running = true;
        this._lastFpsTime = 0;
        this._fpsFrameCount = 0;
        this._scheduleFrame();
    }

    /** Stop the animation loop. State is preserved. */
    stop() {
        if (!this._running) return;
        this._running = false;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = 0;
        }
    }

    /**
     * Stop the loop, detach all listeners, and release internal buffers.
     * The instance becomes unusable after this call.
     */
    destroy() {
        if (this._destroyed) return;
        this.stop();
        this._detachListeners();
        this._charIndices = null;
        this._opacity = null;
        this._intensity = null;
        this._centerX = null;
        this._centerY = null;
        this._textColorLUT = null;
        this._glowColorLUT = null;
        this._destroyed = true;
    }

    /** Force an immediate resize (normally handled automatically). */
    resize() {
        if (this._destroyed) return;
        this._applyResize();
    }

    /**
     * Replace one option. See {@link DigitsBackgroundOptions}.
     * @template {keyof import("./defaults.js").DigitsBackgroundOptions} K
     * @param {K} key
     * @param {import("./defaults.js").DigitsBackgroundOptions[K]} value
     */
    setOption(key, value) {
        this.setOptions({ [key]: value });
    }

    /**
     * Merge a partial options object.
     * @param {Partial<import("./defaults.js").DigitsBackgroundOptions>} patch
     */
    setOptions(patch) {
        if (!patch || typeof patch !== "object") return;

        let needsResize = false;
        let needsColorRebuild = false;
        let needsFontRefresh = false;
        let needsAlphabetRefresh = false;
        let pointerChanged = false;

        for (const key of Object.keys(patch)) {
            if (!(key in DEFAULT_OPTIONS)) continue;
            this.options[key] = patch[key];

            switch (key) {
                case "fontSize":
                case "cellSize":
                case "maxPixelRatio":
                    needsResize = true;
                    break;
                case "fontFamily":
                case "fontWeight":
                    needsFontRefresh = true;
                    break;
                case "colorMin":
                case "colorMax":
                case "glowColorMin":
                case "glowColorMax":
                    needsColorRebuild = true;
                    break;
                case "alphabet":
                    needsAlphabetRefresh = true;
                    break;
                case "pointerInteraction":
                    pointerChanged = true;
                    break;
                default:
                    break;
            }
        }

        if (needsColorRebuild) this._rebuildColorLUTs();
        if (needsFontRefresh) this._invalidateFontCache();
        if (needsResize) this._applyResize();
        if (needsAlphabetRefresh) this._clampCharIndices();
        if (pointerChanged) this._applyPointerMode();
    }

    /**
     * Replace all options, falling back to defaults for omitted keys.
     * @param {Partial<import("./defaults.js").DigitsBackgroundOptions>} options
     */
    resetOptions(options = {}) {
        this.setOptions({ ...DEFAULT_OPTIONS, ...options });
    }

    /**
     * Returns the current value of an option.
     * @template {keyof import("./defaults.js").DigitsBackgroundOptions} K
     * @param {K} key
     * @returns {import("./defaults.js").DigitsBackgroundOptions[K]}
     */
    getOption(key) {
        return this.options[key];
    }

    /** Returns a shallow copy of the current options. */
    getOptions() {
        return { ...this.options };
    }

    /** Latest measured FPS (updated twice per second). */
    getFps() {
        return this._currentFps;
    }

    /**
     * Manually feed a pointer position. Useful on touch devices or when the
     * canvas is not overlaying the entire viewport.
     * @param {number} x
     * @param {number} y
     */
    setPointerPosition(x, y) {
        if (!this.options.pointerInteraction) return;
        this._targetMouseX = x;
        this._targetMouseY = y;
    }

    // ---------------------------------------------------------------------
    // Event handling
    // ---------------------------------------------------------------------

    _attachListeners() {
        if (this._listenersAttached || typeof window === "undefined") return;

        if (this.options.autoResize) {
            window.addEventListener("resize", this._onResize, {
                passive: true,
            });
        }
        if (this.options.pauseWhenHidden) {
            document.addEventListener(
                "visibilitychange",
                this._onVisibilityChange,
            );
        }
        window.addEventListener("pointermove", this._onPointerMove, {
            passive: true,
        });
        window.addEventListener("pointerdown", this._onPointerMove, {
            passive: true,
        });
        document.addEventListener("pointerleave", this._onPointerLeave);

        this._listenersAttached = true;
    }

    _detachListeners() {
        if (!this._listenersAttached || typeof window === "undefined") return;
        window.removeEventListener("resize", this._onResize);
        document.removeEventListener(
            "visibilitychange",
            this._onVisibilityChange,
        );
        window.removeEventListener("pointermove", this._onPointerMove);
        window.removeEventListener("pointerdown", this._onPointerMove);
        document.removeEventListener("pointerleave", this._onPointerLeave);
        this._listenersAttached = false;
    }

    _onResize() {
        if (this._resizeScheduled) return;
        this._resizeScheduled = true;
        requestAnimationFrame(() => {
            this._resizeScheduled = false;
            this._applyResize();
        });
    }

    _onPointerMove(e) {
        if (!this.options.pointerInteraction) return;
        this._targetMouseX = e.clientX;
        this._targetMouseY = e.clientY;
        // If we were parked offscreen (e.g. just enabled interaction), snap
        // the pointer to the real position to avoid a visible sweep in.
        if (this._mouseX <= -1e6) {
            this._mouseX = e.clientX;
            this._mouseY = e.clientY;
        }
    }

    _onPointerLeave() {
        if (!this.options.pointerInteraction) return;
        this._targetMouseX = OFFSCREEN_TARGET;
        this._targetMouseY = OFFSCREEN_TARGET;
    }

    _onVisibilityChange() {
        if (document.hidden) {
            if (this._rafId) {
                cancelAnimationFrame(this._rafId);
                this._rafId = 0;
            }
        } else if (this._running && !this._rafId) {
            // Reset FPS baseline to avoid spikes after the pause.
            this._lastFpsTime = 0;
            this._fpsFrameCount = 0;
            this._scheduleFrame();
        }
    }

    _applyPointerMode() {
        if (!this.options.pointerInteraction) {
            // Park pointer offscreen so highlights fade out smoothly.
            this._targetMouseX = OFFSCREEN_TARGET;
            this._targetMouseY = OFFSCREEN_TARGET;
        }
        // When enabling, wait for the next real pointermove to update.
    }

    // ---------------------------------------------------------------------
    // Resize & allocation
    // ---------------------------------------------------------------------

    _applyResize() {
        const canvas = this.canvas;
        const ctx = this.ctx;

        let width;
        let height;
        if (typeof window !== "undefined") {
            width = window.innerWidth;
            height = window.innerHeight;
        } else {
            width = canvas.clientWidth || canvas.width || 1;
            height = canvas.clientHeight || canvas.height || 1;
        }

        this._width = width;
        this._height = height;

        const maxDpr = this.options.maxPixelRatio;
        const rawDpr =
            typeof window !== "undefined" && window.devicePixelRatio
                ? window.devicePixelRatio
                : 1;
        const dpr = Math.max(1, Math.min(rawDpr, maxDpr));
        this._dpr = dpr;

        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const fontSize = Math.max(1, this.options.fontSize);
        const cellSize = Math.max(
            1,
            this.options.cellSize > 0 ? this.options.cellSize : fontSize,
        );
        const columns = Math.max(1, Math.ceil(width / cellSize));
        const rows = Math.max(1, Math.ceil(height / cellSize));
        this._columns = columns;
        this._rows = rows;
        this._cellCount = columns * rows;

        this._allocateGrid();
        this._resetCanvasStateCache();
    }

    _allocateGrid() {
        const count = this._cellCount;

        if (!this._charIndices || this._charIndices.length !== count) {
            this._charIndices = new Uint8Array(count);
            this._opacity = new Float32Array(count);
            this._intensity = new Float32Array(count);
            this._centerX = new Float32Array(count);
            this._centerY = new Float32Array(count);

            const alphabet = this.options.alphabet || DEFAULT_ALPHABET;
            const alen = alphabet.length || 1;
            for (let i = 0; i < count; i++) {
                this._charIndices[i] = (Math.random() * alen) | 0;
            }
        }

        const fontSize = this.options.fontSize;
        const cellSize =
            this.options.cellSize > 0 ? this.options.cellSize : fontSize;
        const half = cellSize / 2;
        const columns = this._columns;
        const rows = this._rows;
        const centerX = this._centerX;
        const centerY = this._centerY;

        let i = 0;
        for (let y = 0; y < rows; y++) {
            const cy = y * cellSize + half;
            for (let x = 0; x < columns; x++) {
                centerX[i] = x * cellSize + half;
                centerY[i] = cy;
                i++;
            }
        }
    }

    _clampCharIndices() {
        const alphabet = this.options.alphabet || DEFAULT_ALPHABET;
        const alen = alphabet.length || 1;
        const chars = this._charIndices;
        if (!chars) return;
        for (let i = 0; i < chars.length; i++) {
            if (chars[i] >= alen) chars[i] = (Math.random() * alen) | 0;
        }
    }

    // ---------------------------------------------------------------------
    // Colors & canvas state
    // ---------------------------------------------------------------------

    _rebuildColorLUTs() {
        this._textColorLUT = buildColorLUT(
            this.options.colorMin,
            this.options.colorMax,
            COLOR_LUT_SIZE,
        );
        this._glowColorLUT = buildColorLUT(
            this.options.glowColorMin,
            this.options.glowColorMax,
            COLOR_LUT_SIZE,
        );
    }

    _invalidateFontCache() {
        this._curFont = "";
        this._curFontSize = -1;
    }

    _resetCanvasStateCache() {
        const ctx = this.ctx;
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        this._curShadowBlur = 0;
        this._curShadowColor = "";
        this._curFillStyle = "";
        this._curGlobalAlpha = -1;
        this._invalidateFontCache();
    }

    _applyShadow(color, blur) {
        const ctx = this.ctx;
        if (blur <= 0) {
            if (this._curShadowBlur !== 0) {
                ctx.shadowBlur = 0;
                this._curShadowBlur = 0;
            }
            return;
        }
        if (this._curShadowBlur !== blur) {
            ctx.shadowBlur = blur;
            this._curShadowBlur = blur;
        }
        if (this._curShadowColor !== color) {
            ctx.shadowColor = color;
            this._curShadowColor = color;
        }
    }

    _applyFont(fontSize) {
        if (fontSize === this._curFontSize) return;
        const fontStr = `${this.options.fontWeight} ${fontSize}px ${this.options.fontFamily}`;
        this.ctx.font = fontStr;
        this._curFont = fontStr;
        this._curFontSize = fontSize;
    }

    _applyFillStyle(color) {
        if (this._curFillStyle === color) return;
        this.ctx.fillStyle = color;
        this._curFillStyle = color;
    }

    _applyGlobalAlpha(alpha) {
        if (this._curGlobalAlpha === alpha) return;
        this.ctx.globalAlpha = alpha;
        this._curGlobalAlpha = alpha;
    }

    // ---------------------------------------------------------------------
    // Frame steps
    // ---------------------------------------------------------------------

    _clearFrame() {
        const ctx = this.ctx;
        const motionBlur = this.options.motionBlur;
        const clearAlpha = 1 - motionBlur;

        if (clearAlpha >= 1) {
            ctx.clearRect(0, 0, this._width, this._height);
            this._curGlobalAlpha = -1;
            this._curFillStyle = "";
            return;
        }
        if (clearAlpha <= 0) return;

        this._applyShadow("", 0);
        this._applyGlobalAlpha(1);
        this._applyFillStyle(`rgba(0,0,0,${clearAlpha})`);
        ctx.fillRect(0, 0, this._width, this._height);
    }

    _updatePointer() {
        const follow = this.options.followSpeed;
        this._mouseX += (this._targetMouseX - this._mouseX) * follow;
        this._mouseY += (this._targetMouseY - this._mouseY) * follow;
    }

    _updateCells() {
        const opts = this.options;
        const mouseX = this._mouseX;
        const mouseY = this._mouseY;
        const fontSize = opts.fontSize;
        const unit = opts.cellSize > 0 ? opts.cellSize : fontSize;
        const inner = opts.innerRadius * unit;
        const outer = opts.outerRadius * unit;
        const innerSq = inner * inner;
        const outerSq = outer * outer;
        const range = outer - inner;
        const invRange = range > 0 ? 1 / range : 0;
        const softness = opts.interactionSoftness;
        const fadeIn = opts.fadeInSpeed;
        const fadeOut = opts.fadeOutSpeed;

        const opacity = this._opacity;
        const intensity = this._intensity;
        const centerX = this._centerX;
        const centerY = this._centerY;
        const count = this._cellCount;

        for (let i = 0; i < count; i++) {
            const dx = mouseX - centerX[i];
            const dy = mouseY - centerY[i];
            const distSq = dx * dx + dy * dy;

            let target;
            if (distSq >= outerSq) {
                target = 0;
            } else if (distSq <= innerSq) {
                target = 1;
            } else {
                const dist = Math.sqrt(distSq);
                target = 1 - (dist - inner) * invRange;
            }

            // Shape falloff – avoid the expensive ** call when possible.
            if (target > 0 && target < 1 && softness !== 1) {
                if (softness === 2) target = target * target;
                else target = target ** softness;
            }

            const curO = opacity[i];
            const curI = intensity[i];
            const speedO = target > curO ? fadeIn : fadeOut;
            const speedI = target > curI ? fadeIn : fadeOut;

            opacity[i] = curO + (target - curO) * speedO;
            intensity[i] = curI + (target - curI) * speedI;
        }
    }

    _updateChars(timestamp) {
        if (
            timestamp - this._lastCharUpdateTime <
            this.options.charChangeInterval
        ) {
            return;
        }
        this._lastCharUpdateTime = timestamp;

        const opts = this.options;
        const alphabet = opts.alphabet || DEFAULT_ALPHABET;
        const alen = alphabet.length || 1;
        const base = opts.baseCharChangeChance;
        const active = opts.activeCharChangeChance;
        const speed = opts.charChangeSpeed;
        const intensity = this._intensity;
        const chars = this._charIndices;
        const count = this._cellCount;

        if (speed <= 0 || (base <= 0 && active <= 0)) return;

        for (let i = 0; i < count; i++) {
            const intSq = intensity[i] * intensity[i];
            const chance = (base + intSq * active) * speed;
            if (chance > 0 && Math.random() < chance) {
                chars[i] = (Math.random() * alen) | 0;
            }
        }
    }

    _drawCells() {
        const ctx = this.ctx;
        const opts = this.options;
        const alphabet = opts.alphabet || DEFAULT_ALPHABET;
        const fontSize = opts.fontSize;
        const sizeBoost = opts.sizeBoost;
        const spacingBoost = opts.spacingBoost;
        const startOpacity = opts.startOpacity;
        const startGlow = opts.startGlow;
        const glow = opts.glow;
        const mouseX = this._mouseX;
        const mouseY = this._mouseY;

        const opacity = this._opacity;
        const intensity = this._intensity;
        const centerX = this._centerX;
        const centerY = this._centerY;
        const chars = this._charIndices;
        const count = this._cellCount;
        const textLUT = this._textColorLUT;
        const glowLUT = this._glowColorLUT;

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let i = 0; i < count; i++) {
            const cellOpacity = opacity[i];
            const cellIntensity = intensity[i];
            const alpha = startOpacity + cellOpacity;

            if (alpha < MIN_VISIBLE_ALPHA) continue;

            const finalAlpha = alpha > 1 ? 1 : alpha;
            const fSize =
                sizeBoost === 0
                    ? fontSize
                    : (fontSize + cellIntensity * sizeBoost) | 0;

            const baseX = centerX[i];
            const baseY = centerY[i];
            let drawX = baseX;
            let drawY = baseY;

            if (spacingBoost !== 0 && cellIntensity > 0) {
                const dxm = baseX - mouseX;
                const dym = baseY - mouseY;
                const distSq = dxm * dxm + dym * dym;
                if (distSq > 0.0001) {
                    const invDist = 1 / Math.sqrt(distSq);
                    const offset = cellIntensity * spacingBoost;
                    drawX = baseX + dxm * invDist * offset;
                    drawY = baseY + dym * invDist * offset;
                }
            }

            let glowBlur = 0;
            if (cellIntensity >= GLOW_INTENSITY_THRESHOLD) {
                const g = startGlow + cellIntensity * glow;
                glowBlur = g > 0 ? (g + 0.5) | 0 : 0;
            }
            if (glowBlur > 0) {
                this._applyShadow(
                    lookupColor(glowLUT, cellIntensity),
                    glowBlur,
                );
            } else {
                this._applyShadow("", 0);
            }

            this._applyFillStyle(lookupColor(textLUT, cellIntensity));
            this._applyGlobalAlpha(finalAlpha);
            this._applyFont(fSize);

            ctx.fillText(alphabet[chars[i]] || "", drawX, drawY);
        }

        this._applyShadow("", 0);
    }

    _updateFps(timestamp) {
        this._fpsFrameCount++;
        if (this._lastFpsTime === 0) {
            this._lastFpsTime = timestamp;
            return;
        }
        const elapsed = timestamp - this._lastFpsTime;
        if (elapsed < FPS_SAMPLE_INTERVAL_MS) return;
        this._currentFps = Math.round((this._fpsFrameCount * 1000) / elapsed);
        this._fpsFrameCount = 0;
        this._lastFpsTime = timestamp;
    }

    _scheduleFrame() {
        this._rafId = requestAnimationFrame(this._loop);
    }

    _loop(timestamp) {
        this._rafId = 0;
        if (!this._running) return;

        this._updateFps(timestamp);
        this._updatePointer();
        this._updateCells();
        this._updateChars(timestamp);
        this._clearFrame();
        this._drawCells();

        this._scheduleFrame();
    }
}
