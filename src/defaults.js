/**
 * Default alphabet used by the digits background.
 * You can override it via the `alphabet` option.
 */
export const DEFAULT_ALPHABET =
    "0123456789abcdefghijklmnopqrstuvwxyz!@?#%&*^";

/**
 * Every option the library supports together with its default value.
 * Use {@link OPTION_CONSTRAINTS} to validate/clamp user input.
 *
 * @typedef {Object} DigitsBackgroundOptions
 * @property {string} alphabet              Characters used in the grid.
 * @property {string} fontFamily            CSS font-family.
 * @property {string} fontWeight            CSS font-weight.
 * @property {number} fontSize              Base glyph size in CSS pixels.
 * @property {number} cellSize              Grid cell size in CSS pixels. 0 = follow fontSize.
 * @property {number} startOpacity          Baseline opacity for every cell.
 * @property {boolean} pointerInteraction   Enable pointer-driven highlights.
 * @property {number} innerRadius           Full-intensity radius, measured in font sizes.
 * @property {number} outerRadius           Zero-intensity radius, measured in font sizes.
 * @property {number} interactionSoftness   Exponent applied to the falloff curve.
 * @property {number} followSpeed           Pointer smoothing factor (0..1).
 * @property {number} fadeInSpeed           Highlight fade-in speed (0..1).
 * @property {number} fadeOutSpeed          Highlight fade-out speed (0..1).
 * @property {string} colorMin              Idle glyph color (hex).
 * @property {string} colorMax              Highlighted glyph color (hex).
 * @property {string} glowColorMin          Idle glow color (hex).
 * @property {string} glowColorMax          Highlighted glow color (hex).
 * @property {number} startGlow             Baseline glow blur in pixels.
 * @property {number} glow                  Additional glow applied by intensity.
 * @property {number} baseCharChangeChance  Idle probability of random glyph changes.
 * @property {number} activeCharChangeChance Extra probability at full intensity.
 * @property {number} charChangeSpeed       Overall multiplier for char changes.
 * @property {number} charChangeInterval    Minimum interval between char updates (ms).
 * @property {number} sizeBoost             Size added at full intensity.
 * @property {number} spacingBoost          Radial displacement at full intensity.
 * @property {number} motionBlur            Trail strength (0 = none, 1 = full persistence).
 * @property {number} maxPixelRatio         Upper bound for devicePixelRatio.
 * @property {boolean} autoResize           Track window resize events automatically.
 * @property {boolean} pauseWhenHidden      Pause the RAF loop when the tab is hidden.
 * @property {boolean} autoStart            Call `start()` from the constructor.
 */

/** @type {Readonly<DigitsBackgroundOptions>} */
export const DEFAULT_OPTIONS = Object.freeze({
    alphabet: DEFAULT_ALPHABET,
    fontFamily: "monospace",
    fontWeight: "normal",
    fontSize: 36,
    cellSize: 0,
    startOpacity: 0.2,

    pointerInteraction: false,
    innerRadius: 0,
    outerRadius: 10,
    interactionSoftness: 2,
    followSpeed: 0.15,

    fadeInSpeed: 0.25,
    fadeOutSpeed: 0.05,

    colorMin: "#ffffff",
    colorMax: "#ffffff",
    glowColorMin: "#ffffff",
    glowColorMax: "#ffffff",

    startGlow: 0,
    glow: 1,

    baseCharChangeChance: 0.005,
    activeCharChangeChance: 0.25,
    charChangeSpeed: 1,
    charChangeInterval: 33,

    sizeBoost: 20,
    spacingBoost: 10,
    motionBlur: 0,

    maxPixelRatio: 2,
    autoResize: true,
    pauseWhenHidden: true,
    autoStart: true,
});

/**
 * Soft constraints for numeric options. Consumed by the bundled
 * `ControlPanel` but also useful for external UIs and validation.
 */
export const OPTION_CONSTRAINTS = Object.freeze({
    fontSize: { min: 10, max: 100, step: 1 },
    cellSize: { min: 12, max: 120, step: 1 },
    startOpacity: { min: 0, max: 1, step: 0.01 },
    innerRadius: { min: 0, max: 100, step: 1 },
    outerRadius: { min: 1, max: 100, step: 1 },
    interactionSoftness: { min: 0.001, max: 10, step: 0.001 },
    followSpeed: { min: 0.01, max: 1, step: 0.01 },
    fadeInSpeed: { min: 0.01, max: 1, step: 0.01 },
    fadeOutSpeed: { min: 0.01, max: 1, step: 0.01 },
    startGlow: { min: 0, max: 30, step: 1 },
    glow: { min: 0, max: 30, step: 1 },
    baseCharChangeChance: { min: 0, max: 0.05, step: 0.001 },
    activeCharChangeChance: { min: 0, max: 1, step: 0.01 },
    charChangeSpeed: { min: 0, max: 3, step: 0.01 },
    charChangeInterval: { min: 16, max: 250, step: 1 },
    sizeBoost: { min: 0, max: 60, step: 1 },
    spacingBoost: { min: 0, max: 60, step: 1 },
    motionBlur: { min: 0, max: 0.99, step: 0.01 },
    maxPixelRatio: { min: 1, max: 3, step: 0.5 },
});
