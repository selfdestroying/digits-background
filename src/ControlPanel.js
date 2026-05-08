import { DEFAULT_OPTIONS, OPTION_CONSTRAINTS } from "./defaults.js";

/**
 * Description of every control rendered by the panel. Grouped into sections
 * so the UI can render collapsible groups.
 *
 * The schema is intentionally declarative – adding or removing a control is
 * a single entry in this array and does not require additional wiring.
 *
 * @typedef {"range" | "color" | "switch"} ControlKind
 *
 * @typedef {{
 *     id: string,
 *     kind: ControlKind,
 *     label: string,
 *     hint?: string,
 * }} ControlSchema
 *
 * @typedef {{
 *     id: string,
 *     title: string,
 *     controls: ControlSchema[],
 *     open?: boolean,
 *     variant?: "grid" | "stack",
 * }} SectionSchema
 */

/** @type {SectionSchema[]} */
export const DEFAULT_SCHEMA = [
    {
        id: "main",
        title: "Основное",
        open: true,
        variant: "stack",
        controls: [
            {
                id: "pointerInteraction",
                kind: "switch",
                label: "Реакция на мышь",
                hint: "включить управление курсором",
            },
            { id: "fontSize", kind: "range", label: "Размер" },
            { id: "sizeBoost", kind: "range", label: "Увеличение активных" },
            { id: "spacingBoost", kind: "range", label: "Расстояние активных" },
            { id: "startOpacity", kind: "range", label: "Начальная прозрачность" },
        ],
    },
    {
        id: "interaction",
        title: "Взаимодействие",
        variant: "grid",
        controls: [
            { id: "innerRadius", kind: "range", label: "Внутр. радиус" },
            { id: "outerRadius", kind: "range", label: "Внешн. радиус" },
            { id: "interactionSoftness", kind: "range", label: "Мягкость" },
            { id: "followSpeed", kind: "range", label: "Следование" },
            { id: "fadeInSpeed", kind: "range", label: "Появление" },
            { id: "fadeOutSpeed", kind: "range", label: "Затухание" },
        ],
    },
    {
        id: "chars",
        title: "Символы",
        variant: "grid",
        controls: [
            { id: "baseCharChangeChance", kind: "range", label: "Базовая смена" },
            { id: "activeCharChangeChance", kind: "range", label: "Активная смена" },
            { id: "charChangeSpeed", kind: "range", label: "Скорость шума" },
            { id: "charChangeInterval", kind: "range", label: "Интервал" },
        ],
    },
    {
        id: "color",
        title: "Цвет",
        variant: "grid",
        controls: [
            { id: "colorMin", kind: "color", label: "Начальный цвет" },
            { id: "colorMax", kind: "color", label: "Активный цвет" },
        ],
    },
    {
        id: "glow",
        title: "Свечение",
        variant: "stack",
        controls: [
            { id: "startGlow", kind: "range", label: "Начальное свечение" },
            { id: "glow", kind: "range", label: "Усиливание" },
            { id: "glowColorMin", kind: "color", label: "Начальный цвет" },
            { id: "glowColorMax", kind: "color", label: "Активный цвет" },
        ],
    },
    {
        id: "trail",
        title: "След",
        variant: "stack",
        controls: [
            { id: "motionBlur", kind: "range", label: "Motion blur" },
        ],
    },
];

/**
 * Format a numeric value for the value label. Uses at most 3 decimals for
 * values smaller than 1 and integer display otherwise.
 */
function formatValue(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return String(value);
    }
    if (Number.isInteger(value)) return String(value);
    const abs = Math.abs(value);
    if (abs >= 10) return value.toFixed(1);
    if (abs >= 1) return value.toFixed(2);
    return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function makeEl(tag, className, attrs) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
            if (v === undefined || v === null) continue;
            if (k === "text") el.textContent = String(v);
            else if (k in el) el[k] = v;
            else el.setAttribute(k, String(v));
        }
    }
    return el;
}

/**
 * A schema-driven control panel for a {@link DigitsBackground} instance.
 *
 * ```js
 * const panel = new ControlPanel(document.getElementById("panel"), bg);
 * // or with a custom schema:
 * new ControlPanel(host, bg, { schema: mySchema, onReset: () => ... });
 * ```
 */
export class ControlPanel {
    /**
     * @param {HTMLElement} host
     * @param {import("./DigitsBackground.js").DigitsBackground} background
     * @param {{
     *     schema?: SectionSchema[],
     *     constraints?: typeof OPTION_CONSTRAINTS,
     *     defaults?: typeof DEFAULT_OPTIONS,
     *     title?: string,
     *     subtitle?: string,
     *     status?: string,
     *     showReset?: boolean,
     *     showFps?: boolean,
     *     onReset?: () => void,
     * }} [options]
     */
    constructor(host, background, options = {}) {
        if (!host || typeof host !== "object") {
            throw new TypeError("ControlPanel: host element is required");
        }
        if (!background) {
            throw new TypeError("ControlPanel: background instance is required");
        }

        this.host = host;
        this.background = background;
        this.schema = options.schema || DEFAULT_SCHEMA;
        this.constraints = options.constraints || OPTION_CONSTRAINTS;
        this.defaults = options.defaults || DEFAULT_OPTIONS;
        this.showReset = options.showReset !== false;
        this.showFps = Boolean(options.showFps);
        this.onReset = options.onReset;

        this._elements = new Map(); // key -> { input, value }
        this._fpsEl = null;
        this._fpsTimer = 0;

        this._render({
            title: options.title || "Панель",
            subtitle:
                options.subtitle || "Настройки сгруппированы по задачам",
            status: options.status || "Live",
        });
        this._syncAll();

        if (this.showFps) this._startFpsTicker();
    }

    /** Destroy the panel, remove its DOM and stop the FPS ticker. */
    destroy() {
        if (this._fpsTimer) {
            clearInterval(this._fpsTimer);
            this._fpsTimer = 0;
        }
        this._elements.clear();
        this.host.innerHTML = "";
    }

    /** Refresh input values from the background options. */
    sync() {
        this._syncAll();
    }

    // ---------------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------------

    _render({ title, subtitle, status }) {
        const host = this.host;
        host.classList.add("dbg-panel");
        host.setAttribute("aria-label", "Digits background control panel");
        host.innerHTML = "";

        const header = makeEl("header", "dbg-panel__header");
        const titleWrap = makeEl("div", "dbg-panel__title");
        titleWrap.appendChild(makeEl("h2", null, { text: title }));
        if (subtitle) {
            titleWrap.appendChild(
                makeEl("p", "dbg-panel__subtitle", { text: subtitle }),
            );
        }
        header.appendChild(titleWrap);

        const headerActions = makeEl("div", "dbg-panel__actions");
        if (status) {
            headerActions.appendChild(
                makeEl("span", "dbg-panel__status", { text: status }),
            );
        }
        if (this.showReset) {
            const btn = makeEl("button", "dbg-panel__reset", {
                type: "button",
                text: "Сброс",
                title: "Сбросить настройки",
            });
            btn.addEventListener("click", () => this._handleReset());
            headerActions.appendChild(btn);
        }
        header.appendChild(headerActions);
        host.appendChild(header);

        if (this.showFps) {
            this._fpsEl = makeEl("div", "dbg-panel__fps", {
                text: "-- FPS",
                "aria-live": "polite",
            });
            host.appendChild(this._fpsEl);
        }

        const body = makeEl("div", "dbg-panel__body");
        for (const section of this.schema) {
            body.appendChild(this._renderSection(section));
        }
        host.appendChild(body);
    }

    _renderSection(section) {
        const details = makeEl("details", "dbg-section");
        if (section.open) details.open = true;

        const summary = makeEl("summary", "dbg-section__summary");
        summary.appendChild(
            makeEl("span", "dbg-section__title", { text: section.title }),
        );
        summary.appendChild(makeEl("span", "dbg-section__chevron"));
        details.appendChild(summary);

        const content = makeEl(
            "div",
            `dbg-section__content${
                section.variant === "grid" ? " dbg-section__content--grid" : ""
            }`,
        );
        for (const control of section.controls) {
            content.appendChild(this._renderControl(control));
        }
        details.appendChild(content);

        return details;
    }

    _renderControl(schema) {
        const control = makeEl(
            "div",
            `dbg-control dbg-control--${schema.kind}`,
        );
        if (schema.kind === "switch") {
            control.classList.add("dbg-control--switch");
        }

        const labelWrap = makeEl("label", "dbg-control__label");
        labelWrap.setAttribute("for", `dbg-${schema.id}`);

        const titleGroup = makeEl("span", "dbg-control__label-text");
        titleGroup.appendChild(makeEl("span", null, { text: schema.label }));
        if (schema.hint) {
            titleGroup.appendChild(
                makeEl("span", "dbg-control__hint", { text: schema.hint }),
            );
        }
        labelWrap.appendChild(titleGroup);

        const valueEl = makeEl("span", "dbg-control__value");
        if (schema.kind !== "switch") labelWrap.appendChild(valueEl);

        control.appendChild(labelWrap);

        let input;
        if (schema.kind === "range") {
            const c = this.constraints[schema.id] || {};
            input = makeEl("input", "dbg-control__range", {
                type: "range",
                id: `dbg-${schema.id}`,
                min: c.min ?? 0,
                max: c.max ?? 1,
                step: c.step ?? 0.01,
            });
        } else if (schema.kind === "color") {
            input = makeEl("input", "dbg-control__color", {
                type: "color",
                id: `dbg-${schema.id}`,
            });
        } else if (schema.kind === "switch") {
            input = makeEl("input", "dbg-control__switch", {
                type: "checkbox",
                id: `dbg-${schema.id}`,
                role: "switch",
            });
        } else {
            throw new RangeError(
                `ControlPanel: unknown control kind "${schema.kind}"`,
            );
        }

        this._bindInput(schema, input, valueEl);
        control.appendChild(input);

        return control;
    }

    _bindInput(schema, input, valueEl) {
        const key = schema.id;
        const bg = this.background;

        const write = (raw) => {
            if (schema.kind === "range") {
                const num = Number(raw);
                bg.setOption(key, num);
                valueEl.textContent = formatValue(num);
            } else if (schema.kind === "color") {
                bg.setOption(key, raw);
                valueEl.textContent = String(raw).toUpperCase();
            } else if (schema.kind === "switch") {
                bg.setOption(key, Boolean(raw));
            }
        };

        if (schema.kind === "switch") {
            input.addEventListener("change", (e) =>
                write(e.currentTarget.checked),
            );
        } else {
            input.addEventListener("input", (e) =>
                write(e.currentTarget.value),
            );
        }

        this._elements.set(key, { input, valueEl, kind: schema.kind });
    }

    _syncAll() {
        const opts = this.background.getOptions();
        for (const [key, { input, valueEl, kind }] of this._elements) {
            const value = opts[key];
            if (kind === "switch") {
                input.checked = Boolean(value);
            } else if (kind === "range") {
                input.value = String(value);
                if (valueEl) valueEl.textContent = formatValue(Number(value));
            } else if (kind === "color") {
                input.value = String(value);
                if (valueEl) valueEl.textContent = String(value).toUpperCase();
            }
        }
    }

    _handleReset() {
        this.background.resetOptions();
        this._syncAll();
        if (typeof this.onReset === "function") this.onReset();
    }

    _startFpsTicker() {
        this._fpsTimer = setInterval(() => {
            if (!this._fpsEl) return;
            const fps = this.background.getFps();
            this._fpsEl.textContent = fps > 0 ? `${fps} FPS` : "-- FPS";
        }, 500);
    }
}
