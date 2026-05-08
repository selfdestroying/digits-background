import { DigitsBackground, ControlPanel } from "../src/index.js";

const canvas = document.getElementById("bg");
const panelHost = document.getElementById("panel");
const fpsEl = document.getElementById("fps-counter");

const background = new DigitsBackground(canvas, {
    pointerInteraction: false,
    colorMin: "#ffffff",
    colorMax: "#ffffff",
    glowColorMin: "#ffffff",
    glowColorMax: "#ffffff",
});

new ControlPanel(panelHost, background);

// External FPS indicator (kept outside the panel for a cleaner layout).
if (fpsEl) {
    setInterval(() => {
        const fps = background.getFps();
        fpsEl.textContent = fps > 0 ? `${fps} FPS` : "-- FPS";
    }, 500);
}

// Expose for debugging in the browser console.
if (typeof window !== "undefined") {
    window.__digitsBackground = background;
}
