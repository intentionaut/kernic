const $ = (id) => document.getElementById(id);
const state = {
  name: "",
  vibeId: null,
  baseSeed: "#2563eb",
  accentSeed: null,
  accentExact: true,
  hue: 220,
  harmony: "analogous",
  tint: "match", // match | warm | cool | pure
  fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" },
  radiusStyle: "soft",
  ratio: 1.25,
  darkDefault: false,
  mode: "light",
  chromaScale: null,
  lRange: null,
  meta: null,
  looks: [],
  activeLookId: null,
  ramps: null,
  gradients: null,
  /** Raw nested {light,dark} semantics — exactly what gets saved to JSON. */
  semanticRaw: null,
};

/** Flatten nested {light,dark} semantic maps for the active preview mode. */
function pickMode(sem, mode) {
  const out = {};
  if (!sem) return out;
  for (const k of ["background", "surface", "text", "mutedText", "border", "ring"]) {
    const v = sem[k];
    out[k] = typeof v === "string" ? v : v?.[mode];
  }
  return out;
}

function tintHue() {
  if (state.tint === "match") return state.hue;
  if (state.tint === "pure") return null;
  if (state.tint === "warm") return 60;
  return 230; // cool
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

/** Monotonic request id — a slow /api/palette reply must never clobber a newer one. */
let paletteSeq = 0;
let palettePending = false;
let paletteInFlight = false;
let paletteLastRun = 0;
let palettePumpTimer = null;
const PALETTE_MIN_MS = 80;

/**
 * Coalescing entry point for continuous controls (the hue slider fires ~60×/s).
 * At most one request is in flight and at most one starts per PALETTE_MIN_MS,
 * and a trailing run always happens so the final slider position is the one shown.
 */
function schedulePaletteRefresh() {
  palettePending = true;
  pumpPalette();
}

function pumpPalette() {
  if (paletteInFlight || !palettePending) return;
  const wait = PALETTE_MIN_MS - (Date.now() - paletteLastRun);
  if (wait > 0) {
    clearTimeout(palettePumpTimer);
    palettePumpTimer = setTimeout(pumpPalette, wait);
    return;
  }
  palettePending = false;
  paletteInFlight = true;
  paletteLastRun = Date.now();
  refreshPalette()
    .catch((e) => setStatus(e.message, "err"))
    .finally(() => { paletteInFlight = false; pumpPalette(); });
}

async function refreshPalette() {
  $("hueVal").textContent = `${state.hue}°`;
  const seq = ++paletteSeq;
  const payload = { harmony: state.harmony, neutralTintHue: tintHue() };
  if (state.chromaScale != null) payload.chromaScale = state.chromaScale;
  if (state.lRange) payload.lRange = state.lRange;
  if (state.accentExact) {
    payload.primarySeed = state.baseSeed;
    payload.accentSeed = state.accentSeed ?? undefined;
  } else {
    payload.baseSeed = state.baseSeed;
    payload.targetHue = state.hue;
  }
  payload.motion = (state.meta?.vibes ?? []).find((v) => v.id === state.vibeId)?.motion;
  const result = await api("/api/palette", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (seq !== paletteSeq) return; // a newer request already answered — drop this one
  state.ramps = result.colors;
  state.semanticRaw = result.semantic;
  state.gradients = result.gradients;
  state.shadows = result.shadows ?? null;
  state.motion = result.motion ?? null;
  renderRamps();
  renderPreview();
  updateContrastIndicator();
}

/** Structural signature of the ramp set — when it is unchanged we repaint in place. */
let rampsSig = "";

function buildRampRows(entries) {
  const host = $("ramps");
  host.innerHTML = "";
  for (const [name, ramp] of entries) {
    const row = document.createElement("div");
    row.className = "ramp-row";
    const label = document.createElement("span");
    label.className = "ramp-name";
    label.textContent = name;
    row.appendChild(label);
    for (const stop of Object.keys(ramp)) {
      const sw = document.createElement("div");
      sw.className = "swatch";
      sw.textContent = stop;
      row.appendChild(sw);
    }
    host.appendChild(row);
  }
}

function renderRamps() {
  const host = $("ramps");
  const entries = Object.entries(state.ramps);
  const sig = entries.map(([n, r]) => `${n}:${Object.keys(r).join(",")}`).join("|");
  if (sig !== rampsSig) {
    buildRampRows(entries);
    rampsSig = sig;
  }
  entries.forEach(([, ramp], ri) => {
    const row = host.children[ri];
    Object.values(ramp).forEach((hex, si) => {
      const sw = row.children[si + 1]; // child 0 is the ramp name
      if (!sw || sw.dataset.hex === hex) return;
      sw.dataset.hex = hex;
      sw.style.background = hex;
      const lum = parseInt(hex.slice(1, 3), 16) * 0.2126 + parseInt(hex.slice(3, 5), 16) * 0.7152 + parseInt(hex.slice(5, 7), 16) * 0.0722;
      sw.style.color = lum > 150 ? "#000" : "#fff";
      sw.title = hex;
    });
  });
}

/* ---------- google fonts: safe names, safe URLs, deduplicated loading ---------- */

/**
 * Allowlist for family names. Everything that reaches a Google Fonts URL or a CSS
 * custom property passes through here, so quotes, semicolons, backslashes and
 * angle brackets can never get into either.
 */
const SAFE_FAMILY = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/;

function isSafeFamily(family) {
  return typeof family === "string" && SAFE_FAMILY.test(family.trim());
}

const FONT_FALLBACK = {
  heading: "ui-serif, Georgia, serif",
  body: "ui-sans-serif, system-ui, sans-serif",
  mono: "ui-monospace, monospace",
};

/** A font stack that is always safe to interpolate into CSS. */
function fontStack(family, fallback) {
  return isSafeFamily(family) ? `"${family.trim()}", ${fallback}` : fallback;
}

/** Generic face standing in for a catalog category until its webfont arrives. */
function categoryGeneric(category) {
  const c = String(category ?? "").toLowerCase().replace(/\s+/g, "-");
  if (c === "serif") return "serif";
  if (c === "monospace") return "ui-monospace, monospace";
  if (c === "handwriting") return "cursive";
  return "ui-sans-serif, sans-serif";
}

function fontCssUrl(family, extra) {
  const name = family.trim().split(/ +/).map(encodeURIComponent).join("+");
  return `https://fonts.googleapis.com/css2?family=${name}${extra}&display=swap`;
}

/** family -> <link>. Full weights, kept for the session. */
const loadedFaces = new Map();
/** family -> <link>. Name-only subset used to render dropdown rows in their own face. */
const previewFaces = new Map();

/** Idempotent: a family is only ever requested once, however many callers ask. */
function loadFontFace(family) {
  if (!isSafeFamily(family)) return;
  const name = family.trim();
  if (loadedFaces.has(name)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.dataset.font = name;
  link.href = fontCssUrl(name, ":wght@400;500;600;700");
  document.head.appendChild(link);
  loadedFaces.set(name, link);
  const subset = previewFaces.get(name); // the full face supersedes the subset
  if (subset) {
    subset.remove();
    previewFaces.delete(name);
  }
}

/**
 * Dropdown rows show their own typeface, but a webfont per row is the exact trap
 * that made init slow. These requests are subsetted to the family name's own
 * characters, only fire for rows actually on screen, and are dropped again as
 * soon as those rows go away.
 */
function loadPreviewFace(family) {
  if (!isSafeFamily(family)) return;
  const name = family.trim();
  if (loadedFaces.has(name) || previewFaces.has(name)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.dataset.fontPreview = name;
  link.href = fontCssUrl(name, `&text=${encodeURIComponent(name)}`);
  document.head.appendChild(link);
  previewFaces.set(name, link);
}

function releasePreviewFaces(keep) {
  for (const [name, link] of previewFaces) {
    if (keep.has(name)) continue;
    link.remove();
    previewFaces.delete(name);
  }
}

function scaleVars() {
  const names = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl"];
  const exps = [-1, -0.5, 0, 1, 2, 3, 5, 7, 9];
  return names.map((n, i) => [`--text-${n}`, Math.pow(state.ratio, exps[i]).toFixed(3) + "rem"]);
}

/** One <style> element holds every preview token, so a repaint is a single write. */
let pvStyleEl = null;
let pvStyleText = "";

function previewStyle() {
  if (!pvStyleEl) {
    pvStyleEl = document.createElement("style");
    pvStyleEl.id = "pvVars";
    document.head.appendChild(pvStyleEl);
  }
  return pvStyleEl;
}

function renderPreview() {
  const pv = $("preview");
  pv.dataset.vibe = state.vibeId ?? "custom";
  const sem = pickMode(state.semanticRaw, state.mode);
  const inv = pickMode(state.semanticRaw, state.mode === "light" ? "dark" : "light");
  const r = state.meta.radii[state.radiusStyle];
  const decl = [];
  const set = (k, v) => {
    if (v == null) return;
    const s = String(v);
    if (s.includes("}") || s.includes("<")) return; // never let a value escape the rule
    decl.push(`${k}:${s}`);
  };

  for (const [rampName, ramp] of Object.entries(state.ramps))
    for (const [stop, hex] of Object.entries(ramp))
      set(`--color-${rampName}-${stop}`, hex);

  const grads = state.gradients ?? {};
  set("--gradient-primary", grads.primary ?? "none");
  set("--gradient-mesh", grads.mesh ?? "none");
  set("--gradient-text", grads.text ?? "none");

  set("--pv-background", sem.background);
  set("--pv-surface", sem.surface);
  set("--pv-text", sem.text);
  set("--pv-muted-text", sem.mutedText);
  set("--pv-border", sem.border);
  set("--semantic-ring", sem.ring);
  set("--pv-inverse-bg", inv.background);
  set("--pv-inverse-text", inv.text);
  set("--pv-inverse-muted", inv.mutedText);
  set("--font-heading", fontStack(state.fonts.heading, FONT_FALLBACK.heading));
  set("--font-body", fontStack(state.fonts.body, FONT_FALLBACK.body));
  set("--font-mono", fontStack(state.fonts.mono, FONT_FALLBACK.mono));
  set("--radius-sm", r.sm);
  set("--radius-md", r.md);
  set("--radius-lg", r.lg);
  for (const [k, v] of scaleVars()) set(k, v);
  const shadows = state.shadows?.[state.mode] ?? {};
  for (const [level, value] of Object.entries(shadows)) set(`--shadow-${level}`, value);
  if (state.motion) {
    for (const [k, v] of Object.entries(state.motion.duration ?? {})) set(`--duration-${k}`, v);
    set("--ease-out", state.motion.ease?.out);
    set("--ease-in-out", state.motion.ease?.inOut);
    set("--ease-emphasized", state.motion.ease?.emphasized);
  }

  const text = `#preview{${decl.join(";")}}`;
  if (text !== pvStyleText) {
    previewStyle().textContent = text;
    pvStyleText = text;
  }

  loadFontFace(state.fonts.heading);
  loadFontFace(state.fonts.body);
  loadFontFace(state.fonts.mono);

  document.querySelectorAll("#modeRow button").forEach((b) =>
    b.classList.toggle("on", b.dataset.mode === state.mode));
}

/* ---------- preview content: per-vibe section builders ---------- */

/** Copy arrives from /api/meta (src/studio/copy.ts) and is interpolated into
    innerHTML, so escape it rather than trusting the shape of a stored system. */
function esc(v) {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function buildNavSection(copy) {
  const links = (copy.links ?? []).map((l) => `<a>${esc(l)}</a>`).join("");
  return `<nav class="pv-nav"><span class="pv-brand">${esc(copy.brand)}</span><span class="pv-links">${links}</span><button class="pv-btn pv-primary pv-sm">${esc(copy.navCta)}</button></nav>`;
}

function buildHeroSection(copy) {
  return `<section class="pv-hero"><h1 class="pv-h1">${esc(copy.h1)}<span class="pv-grad-word">${esc(copy.h1Accent)}</span></h1><p class="pv-sub">${esc(copy.sub)}</p><div class="pv-row"><button class="pv-btn pv-primary">${esc(copy.primaryCta)}</button><button class="pv-btn pv-ghost">${esc(copy.ghostCta)}</button></div></section>`;
}

function buildStatsSection() {
  const stats = [
    { num: "99.98%", cap: "uptime SLA" },
    { num: "12k", cap: "teams shipping" },
    { num: "4.9\u2605", cap: "avg. rating" },
    { num: "38ms", cap: "median latency" },
  ];
  return `<section class="pv-stats-band">${stats.map((x) => `<div class="pv-stat"><span class="pv-stat-num">${x.num}</span><span class="pv-stat-cap">${x.cap}</span></div>`).join("")}</section>`;
}

function buildCardsSection(copy) {
  const cards = copy.cards ?? [];
  return `<section class="pv-cards">${cards.map((c, i) => `<article class="pv-card"><div class="pv-thumb t${i + 1}"></div><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p><span class="pv-chip">${esc(c.chip)}</span></article>`).join("")}</section>`;
}

function buildFormSection(copy) {
  return `<section class="pv-form"><h2 class="pv-h2">${esc(copy.formHeading)}</h2><div class="pv-alert ok"><div><p class="pv-alert-title">Changes published</p><p class="pv-alert-body">Your update is live for every workspace member.</p></div></div><div class="pv-grid-2"><div class="pv-field"><label>Email</label><input type="text" placeholder="${esc(copy.emailPlaceholder)}"></div><div class="pv-field has-error"><label>Team name</label><input type="text" value="A"><p class="pv-error-msg">Must be at least 3 characters.</p></div></div><div class="pv-field"><label>Note</label><textarea rows="2"></textarea><p class="pv-hint">We'll only use this to follow up.</p></div><button class="pv-btn pv-primary">${esc(copy.formCta)}</button></section>`;
}

function buildPricingSection() {
  return `<section class="pv-section"><p class="pv-label">Pricing</p><div class="pv-pricing"><article class="pv-tier"><h3>Hobby</h3><div class="pv-price">$0<span>/mo</span></div><ul><li>1 project</li><li>Community support</li><li>Basic analytics</li></ul><button class="pv-btn pv-ghost wide">Choose Hobby</button></article><article class="pv-tier featured"><span class="pv-flag">Most popular</span><h3>Studio</h3><div class="pv-price">$20<span>/mo</span></div><ul><li>Unlimited projects</li><li>Priority support</li><li>Advanced analytics</li></ul><button class="pv-btn pv-primary wide">Choose Studio</button></article><article class="pv-tier"><h3>Agency</h3><div class="pv-price">$79<span>/mo</span></div><ul><li>Client workspaces</li><li>Dedicated manager</li><li>SLA &amp; SSO</li></ul><button class="pv-btn pv-ghost wide">Choose Agency</button></article></div></section>`;
}

function buildTypeSection() {
  return `<section class="pv-section"><p class="pv-label">Type hierarchy</p><div class="pv-type-row"><span class="pv-tag">H1</span><span class="t-h1">Ship software that looks intentional</span></div><div class="pv-type-row"><span class="pv-tag">H2</span><span class="t-h2">Team activity this week</span></div><div class="pv-type-row"><span class="pv-tag">H3</span><span class="t-h3">Overdue items need owners</span></div><div class="pv-type-row"><span class="pv-tag">Body</span><span class="t-body">You have four tasks due before Friday. Assign an owner to each one so nothing slips through the cracks.</span></div><div class="pv-type-row"><span class="pv-tag">Muted</span><span class="t-muted">Last synced 3 minutes ago from your connected workspace.</span></div><div class="pv-type-row"><span class="pv-tag">Caption</span><span class="t-caption">Updated automatically every 15 minutes</span></div><div class="pv-type-row"><span class="pv-tag">Overline</span><span class="t-overline">Sprint 14</span></div><div class="pv-type-row"><span class="pv-tag">Link</span><a class="t-link">View full changelog</a></div><div class="pv-type-row"><span class="pv-tag">Code</span><code class="t-code">const kerning = 0.02em;</code></div></section>`;
}

function buildInverseSection() {
  return `<section class="pv-section"><p class="pv-label">Inverse surface</p><div class="pv-dark"><h4>Weekly digest</h4><p>A dark surface panel for contrast checks. Secondary copy sits at reduced opacity over the deepest neutral.</p><button class="pv-btn pv-accent">Open digest</button></div></section>`;
}

function buildFooterSection(copy) {
  return `<footer class="pv-footer"><span>&copy; 2026 ${esc(copy.brand)}</span><span>Built with kernic</span></footer>`;
}

/* Keyed on the vibe ids in src/vibes.ts, which is what state.vibeId carries
   (set from look.vibeId). These keys must match those ids exactly.
   The stats band only appears where product metrics belong. */
const PREVIEW_TEMPLATES = {
  corporate: ["nav", "hero", "stats", "cards", "form", "pricing", "type", "inverse", "footer"],
  tech: ["nav", "hero", "cards", "stats", "type", "inverse", "form", "footer"],
  neon: ["nav", "hero", "stats", "pricing", "cards", "type", "footer"],
  retro: ["nav", "hero", "cards", "type", "inverse", "footer"],
  minimal: ["nav", "hero", "cards", "type", "footer"],
  "soft-pastel": ["nav", "hero", "cards", "form", "type", "footer"],
  fun: ["nav", "hero", "cards", "pricing", "type", "footer"],
  earthy: ["nav", "hero", "cards", "form", "type", "footer"],
};

/** Server copy for the active vibe, falling back to the `default` entry. */
function previewCopy() {
  const all = state.meta?.copy ?? {};
  return all[state.vibeId] ?? all.default ?? {};
}

const SECTION_BUILDERS = {
  nav: () => buildNavSection(previewCopy()),
  hero: () => buildHeroSection(previewCopy()),
  stats: () => buildStatsSection(),
  cards: () => buildCardsSection(previewCopy()),
  form: () => buildFormSection(previewCopy()),
  pricing: () => buildPricingSection(),
  type: () => buildTypeSection(),
  inverse: () => buildInverseSection(),
  footer: () => buildFooterSection(previewCopy()),
};

function renderPreviewContent() {
  const pv = $("preview");
  const sections = PREVIEW_TEMPLATES[state.vibeId] ?? PREVIEW_TEMPLATES.corporate;
  pv.innerHTML = sections.map(s => SECTION_BUILDERS[s]()).join("");
}

/* ---------- font search combobox ---------- */

const FONT_LIMIT = 24;
const FONT_DEBOUNCE_MS = 170;
const FACE_SETTLE_MS = 260;

/** lowercase family -> canonical family. Everything we have ever seen from the server. */
const knownFamilies = new Map();

function rememberFamily(family) {
  if (isSafeFamily(family)) knownFamilies.set(family.trim().toLowerCase(), family.trim());
}

async function searchFontsApi(q) {
  const body = await api(`/api/fonts?q=${encodeURIComponent(q)}&limit=${FONT_LIMIT}`);
  const results = (body.results ?? []).filter((f) => isSafeFamily(f?.family));
  for (const f of results) rememberFamily(f.family);
  return {
    results,
    // `total` is the pre-truncation match count; older servers omit it.
    total: typeof body.total === "number" ? body.total : results.length,
    live: body.live !== false,
  };
}

/** A searchable, keyboard-driven picker over the whole Google Fonts catalog. */
function createFontCombo(inputId, key) {
  const input = $(inputId);
  const pop = $(`${inputId}Pop`);
  const list = $(`${inputId}List`);
  const meta = $(`${inputId}Meta`);

  let seq = 0;          // monotonic — a late reply for an older query is discarded
  let timer = null;     // debounce handle
  let pending = null;   // the search currently running, awaited before validating
  let faceTimer = null;
  let results = [];
  let active = -1;
  let open = false;
  let committed = state.fonts[key];

  function setOpen(next) {
    open = next;
    pop.hidden = !next;
    input.setAttribute("aria-expanded", String(next));
    if (next) return;
    input.removeAttribute("aria-activedescendant");
    active = -1;
    clearTimeout(faceTimer);
    releasePreviewFaces(new Set());
  }

  function setActive(i) {
    const prev = list.children[active];
    if (prev) {
      prev.classList.remove("on");
      prev.setAttribute("aria-selected", "false");
    }
    active = i;
    const next = list.children[i];
    if (!next) return input.removeAttribute("aria-activedescendant");
    next.classList.add("on");
    next.setAttribute("aria-selected", "true");
    input.setAttribute("aria-activedescendant", next.id);
    next.scrollIntoView({ block: "nearest" });
  }

  function render(found, total, live) {
    results = found;
    list.innerHTML = "";
    found.forEach((f, i) => {
      const li = document.createElement("li");
      li.id = `${inputId}-opt-${i}`;
      li.className = "combo-opt";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.dataset.family = f.family;
      const fam = document.createElement("span");
      fam.className = "combo-fam";
      fam.textContent = f.family;
      fam.style.fontFamily = fontStack(f.family, categoryGeneric(f.category));
      const cat = document.createElement("span");
      cat.className = "combo-cat";
      cat.textContent = f.category ?? "";
      li.append(fam, cat);
      list.appendChild(li);
    });

    const notes = [];
    if (found.length === 0) notes.push("No matching Google Font");
    else if (total > found.length) notes.push(`showing ${found.length} of ${total}, keep typing`);
    if (!live) notes.push("offline, showing bundled fonts");
    meta.textContent = notes.join(" · ");
    meta.hidden = notes.length === 0;

    setActive(found.length ? 0 : -1);
    scheduleFaces();
  }

  function scheduleFaces() {
    clearTimeout(faceTimer);
    faceTimer = setTimeout(loadVisibleFaces, FACE_SETTLE_MS);
  }

  /** Only rows currently on screen get a typeface, and only once typing settles. */
  function loadVisibleFaces() {
    if (!open) return;
    const box = list.getBoundingClientRect();
    const keep = new Set();
    for (const li of list.children) {
      const r = li.getBoundingClientRect();
      if (r.bottom > box.top && r.top < box.bottom) keep.add(li.dataset.family);
    }
    releasePreviewFaces(keep);
    for (const family of keep) loadPreviewFace(family);
  }

  async function runSearch(q) {
    const id = ++seq;
    try {
      const { results: found, total, live } = await searchFontsApi(q);
      if (id !== seq) return; // superseded
      render(found, total, live);
    } catch {
      if (id !== seq) return;
      render([], 0, true);
      meta.textContent = "Font search unavailable";
      meta.hidden = false;
    }
  }

  function queueSearch(q) {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; pending = runSearch(q); }, FONT_DEBOUNCE_MS);
  }

  /** Run any debounced search now — a blur must not validate against stale results. */
  async function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      pending = runSearch(input.value.trim());
    }
    if (pending) await pending;
  }

  function commit(family) {
    const name = String(family ?? "").trim();
    if (!isSafeFamily(name)) return revert(`“${name}” isn't a usable font name.`);
    pushUndo();
    committed = name;
    rememberFamily(name);
    input.value = name;
    state.fonts[key] = name;
    loadFontFace(name);
    setOpen(false);
    renderPreview();
  }

  function revert(msg) {
    input.value = committed;
    setOpen(false);
    if (!msg) return;
    setStatus(msg, "err");
    toast(msg);
  }

  /** Never apply a family that isn't in the catalog — it would 404 into serif. */
  async function validate() {
    const typed = input.value.trim();
    if (!typed || typed === committed) return revert(null);
    await flush();
    const canonical = knownFamilies.get(typed.toLowerCase());
    if (canonical) commit(canonical);
    else revert(`No Google Font called “${typed}”. Kept ${committed}.`);
  }

  input.addEventListener("focus", () => {
    setOpen(true);
    input.select();
    pending = runSearch(input.value.trim());
    pop.scrollIntoView({ block: "nearest" });
  });

  input.addEventListener("input", () => {
    if (!open) setOpen(true);
    queueSearch(input.value.trim());
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        pending = runSearch(input.value.trim());
        return;
      }
      if (!results.length) return;
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setActive((active + dir + results.length) % results.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && results[active]) commit(results[active].family);
      else validate();
      return;
    }
    if (e.key === "Escape") {
      if (open) e.stopPropagation();
      input.value = committed;
      setOpen(false);
      return;
    }
    if (e.key === "Tab" && open && results[active] && input.value.trim() !== committed) {
      commit(results[active].family);
    }
  });

  input.addEventListener("blur", () => {
    if (open || input.value.trim() !== committed) validate();
  });

  // keep focus on the input so blur-validation never races a row click
  list.addEventListener("mousedown", (e) => e.preventDefault());
  list.addEventListener("click", (e) => {
    const li = e.target.closest(".combo-opt");
    if (li) commit(li.dataset.family);
  });
  list.addEventListener("scroll", scheduleFaces, { passive: true });

  return {
    /** Adopt a value chosen elsewhere (a look, a loaded system) as the valid one. */
    setValue(family) {
      const name = String(family ?? "").trim();
      committed = name;
      input.value = name;
      rememberFamily(name);
    },
  };
}

const fontCombos = {};

/* ---------- controls ---------- */

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/* ---------- shuffle history (in-memory, session-only, never persisted) ---------- */
const HIST_MAX = 8;
let shuffleHistory = []; // {id, label, snap}
let activeHistId = null;

function snapshotState(label, id) {
  return {
    id,
    label,
    vibeId: state.vibeId,
    baseSeed: state.baseSeed,
    accentSeed: state.accentSeed,
    accentExact: false,
    hue: state.hue,
    harmony: state.harmony,
    tint: state.tint,
    fonts: { ...state.fonts },
    radiusStyle: state.radiusStyle,
    ratio: state.ratio,
    darkDefault: state.darkDefault,
    mode: state.mode,
    chromaScale: state.chromaScale,
    lRange: state.lRange,
    ramps: state.ramps,
    semanticRaw: state.semanticRaw,
    gradients: state.gradients,
  };
}

function restoreSnapshot(snap) {
  Object.assign(state, snap, { fonts: { ...snap.fonts } });
  activeHistId = snap.id;
  syncControls();
  renderRamps();
  renderPreview();
  renderPreviewContent();
  updateContrastIndicator();
  renderVibes();
  renderLooks();
  markActiveLook();
  renderHistory();
}

function renderHistory() {
  const host = $("historyStrip");
  host.innerHTML = "";
  $("historySection").style.display = shuffleHistory.length ? "" : "none";
  for (const h of shuffleHistory) {
    const chip = document.createElement("button");
    chip.className = "hist-chip" + (h.id === activeHistId ? " on" : "");
    chip.title = h.label;
    const r = h.snap.ramps;
    for (const hex of [r.primary["400"], r.primary["600"], r.accent["500"], r.neutral["300"]]) {
      const i = document.createElement("i");
      i.style.background = hex;
      chip.appendChild(i);
    }
    chip.onclick = () => restoreSnapshot(h.snap);
    host.appendChild(chip);
  }
}

function markActiveLook() {
  document.querySelectorAll(".look-card").forEach((c) =>
    c.classList.toggle("on", c.dataset.look === state.activeLookId));
}

/** One-click identity: a look applies everything — seeds, fonts, radius, scale, mode. */
function applyLook(look) {
  state.activeLookId = look.id;
  state.vibeId = look.vibeId;
  state.baseSeed = look.primarySeed;
  state.accentSeed = look.accentSeed;
  state.accentExact = true;
  state.hue = Math.round(hexToHue(look.primarySeed));
  const t = look.neutralTintHue;
  state.tint = t == null ? "pure" : t === 60 ? "warm" : t === 230 ? "cool" : "match";
  state.darkDefault = !!look.darkDefault;
  state.mode = look.darkDefault ? "dark" : "light";
  state.chromaScale = look.chromaScale ?? null;
  state.lRange = look.lRange ?? null;
  state.fonts = { ...look.fonts };
  state.radiusStyle = look.radius;
  state.ratio = look.ratio;
  if (!state.name.trim()) state.name = slugify(look.label);
  syncControls();
  refreshPalette();
  renderPreviewContent();
  markActiveLook();
  renderVibes();
  renderLooks();
}

function renderLooks() {
  const host = $("looksGrid");
  host.innerHTML = "";
  const themed = state.looks.filter((l) => l.vibeId === state.vibeId);
  const vibe = state.meta?.vibes.find((v) => v.id === state.vibeId);
  $("looksLabel").textContent = vibe ? `${vibe.label} looks` : "Looks";
  if (themed.length === 0) {
    $("looksSection").style.display = "none";
    return;
  }
  $("looksSection").style.display = "";
  for (const look of themed) {
    const card = document.createElement("div");
    card.className = "look-card" + (state.activeLookId === look.id ? " on" : "");
    card.dataset.look = look.id;

    const sem = look.semantic, c = look.colors;
    const frame = document.createElement("div");
    frame.className = "lc-frame";
    frame.style.background = sem.background;
    frame.style.color = sem.text;
    frame.innerHTML =
      `<div class="lc-head">Design, done</div>` +
      `<div class="lc-lines"><i></i><i></i></div>` +
      `<div class="lc-row"><span class="lc-btn" style="--lc-btn:${c.primary["600"]}">Get started</span>` +
      `<span class="lc-chip" style="color:${c.accent["500"]}">${look.label.split(" ")[0]}</span></div>`;

    const strip = document.createElement("div");
    strip.className = "lc-strip";
    for (const hex of [c.primary["200"], c.primary["400"], c.primary["600"], c.accent["500"], c.neutral["800"]]) {
      const i = document.createElement("i");
      i.style.background = hex;
      strip.appendChild(i);
    }

    const name = document.createElement("div");
    name.className = "lc-name";
    name.textContent = look.label + (look.darkDefault ? "  ☾" : "");

    frame.querySelector(".lc-head").style.fontFamily = fontStack(look.fonts.heading, "serif");

    card.append(frame, strip, name);
    card.onclick = () => applyLook(look);
    host.appendChild(card);

    observeLookFont(card, look.fonts.heading);
  }
}

/**
 * Look cards used to request a webfont each, on every render — dozens of parallel
 * Google Fonts requests on load and on every theme switch. Now a card's face is
 * fetched only once it is actually scrolled into view, and only once per family.
 */
let lookFontObserver = null;

function observeLookFont(card, family) {
  if (!isSafeFamily(family) || loadedFaces.has(family.trim())) return;
  if (!("IntersectionObserver" in window)) return loadFontFace(family);
  if (!lookFontObserver) {
    lookFontObserver = new IntersectionObserver(
      (entries, obs) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          loadFontFace(e.target.dataset.font);
          obs.unobserve(e.target);
        }
      },
      { rootMargin: "150px" }
    );
  }
  card.dataset.font = family.trim();
  lookFontObserver.observe(card);
}

function renderVibes() {
  const host = $("vibes");
  host.innerHTML = "";
  for (const v of state.meta.vibes) {
    const chip = document.createElement("button");
    chip.className = "chip" + (state.vibeId === v.id ? " on" : "");
    const dot = document.createElement("span");
    dot.className = "chip-dot";
    dot.style.background = v.primarySeed;
    chip.append(dot, document.createTextNode(v.label));
    chip.title = v.description;
    chip.onclick = () => applyVibe(v);
    host.appendChild(chip);
  }
}

/** Picking a theme auto-applies its recommended look — opinionated by design. */
function applyVibe(v) {
  const recommended = state.looks.find((l) => l.vibeId === v.id);
  if (recommended) {
    applyLook(recommended);
    return;
  }
  state.vibeId = v.id;
  state.activeLookId = null;
  markActiveLook();
  state.baseSeed = v.primarySeed;
  state.accentSeed = v.accentSeed;
  state.accentExact = true;
  state.hue = Math.round(hexToHue(v.primarySeed));
  state.darkDefault = v.darkModeDefault;
  state.mode = v.darkModeDefault ? "dark" : "light";
  state.chromaScale = v.chromaScale ?? null;
  state.lRange = v.lRange ?? null;
  state.fonts = { ...v.fonts };
  state.radiusStyle = v.radius;
  state.ratio = v.typeRatio;
  syncControls();
  refreshPalette().then(() => { renderVibes(); renderPreviewContent(); });
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
    b.onclick = () => { pushUndo(); state.radiusStyle = key; renderRadiusRow(); renderPreview(); };
    host.appendChild(b);
  }
}

function syncControls() {
  $("sysname").value = state.name;
  $("hue").value = state.hue;
  $("harmony").value = state.harmony;
  fontCombos.heading.setValue(state.fonts.heading);
  fontCombos.body.setValue(state.fonts.body);
  fontCombos.mono.setValue(state.fonts.mono);
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
    semantic: state.semanticRaw,
    gradients: state.gradients ?? undefined,
    fonts: state.fonts,
    radius: { style: state.radiusStyle, ...state.meta.radii[state.radiusStyle] },
    typeScale: { ratio: Number(state.ratio), baseRem: 1 },
    extensions: {
      seeds: {
        baseSeed: state.baseSeed,
        accentSeed: state.accentSeed,
        targetHue: state.hue,
        harmony: state.harmony,
        neutralTintHue: tintHue(),
        darkDefault: state.darkDefault,
        ...(state.chromaScale != null ? { chromaScale: state.chromaScale } : {}),
        ...(state.lRange ? { lRange: state.lRange } : {}),
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
    setStatus(`Saved "${name}" ✓ Now in \`kernic list\``, "ok");
    toast(`Saved "${name}"`);
  } catch (e) {
    setStatus(e.message, "err");
  }
}

/* ---------- init ---------- */

async function init() {
  state.meta = await api("/api/meta");

  try {
    const { looks } = await api("/api/looks");
    state.looks = looks;
    renderLooks();
  } catch {}

  const ratioSel = $("ratio");
  for (const r of state.meta.ratios) {
    const o = document.createElement("option");
    o.value = String(r);
    o.textContent = `${r} ${ratioLabel(r)}`;
    ratioSel.appendChild(o);
  }

  // warm the server-side catalog so the first font search is instant
  searchFontsApi("").catch(() => {});

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
      state.baseSeed = seeds.baseSeed || seeds.primarySeed || system.colors.primary["500"];
      state.accentSeed = seeds.accentSeed || system.colors.accent["500"];
      state.accentExact = true;
      state.hue = seeds.targetHue ?? Math.round(hexToHue(state.baseSeed));
      state.harmony = seeds.harmony ?? "analogous";
      state.darkDefault = !!seeds.darkDefault;
      state.mode = state.darkDefault ? "dark" : "light";
      const t = seeds.neutralTintHue;
      state.tint = t === undefined || t === null ? "pure" : t === 60 ? "warm" : t === 230 ? "cool" : "match";
      state.chromaScale = seeds.chromaScale ?? null;
      state.lRange = seeds.lRange ?? null;
      state.ramps = system.colors;
      state.semanticRaw = system.semantic;
      state.gradients = system.gradients ?? null;
      state.shadows = body.preview?.shadows ?? null;
      state.motion = body.preview?.motion ?? null;
      renderRamps();
      renderPreview();
      renderPreviewContent();
      syncControls();
      renderVibes();
      setStatus(`Editing "${system.name}"`, "");
      return;
    } catch (e) {
      setStatus(e.message, "err");
    }
  }

  // fresh session → open on an opinionated default look
  const defaultLook = state.looks.find((l) => l.id === "boardroom") ?? state.looks[0];
  if (defaultLook) applyLook(defaultLook);
  else {
    const vibe = state.meta.vibes.find((v) => v.id === "corporate") ?? state.meta.vibes[0];
    applyVibe(vibe);
  }
  renderVibes();
}

function ratioLabel(r) {
  return { 1.125: "(major second)", 1.2: "(minor third)", 1.25: "(major third)", 1.333: "(perfect fourth)", 1.414: "(augmented fourth)", 1.618: "(golden)" }[r] ?? "";
}

/* ---------- import flow ---------- */

function parseCssVariables(text) {
  const vars = {};
  for (const m of text.matchAll(/--([\w-]+)\s*:\s*([^;]+)/g)) {
    vars[m[1]] = m[2].trim();
  }
  return vars;
}

function parseDesignMd(text) {
  const vars = {};
  const tableRegex = /\|\s*`?--([\w-]+)`?\s*\|\s*([^|]+)\s*\|/g;
  for (const m of text.matchAll(tableRegex)) {
    vars[m[1]] = m[2].trim();
  }
  return vars;
}

function tryParseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function applyImportedTokens(vars) {
  let applied = 0;
  for (const [k, v] of Object.entries(vars)) {
    if (k.startsWith("color-")) {
      const parts = k.split("-");
      if (parts.length >= 3) {
        const ramp = parts.slice(1, -1).join("-");
        const stop = parts[parts.length - 1];
        if (state.ramps?.[ramp]?.[stop] != null) { state.ramps[ramp][stop] = v; applied++; }
      }
    } else if (k === "font-heading") { state.fonts.heading = v.replace(/^["']|["']$/g, "").split(",")[0].trim(); applied++; }
    else if (k === "font-body") { state.fonts.body = v.replace(/^["']|["']$/g, "").split(",")[0].trim(); applied++; }
    else if (k === "font-mono") { state.fonts.mono = v.replace(/^["']|["']$/g, "").split(",")[0].trim(); applied++; }
    else if (k === "radius-sm" || k === "radius-md" || k === "radius-lg") {
      const style = Object.entries(state.meta.radii).find(([, r]) => r.sm === v);
      if (style) { state.radiusStyle = style[0]; applied++; }
    }
  }
  return applied;
}

function openImportModal() { $("importModal").classList.add("open"); }
function closeImportModal() { $("importModal").classList.remove("open"); }

function doImport() {
  const text = $("importInput").value.trim();
  if (!text) return;
  let vars;
  const json = tryParseJson(text);
  if (json?.colors) {
    vars = {};
    for (const [ramp, stops] of Object.entries(json.colors))
      for (const [stop, hex] of Object.entries(stops))
        vars[`color-${ramp}-${stop}`] = hex;
    if (json.fonts) {
      if (json.fonts.heading) vars["font-heading"] = json.fonts.heading;
      if (json.fonts.body) vars["font-body"] = json.fonts.body;
      if (json.fonts.mono) vars["font-mono"] = json.fonts.mono;
    }
  } else {
    vars = text.includes("--") ? parseCssVariables(text) : parseDesignMd(text);
  }
  if (Object.keys(vars).length === 0) { toast("No recognizable tokens found"); return; }
  pushUndo();
  const n = applyImportedTokens(vars);
  syncControls();
  renderRamps();
  renderPreview();
  renderPreviewContent();
  updateContrastIndicator();
  closeImportModal();
  toast(`Imported ${n} token${n === 1 ? "" : "s"}`);
}

/* ---------- undo / redo ---------- */

const undoStack = [];
const redoStack = [];
const UNDO_MAX = 50;

let lastUndoPush = 0;

function pushUndo() {
  lastUndoPush = Date.now();
  undoStack.push(snapshotState("edit", Date.now()));
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack.length = 0;
}

/** One undo entry per burst of slider input, taken before the first change lands. */
function pushUndoThrottled(gapMs = 400) {
  if (Date.now() - lastUndoPush < gapMs) return;
  pushUndo();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshotState("edit", Date.now()));
  restoreSnapshot(undoStack.pop());
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshotState("edit", Date.now()));
  restoreSnapshot(redoStack.pop());
}

/* ---------- contrast check ---------- */

function srgbToLinear(c) { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }

function relativeLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1), l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function updateContrastIndicator() {
  const el = $("contrastIndicator");
  if (!el || !state.ramps) { if (el) el.textContent = ""; return; }
  const sem = pickMode(state.semanticRaw, state.mode);
  const bg = sem.background, fg = sem.text;
  if (!bg || !fg) { el.textContent = ""; return; }
  const ratio = contrastRatio(bg, fg);
  const pass = ratio >= 4.5;
  el.textContent = `${ratio.toFixed(1)}:1`;
  el.className = `contrast-indicator ${pass ? "pass" : "fail"}`;
  el.title = `WCAG AA ${pass ? "pass" : "fail"}, ${ratio.toFixed(2)}:1`;
}

/* ---------- responsive preview (phone viewport) ---------- */

function toggleViewport(vp) {
  const pv = $("preview");
  pv.classList.toggle("phone", vp === "phone");
  document.querySelectorAll("#viewportRow button").forEach(b =>
    b.classList.toggle("on", b.dataset.vp === vp));
}

/* ---------- export ---------- */

function formatCssVars() {
  const sem = pickMode(state.semanticRaw, state.mode);
  const lines = [":root {"];
  for (const [ramp, stops] of Object.entries(state.ramps))
    for (const [stop, hex] of Object.entries(stops))
      lines.push(`  --color-${ramp}-${stop}: ${hex};`);
  if (sem.background) lines.push(`  --pv-background: ${sem.background};`);
  if (sem.text) lines.push(`  --pv-text: ${sem.text};`);
  if (sem.border) lines.push(`  --pv-border: ${sem.border};`);
  lines.push(`  --font-heading: "${state.fonts.heading}", sans-serif;`);
  lines.push(`  --font-body: "${state.fonts.body}", sans-serif;`);
  lines.push(`  --font-mono: "${state.fonts.mono}", monospace;`);
  lines.push(`  --radius-sm: ${state.meta.radii[state.radiusStyle].sm};`);
  lines.push(`  --radius-md: ${state.meta.radii[state.radiusStyle].md};`);
  lines.push(`  --radius-lg: ${state.meta.radii[state.radiusStyle].lg};`);
  lines.push("}");
  return lines.join("\n");
}

function formatTailwindConfig() {
  const config = {
    theme: {
      extend: {
        colors: {},
        fontFamily: {
          heading: [`"${state.fonts.heading}"`, "sans-serif"],
          body: [`"${state.fonts.body}"`, "sans-serif"],
          mono: [`"${state.fonts.mono}"`, "monospace"],
        },
        borderRadius: {
          sm: state.meta.radii[state.radiusStyle].sm,
          md: state.meta.radii[state.radiusStyle].md,
          lg: state.meta.radii[state.radiusStyle].lg,
        },
      },
    },
  };
  for (const [ramp, stops] of Object.entries(state.ramps))
    for (const [stop, hex] of Object.entries(stops))
      config.theme.extend.colors[`${ramp}-${stop}`] = hex;
  return `/** @type {import('tailwindcss').Config} */\nexport default ${JSON.stringify(config, null, 2)};`;
}

function formatJsonExport() {
  return JSON.stringify(buildSystemPayload(), null, 2);
}

async function doExport(format) {
  const formatters = { css: formatCssVars, tailwind: formatTailwindConfig, json: formatJsonExport };
  const text = formatters[format]?.();
  if (!text) return;
  $("exportDropdown").classList.remove("open");
  try {
    await navigator.clipboard.writeText(text);
    toast(`${format.toUpperCase()} copied to clipboard`);
  } catch {
    toast("Could not reach the clipboard");
  }
}

function toggleExportDropdown() {
  $("exportDropdown").classList.toggle("open");
}

/* events */
for (const [id, key] of [["fHeading", "heading"], ["fBody", "body"], ["fMono", "mono"]])
  fontCombos[key] = createFontCombo(id, key);

$("ramps").addEventListener("click", (e) => {
  const hex = e.target.closest(".swatch")?.dataset.hex;
  if (!hex) return;
  navigator.clipboard?.writeText(hex);
  toast(`${hex} copied`);
});

$("hue").addEventListener("input", (e) => {
  pushUndoThrottled();
  state.hue = Number(e.target.value);
  $("hueVal").textContent = `${state.hue}°`; // readout stays instant; the fetch coalesces
  state.accentExact = false; // slider takes over — rotate hue, keep vibe's L/C character
  schedulePaletteRefresh();
});
$("harmony").addEventListener("change", (e) => {
  pushUndo();
  state.harmony = e.target.value;
  state.accentExact = false;
  refreshPalette();
});
$("ratio").addEventListener("change", (e) => { pushUndo(); state.ratio = Number(e.target.value); renderPreview(); });
$("randomize").onclick = async () => {
  pushUndo();
  const { seed } = await api("/api/random");
  state.baseSeed = seed;
  state.hue = Math.round(hexToHue(seed));
  state.accentExact = false;
  syncControls();
  refreshPalette();
};
$("rerollAccent").onclick = () => {
  pushUndo();
  const shifts = ["analogous", "complementary", "triadic"];
  state.harmony = shifts[Math.floor(Math.random() * shifts.length)];
  state.accentExact = false;
  syncControls();
  refreshPalette();
};
$("shuffle").onclick = async () => {
  const { seed } = await api("/api/random");
  const v = state.meta.vibes[Math.floor(Math.random() * state.meta.vibes.length)];
  const harmonies = ["analogous", "complementary", "triadic"];
  state.activeLookId = null;
  markActiveLook();
  state.vibeId = v.id;
  state.baseSeed = seed;
  state.accentSeed = null;
  state.accentExact = false;
  state.harmony = harmonies[Math.floor(Math.random() * harmonies.length)];
  state.hue = Math.round(hexToHue(seed));
  state.tint = ["match", "warm", "cool", "pure"][Math.floor(Math.random() * 4)];
  state.chromaScale = null;
  state.lRange = null;
  state.darkDefault = Math.random() < 0.35;
  state.mode = state.darkDefault ? "dark" : "light";
  state.fonts = { ...v.fonts };
  state.radiusStyle = v.radius;
  state.ratio = v.typeRatio;
  syncControls();
  await refreshPalette();
  renderLooks();

  // record this result in the session history (last 8, oldest drops off)
  const entry = {
    id: Date.now(),
    label: `${v.label} · hue ${state.hue}° · ${state.mode}`,
    snap: null,
  };
  entry.snap = snapshotState(entry.label, entry.id);
  shuffleHistory.push(entry);
  while (shuffleHistory.length > HIST_MAX) shuffleHistory.shift();
  activeHistId = entry.id;
  renderHistory();
};
document.querySelectorAll("#tintRow button").forEach((b) => {
  b.onclick = () => { pushUndo(); state.tint = b.dataset.tint; syncControls(); refreshPalette(); };
});
document.querySelectorAll("#modeRow button").forEach((b) => {
  b.onclick = () => { state.mode = b.dataset.mode; renderPreview(); updateContrastIndicator(); };
});
$("save").onclick = save;

/* new feature event listeners */
document.querySelectorAll("#viewportRow button").forEach((b) => {
  b.onclick = () => toggleViewport(b.dataset.vp);
});
$("importBtn").onclick = openImportModal;
$("importCancel").onclick = closeImportModal;
$("importApply").onclick = doImport;
$("importModal").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeImportModal(); });
$("exportBtn").onclick = toggleExportDropdown;
document.addEventListener("click", (e) => {
  if (!e.target.closest("#exportBtn") && !e.target.closest("#exportDropdown"))
    $("exportDropdown")?.classList.remove("open");
});
document.querySelectorAll("#exportDropdown button").forEach((b) => {
  b.onclick = () => doExport(b.dataset.format);
});
document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
  if (mod && e.key === "z" && e.shiftKey) { e.preventDefault(); redo(); }
  if (mod && e.key === "y") { e.preventDefault(); redo(); }
});

init();
