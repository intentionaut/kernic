const $ = (id) => document.getElementById(id);
const state = {
  name: "",
  vibeId: null,
  hue: 220,
  harmony: "analogous",
  tint: "match", // match | warm | cool | pure
  fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" },
  radiusStyle: "soft",
  ratio: 1.25,
  darkDefault: false,
  mode: "light",
  meta: null,
  ramps: null,
  semantic: null,
  semanticDark: null,
};

const TINT_HUES = { match: null, warm: 60, cool: 230, pure: "pure" };

function tintHue() {
  if (state.tint === "match") return state.hue;
  if (state.tint === "pure") return null;
  return TINT_HUES[state.tint];
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 1800);
}

function setStatus(msg, cls = "") {
  const s = $("status");
  s.textContent = msg;
  s.className = `status ${cls}`;
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

/* ---------- palette + preview ---------- */

async function refreshPalette() {
  $("hueVal").textContent = `${state.hue}°`;
  const payload = await api("/api/palette", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      primaryHue: state.hue,
      harmony: state.harmony,
      neutralTintHue: tintHue(),
    }),
  });
  state.ramps = payload.colors;
  state.semantic = payload.semantic;
  state.semanticDark = payload.semanticDark;
  renderRamps();
  renderPreview();
}

function renderRamps() {
  const host = $("ramps");
  host.innerHTML = "";
  for (const [name, ramp] of Object.entries(state.ramps)) {
    const row = document.createElement("div");
    row.className = "ramp-row";
    const label = document.createElement("span");
    label.className = "ramp-name";
    label.textContent = name;
    row.appendChild(label);
    for (const [stop, hex] of Object.entries(ramp)) {
      const sw = document.createElement("div");
      sw.className = "swatch";
      sw.style.background = hex;
      const lum = parseInt(hex.slice(1, 3), 16) * 0.2126 + parseInt(hex.slice(3, 5), 16) * 0.7152 + parseInt(hex.slice(5, 7), 16) * 0.0722;
      sw.style.color = lum > 150 ? "#000" : "#fff";
      sw.textContent = stop;
      sw.title = hex;
      sw.onclick = () => {
        navigator.clipboard?.writeText(hex);
        toast(`${hex} copied`);
      };
      row.appendChild(sw);
    }
    host.appendChild(row);
  }
}

function applyFont(family, linkId) {
  let link = document.getElementById(linkId);
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@400;500;600;700&display=swap`;
  if (!link) {
    link = document.createElement("link");
    link.rel = "stylesheet";
    link.id = linkId;
    document.head.appendChild(link);
  }
  link.href = url;
}

function scaleVars() {
  const names = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl"];
  const exps = [-1, -0.5, 0, 1, 2, 3, 5, 7, 9];
  return names.map((n, i) => [`--text-${n}`, (Math.pow(state.ratio, exps[i])).toFixed(3) + "rem"]);
}

function renderPreview() {
  const pv = $("preview");
  const sem = state.mode === "dark" ? state.semanticDark : state.semantic;
  const r = state.meta.radii[state.radiusStyle];
  const set = (k, v) => pv.style.setProperty(k, v);

  for (const [rampName, ramp] of Object.entries(state.ramps))
    for (const [stop, hex] of Object.entries(ramp))
      set(`--color-${rampName}-${stop}`, hex);

  set("--pv-background", sem.background);
  set("--pv-surface", sem.surface);
  set("--pv-text", sem.text);
  set("--pv-muted-text", sem.mutedText);
  set("--pv-border", sem.border);
  set("--semantic-ring", state.semantic.ring);
  set("--font-heading", `"${state.fonts.heading}", ui-serif, Georgia, serif`);
  set("--font-body", `"${state.fonts.body}", ui-sans-serif, system-ui, sans-serif`);
  set("--font-mono", `"${state.fonts.mono}", ui-monospace, monospace`);
  set("--radius-sm", r.sm);
  set("--radius-md", r.md);
  set("--radius-lg", r.lg);
  for (const [k, v] of scaleVars()) set(k, v);

  applyFont(state.fonts.heading, "gf-heading");
  applyFont(state.fonts.body, "gf-body");
  applyFont(state.fonts.mono, "gf-mono");

  document.querySelectorAll("#modeRow button").forEach((b) =>
    b.classList.toggle("on", b.dataset.mode === state.mode));
}

/* ---------- controls ---------- */

function renderVibes() {
  const host = $("vibes");
  host.innerHTML = "";
  for (const v of state.meta.vibes) {
    const chip = document.createElement("button");
    chip.className = "chip" + (state.vibeId === v.id ? " on" : "");
    chip.textContent = v.label;
    chip.onclick = () => applyVibe(v);
    host.appendChild(chip);
  }
}

function applyVibe(v) {
  state.vibeId = v.id;
  state.darkDefault = v.darkModeDefault;
  state.fonts = { ...v.fonts };
  state.radiusStyle = v.radius;
  state.ratio = v.typeRatio;
  state.hue = Math.round(hexToHue(v.primarySeed));
  syncControls();
  refreshPalette().then(renderVibes);
}

// approximate hue from hex via HSL (client-side display only)
function hexToHue(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255,
    g = parseInt(hex.slice(3, 5), 16) / 255,
    b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 220;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function renderRadiusRow() {
  const host = $("radiusRow");
  host.innerHTML = "";
  for (const key of Object.keys(state.meta.radii)) {
    const b = document.createElement("button");
    b.textContent = key[0].toUpperCase() + key.slice(1);
    b.classList.toggle("on", state.radiusStyle === key);
    b.onclick = () => { state.radiusStyle = key; renderRadiusRow(); renderPreview(); };
    host.appendChild(b);
  }
}

function syncControls() {
  $("sysname").value = state.name;
  $("hue").value = state.hue;
  $("harmony").value = state.harmony;
  $("fHeading").value = state.fonts.heading;
  $("fBody").value = state.fonts.body;
  $("fMono").value = state.fonts.mono;
  $("ratio").value = String(state.ratio);
  document.querySelectorAll("#tintRow button").forEach((b) =>
    b.classList.toggle("on", b.dataset.tint === state.tint));
  renderRadiusRow();
}

function buildSystemPayload() {
  return {
    schemaVersion: 1,
    name: state.name,
    vibe: state.vibeId ?? "custom",
    colors: state.ramps,
    semantic: state.semantic,
    fonts: state.fonts,
    radius: { style: state.radiusStyle, ...state.meta.radii[state.radiusStyle] },
    typeScale: { ratio: Number(state.ratio), baseRem: 1 },
    extensions: {
      seeds: {
        primarySeed: null,
        accentSeed: null,
        primaryHue: state.hue,
        harmony: state.harmony,
        neutralTintHue: tintHue(),
        darkDefault: state.darkDefault,
      },
    },
  };
}

async function save() {
  state.name = $("sysname").value.trim();
  if (!state.name) return setStatus("Name your system first", "err");
  try {
    const { name } = await api("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSystemPayload()),
    });
    state.name = name;
    setStatus(`Saved "${name}" ✓ — visible in \`kernic list\``, "ok");
    toast(`Saved "${name}"`);
  } catch (e) {
    setStatus(e.message, "err");
  }
}

/* ---------- init ---------- */

async function init() {
  state.meta = await api("/api/meta");

  const ratioSel = $("ratio");
  for (const r of state.meta.ratios) {
    const o = document.createElement("option");
    o.value = String(r);
    o.textContent = `${r} ${ratioLabel(r)}`;
    ratioSel.appendChild(o);
  }

  // font datalist
  try {
    const { results } = await api("/api/fonts?q=");
    const dl = $("fontList");
    for (const f of results) {
      const o = document.createElement("option");
      o.value = f.family;
      dl.appendChild(o);
    }
  } catch {}

  // load existing system from ?load=
  const params = new URLSearchParams(location.search);
  const loadName = params.get("load");
  if (loadName) {
    try {
      const { system, seeds } = await api(`/api/load/${encodeURIComponent(loadName)}`);
      state.name = system.name;
      state.vibeId = system.vibe;
      state.fonts = system.fonts;
      state.radiusStyle = system.radius.style;
      state.ratio = system.typeScale.ratio;
      state.hue = seeds.primaryHue ?? Math.round(hexToHue(system.colors.primary["600"]));
      state.harmony = seeds.harmony ?? "analogous";
      if (seeds.neutralTintHue === null || seeds.neutralTintHue === undefined) state.tint = "pure";
      else if (seeds.neutralTintHue === 60) state.tint = "warm";
      else if (seeds.neutralTintHue === 230) state.tint = "cool";
      else state.tint = "match";
      state.ramps = system.colors;
      state.semantic = system.semantic;
      const dark = {
        background: system.semantic.background.dark, surface: system.semantic.surface.dark,
        text: system.semantic.text.dark, mutedText: system.semantic.mutedText.dark,
        border: system.semantic.border.dark, ring: system.semantic.ring,
      };
      state.semanticDark = dark;
      renderRamps();
      renderPreview();
      syncControls();
      renderVibes();
      setStatus(`Editing "${system.name}"`, "");
      return;
    } catch (e) {
      setStatus(e.message, "err");
    }
  }

  // fresh session → corporate-clean defaults
  const vibe = state.meta.vibes.find((v) => v.id === "corporate-clean");
  state.name = "";
  applyVibe(vibe);
  renderVibes();
}

function ratioLabel(r) {
  return { 1.125: "(major second)", 1.2: "(minor third)", 1.25: "(major third)", 1.333: "(perfect fourth)", 1.414: "(augmented fourth)", 1.618: "(golden)" }[r] ?? "";
}

/* events */
$("hue").addEventListener("input", (e) => { state.hue = Number(e.target.value); refreshPalette(); });
$("harmony").addEventListener("change", (e) => { state.harmony = e.target.value; refreshPalette(); });
$("ratio").addEventListener("change", (e) => { state.ratio = Number(e.target.value); renderPreview(); });
$("randomize").onclick = () => { state.hue = Math.floor(Math.random() * 360); syncControls(); refreshPalette(); };
$("rerollAccent").onclick = async () => {
  const shifts = ["analogous", "complementary", "triadic"];
  state.harmony = shifts[Math.floor(Math.random() * shifts.length)];
  syncControls();
  refreshPalette();
};
document.querySelectorAll("#tintRow button").forEach((b) => {
  b.onclick = () => { state.tint = b.dataset.tint; syncControls(); refreshPalette(); };
});
for (const [id, key] of [["fHeading", "heading"], ["fBody", "body"], ["fMono", "mono"]]) {
  $(id).addEventListener("change", (e) => {
    const v = e.target.value.trim();
    if (!v) return;
    state.fonts[key] = v;
    renderPreview();
  });
}
document.querySelectorAll("#modeRow button").forEach((b) => {
  b.onclick = () => { state.mode = b.dataset.mode; renderPreview(); };
});
$("save").onclick = save;

init();
