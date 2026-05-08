/**
 * Parse a hex color string (`#rgb`, `#rrggbb`) into an object with 0..255
 * `r`, `g`, `b` components.
 *
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }}
 */
export function hexToRgb(hex) {
    if (typeof hex !== "string") {
        throw new TypeError("hexToRgb: expected a string");
    }

    let value = hex.trim();
    if (value.startsWith("#")) value = value.slice(1);

    if (value.length === 3) {
        value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
    }

    if (!/^[0-9a-fA-F]{6}$/.test(value)) {
        throw new RangeError(`hexToRgb: invalid hex color "${hex}"`);
    }

    const n = Number.parseInt(value, 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/**
 * Build a lookup table of pre-composed `rgb(r,g,b)` strings that interpolate
 * from `minHex` to `maxHex` over `size` steps.
 *
 * Using a LUT avoids allocating color strings every frame per cell, which is
 * the single most impactful optimisation for rendering large grids.
 *
 * @param {string} minHex
 * @param {string} maxHex
 * @param {number} [size=256]
 * @returns {string[]}
 */
export function buildColorLUT(minHex, maxHex, size = 256) {
    const min = hexToRgb(minHex);
    const max = hexToRgb(maxHex);
    const lut = new Array(size);
    const last = size - 1;

    const dr = max.r - min.r;
    const dg = max.g - min.g;
    const db = max.b - min.b;

    for (let i = 0; i < size; i++) {
        const t = i / last;
        const r = (min.r + t * dr + 0.5) | 0;
        const g = (min.g + t * dg + 0.5) | 0;
        const b = (min.b + t * db + 0.5) | 0;
        lut[i] = `rgb(${r},${g},${b})`;
    }

    return lut;
}

/**
 * Look up a color string from a LUT using an intensity in the range [0, 1].
 *
 * @param {string[]} lut
 * @param {number} intensity
 * @returns {string}
 */
export function lookupColor(lut, intensity) {
    const last = lut.length - 1;
    let i = (intensity * last + 0.5) | 0;
    if (i < 0) i = 0;
    else if (i > last) i = last;
    return lut[i];
}
