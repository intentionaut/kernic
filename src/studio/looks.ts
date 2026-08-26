export interface Look {
  id: string;
  label: string;
  vibeId: string;
  primarySeed: string;
  accentSeed: string;
  neutralTintHue?: number | null;
  darkDefault: boolean;
  fonts: { heading: string; body: string; mono: string };
  radius: "sharp" | "soft" | "round" | "pill";
  ratio: number;
  chromaScale?: number | null;
  lRange?: [number, number] | null;
}

/**
 * Curated, opinionated pairings — grouped under the 7 theme families.
 * The Studio opens on a theme, shows its looks, and one click applies
 * a complete identity. 3–4 per family; first entry is the recommended default.
 */
export const LOOKS: Look[] = [
  // ── Retro (70s + 80s) ──────────────────────────────
  { id: "seventies-sun", label: "Seventies Sun", vibeId: "retro", primarySeed: "#e07a3f", accentSeed: "#946b2d", neutralTintHue: 70, darkDefault: false,
    fonts: { heading: "DM Serif Display", body: "Karla", mono: "Space Mono" }, radius: "soft", ratio: 1.333 },
  { id: "avocado", label: "Avocado Kitchen", vibeId: "retro", primarySeed: "#8a9a5b", accentSeed: "#d97706", neutralTintHue: 80, darkDefault: false,
    fonts: { heading: "DM Serif Display", body: "Karla", mono: "Space Mono" }, radius: "soft", ratio: 1.25 },
  { id: "neon-drive", label: "Neon Drive '85", vibeId: "retro", primarySeed: "#f472b6", accentSeed: "#22d3ee", neutralTintHue: 290, darkDefault: true,
    fonts: { heading: "Orbitron", body: "Inter", mono: "Space Mono" }, radius: "sharp", ratio: 1.333 },
  { id: "arcade-night", label: "Arcade Night", vibeId: "retro", primarySeed: "#a78bfa", accentSeed: "#f472b6", neutralTintHue: 280, darkDefault: true,
    fonts: { heading: "Unbounded", body: "IBM Plex Sans", mono: "JetBrains Mono" }, radius: "round", ratio: 1.333 },

  // ── Tech ───────────────────────────────────────────
  { id: "ghostwire", label: "Ghostwire", vibeId: "tech", primarySeed: "#22d3ee", accentSeed: "#a78bfa", neutralTintHue: 200, darkDefault: true,
    fonts: { heading: "Space Grotesk", body: "IBM Plex Sans", mono: "Fira Code" }, radius: "sharp", ratio: 1.25 },
  { id: "terminal", label: "Terminal", vibeId: "tech", primarySeed: "#22c55e", accentSeed: "#eab308", neutralTintHue: 140, darkDefault: true,
    fonts: { heading: "Space Grotesk", body: "Inter", mono: "JetBrains Mono" }, radius: "sharp", ratio: 1.125 },
  { id: "quantum", label: "Quantum", vibeId: "tech", primarySeed: "#3b82f6", accentSeed: "#06b6d4", neutralTintHue: 220, darkDefault: true,
    fonts: { heading: "Inter", body: "Inter", mono: "IBM Plex Mono" }, radius: "soft", ratio: 1.25 },
  { id: "paper-terminal", label: "Paper Terminal", vibeId: "tech", primarySeed: "#0f172a", accentSeed: "#38bdf8", neutralTintHue: 220, darkDefault: false,
    fonts: { heading: "Manrope", body: "Source Sans 3", mono: "JetBrains Mono" }, radius: "soft", ratio: 1.25 },

  // ── Corporate ──────────────────────────────────────
  { id: "boardroom", label: "Boardroom", vibeId: "corporate", primarySeed: "#2563eb", accentSeed: "#0ea5e9", neutralTintHue: 230, darkDefault: false,
    fonts: { heading: "Inter", body: "Inter", mono: "IBM Plex Mono" }, radius: "soft", ratio: 1.25 },
  { id: "midnight-ledger", label: "Midnight Ledger", vibeId: "corporate", primarySeed: "#1d4ed8", accentSeed: "#64748b", neutralTintHue: 225, darkDefault: true,
    fonts: { heading: "Inter", body: "Source Sans 3", mono: "IBM Plex Mono" }, radius: "soft", ratio: 1.25 },
  { id: "slate-serial", label: "Slate Serial", vibeId: "corporate", primarySeed: "#0f172a", accentSeed: "#38bdf8", neutralTintHue: 220, darkDefault: false,
    fonts: { heading: "Manrope", body: "Source Sans 3", mono: "JetBrains Mono" }, radius: "soft", ratio: 1.25 },
  { id: "fresh-saas", label: "Fresh SaaS", vibeId: "corporate", primarySeed: "#059669", accentSeed: "#0ea5e9", neutralTintHue: 160, darkDefault: false,
    fonts: { heading: "Plus Jakarta Sans", body: "Inter", mono: "IBM Plex Mono" }, radius: "soft", ratio: 1.25 },

  // ── Neon (gradient fintech / Stripe energy) ────────
  { id: "stripe-canvas", label: "Stripe Canvas", vibeId: "neon", primarySeed: "#635bff", accentSeed: "#00d4ff", neutralTintHue: 250, darkDefault: true,
    fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" }, radius: "soft", ratio: 1.25 },
  { id: "checkout-light", label: "Checkout Light", vibeId: "neon", primarySeed: "#635bff", accentSeed: "#00d4ff", neutralTintHue: 250, darkDefault: false,
    fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" }, radius: "soft", ratio: 1.25 },
  { id: "glow-pop", label: "Glow Pop", vibeId: "neon", primarySeed: "#ec4899", accentSeed: "#00d4ff", neutralTintHue: 320, darkDefault: true,
    fonts: { heading: "Plus Jakarta Sans", body: "Inter", mono: "Fira Code" }, radius: "round", ratio: 1.25 },
  { id: "aurora-pay", label: "Aurora Pay", vibeId: "neon", primarySeed: "#8b5cf6", accentSeed: "#22d3ee", neutralTintHue: 265, darkDefault: true,
    fonts: { heading: "Manrope", body: "Inter", mono: "JetBrains Mono" }, radius: "soft", ratio: 1.25 },
  { id: "citrus-circuit", label: "Citrus Circuit", vibeId: "neon", primarySeed: "#84cc16", accentSeed: "#22d3ee", neutralTintHue: 120, darkDefault: true,
    fonts: { heading: "Space Grotesk", body: "Inter", mono: "Fira Code" }, radius: "sharp", ratio: 1.25 },
  { id: "sunset-protocol", label: "Sunset Protocol", vibeId: "neon", primarySeed: "#fb923c", accentSeed: "#e879f9", neutralTintHue: 30, darkDefault: true,
    fonts: { heading: "Unbounded", body: "Inter", mono: "Space Mono" }, radius: "round", ratio: 1.333 },
  { id: "hyper-beat", label: "Hyperbeat", vibeId: "neon", primarySeed: "#f43f5e", accentSeed: "#facc15", neutralTintHue: 340, darkDefault: true,
    fonts: { heading: "Plus Jakarta Sans", body: "Inter", mono: "JetBrains Mono" }, radius: "soft", ratio: 1.25 },

  // ── Fun ────────────────────────────────────────────
  { id: "sticker-shock", label: "Sticker Shock", vibeId: "fun", primarySeed: "#ff1493", accentSeed: "#00cfff", neutralTintHue: 310, darkDefault: false,
    fonts: { heading: "Baloo 2", body: "Fredoka", mono: "Nunito" }, radius: "pill", ratio: 1.333,
    chromaScale: 1.25, lRange: [0.46, 0.94] },
  { id: "splash-zone", label: "Splash Zone", vibeId: "fun", primarySeed: "#ff2d78", accentSeed: "#00cfff", neutralTintHue: 330, darkDefault: false,
    fonts: { heading: "Fredoka", body: "Baloo 2", mono: "Nunito" }, radius: "round", ratio: 1.333,
    chromaScale: 1.25, lRange: [0.46, 0.94] },
  { id: "candy-shop", label: "Candy Shop", vibeId: "fun", primarySeed: "#a855f7", accentSeed: "#ff5ca8", neutralTintHue: 290, darkDefault: false,
    fonts: { heading: "Quicksand", body: "Fredoka", mono: "Fira Code" }, radius: "pill", ratio: 1.2,
    chromaScale: 1.25, lRange: [0.46, 0.94] },
  { id: "tangerine-flux", label: "Tangerine Flux", vibeId: "fun", primarySeed: "#ff6b35", accentSeed: "#00cfc0", neutralTintHue: 40, darkDefault: false,
    fonts: { heading: "Sora", body: "DM Sans", mono: "Nunito" }, radius: "round", ratio: 1.333,
    chromaScale: 1.25, lRange: [0.46, 0.94] },

  // ── Minimal ────────────────────────────────────────
  { id: "paper-ink", label: "Paper & Ink", vibeId: "minimal", primarySeed: "#18181b", accentSeed: "#3b82f6", neutralTintHue: null, darkDefault: false,
    fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" }, radius: "soft", ratio: 1.125 },
  { id: "graphite", label: "Graphite", vibeId: "minimal", primarySeed: "#27272a", accentSeed: "#a1a1aa", neutralTintHue: null, darkDefault: true,
    fonts: { heading: "Inter", body: "Manrope", mono: "JetBrains Mono" }, radius: "soft", ratio: 1.125 },
  { id: "concrete", label: "Concrete", vibeId: "minimal", primarySeed: "#292524", accentSeed: "#d6d3d1", neutralTintHue: null, darkDefault: false,
    fonts: { heading: "Archivo Black", body: "Archivo", mono: "JetBrains Mono" }, radius: "sharp", ratio: 1.2 },

  // ── Soft Pastel ────────────────────────────────────
  { id: "sugar-cloud", label: "Sugar Cloud", vibeId: "soft-pastel", primarySeed: "#b8a7f5", accentSeed: "#7dd3fc", neutralTintHue: 300, darkDefault: false,
    fonts: { heading: "Quicksand", body: "Nunito Sans", mono: "Fira Code" }, radius: "round", ratio: 1.2 },
  { id: "peach-fuzz", label: "Peach Fuzz", vibeId: "soft-pastel", primarySeed: "#fb923c", accentSeed: "#f9a8d4", neutralTintHue: 20, darkDefault: false,
    fonts: { heading: "Fredoka", body: "Nunito Sans", mono: "Quicksand" }, radius: "round", ratio: 1.2 },
  { id: "bubblegum", label: "Bubblegum", vibeId: "soft-pastel", primarySeed: "#fb7185", accentSeed: "#38bdf8", neutralTintHue: 350, darkDefault: false,
    fonts: { heading: "Baloo 2", body: "Fredoka", mono: "Nunito" }, radius: "pill", ratio: 1.333 },

  // ── Earthy / Organic ───────────────────────────────
  { id: "terracotta", label: "Terracotta", vibeId: "earthy", primarySeed: "#c2703d", accentSeed: "#7d9b76", neutralTintHue: 60, darkDefault: false,
    fonts: { heading: "Fraunces", body: "Source Sans 3", mono: "Courier Prime" }, radius: "soft", ratio: 1.25 },
  { id: "olive-grove", label: "Olive Grove", vibeId: "earthy", primarySeed: "#7d8b56", accentSeed: "#c2703d", neutralTintHue: 90, darkDefault: false,
    fonts: { heading: "Fraunces", body: "Karla", mono: "Courier Prime" }, radius: "soft", ratio: 1.25 },
  { id: "matcha-studio", label: "Matcha Studio", vibeId: "earthy", primarySeed: "#65a30d", accentSeed: "#0d9488", neutralTintHue: 100, darkDefault: false,
    fonts: { heading: "Lora", body: "DM Sans", mono: "Fira Code" }, radius: "round", ratio: 1.2 },
  { id: "ember-dark", label: "Ember Dark", vibeId: "earthy", primarySeed: "#ea580c", accentSeed: "#78716c", neutralTintHue: 25, darkDefault: true,
    fonts: { heading: "Sora", body: "Inter", mono: "JetBrains Mono" }, radius: "soft", ratio: 1.25 },
];
