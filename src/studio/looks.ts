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
}

/**
 * Curated, opinionated pairings — the Studio's front door.
 * Each entry is a complete, stylistically distinct identity meant to be
 * picked once and trusted. Quality over knobs.
 */
export const LOOKS: Look[] = [
  // cyberpunk
  { id: "midnight-neon", label: "Midnight Neon", vibeId: "cyberpunk", primarySeed: "#ff2d95", accentSeed: "#00e5ff", neutralTintHue: 280, darkDefault: true,
    fonts: { heading: "Space Grotesk", body: "IBM Plex Sans", mono: "IBM Plex Mono" }, radius: "sharp", ratio: 1.333 },
  { id: "ghostwire", label: "Ghostwire", vibeId: "cyberpunk", primarySeed: "#22d3ee", accentSeed: "#a78bfa", neutralTintHue: 200, darkDefault: true,
    fonts: { heading: "Unbounded", body: "IBM Plex Sans", mono: "Fira Code" }, radius: "sharp", ratio: 1.333 },

  // brutalist
  { id: "newsprint", label: "Newsprint", vibeId: "brutalist", primarySeed: "#111111", accentSeed: "#dfff4f", neutralTintHue: null, darkDefault: false,
    fonts: { heading: "Archivo Black", body: "Archivo", mono: "JetBrains Mono" }, radius: "sharp", ratio: 1.414 },
  { id: "acid-grid", label: "Acid Grid", vibeId: "brutalist", primarySeed: "#1a1a1a", accentSeed: "#ccff00", neutralTintHue: null, darkDefault: false,
    fonts: { heading: "Space Grotesk", body: "Archivo", mono: "JetBrains Mono" }, radius: "sharp", ratio: 1.333 },

  // soft pastel
  { id: "sugar-cloud", label: "Sugar Cloud", vibeId: "soft-pastel", primarySeed: "#b8a7f5", accentSeed: "#7dd3fc", neutralTintHue: 300, darkDefault: false,
    fonts: { heading: "Quicksand", body: "Nunito Sans", mono: "Fira Code" }, radius: "round", ratio: 1.2 },
  { id: "peach-fuzz", label: "Peach Fuzz", vibeId: "soft-pastel", primarySeed: "#fb923c", accentSeed: "#f9a8d4", neutralTintHue: 20, darkDefault: false,
    fonts: { heading: "Fredoka", body: "Nunito Sans", mono: "Quicksand" }, radius: "round", ratio: 1.2 },

  // corporate clean
  { id: "boardroom", label: "Boardroom", vibeId: "corporate-clean", primarySeed: "#2563eb", accentSeed: "#0ea5e9", neutralTintHue: 230, darkDefault: false,
    fonts: { heading: "Inter", body: "Inter", mono: "IBM Plex Mono" }, radius: "soft", ratio: 1.25 },
  { id: "slate-serial", label: "Slate Serial", vibeId: "corporate-clean", primarySeed: "#0f172a", accentSeed: "#38bdf8", neutralTintHue: 220, darkDefault: false,
    fonts: { heading: "Manrope", body: "Source Sans 3", mono: "JetBrains Mono" }, radius: "soft", ratio: 1.25 },

  // earthy
  { id: "terracotta", label: "Terracotta", vibeId: "earthy", primarySeed: "#c2703d", accentSeed: "#7d9b76", neutralTintHue: 60, darkDefault: false,
    fonts: { heading: "Fraunces", body: "Source Sans 3", mono: "Courier Prime" }, radius: "soft", ratio: 1.25 },
  { id: "olive-grove", label: "Olive Grove", vibeId: "earthy", primarySeed: "#7d8b56", accentSeed: "#c2703d", neutralTintHue: 90, darkDefault: false,
    fonts: { heading: "Fraunces", body: "Karla", mono: "Courier Prime" }, radius: "soft", ratio: 1.25 },

  // luxury
  { id: "black-gold", label: "Black Gold", vibeId: "luxury", primarySeed: "#d4af37", accentSeed: "#8b6f47", neutralTintHue: 45, darkDefault: true,
    fonts: { heading: "Playfair Display", body: "Lato", mono: "Cormorant Garamond" }, radius: "sharp", ratio: 1.618 },
  { id: "velvet-hour", label: "Velvet Hour", vibeId: "luxury", primarySeed: "#d4a373", accentSeed: "#e5b3a1", neutralTintHue: 30, darkDefault: true,
    fonts: { heading: "Cormorant Garamond", body: "Lato", mono: "EB Garamond" }, radius: "sharp", ratio: 1.618 },

  // playful
  { id: "bubblegum", label: "Bubblegum", vibeId: "playful", primarySeed: "#fb7185", accentSeed: "#38bdf8", neutralTintHue: 350, darkDefault: false,
    fonts: { heading: "Baloo 2", body: "Fredoka", mono: "Nunito" }, radius: "pill", ratio: 1.333 },
  { id: "lemonade", label: "Lemonade", vibeId: "playful", primarySeed: "#facc15", accentSeed: "#fb7185", neutralTintHue: 50, darkDefault: false,
    fonts: { heading: "Fredoka", body: "Baloo 2", mono: "Nunito" }, radius: "pill", ratio: 1.333 },

  // retro
  { id: "sunset-drive", label: "Sunset Drive", vibeId: "retro", primarySeed: "#e07a3f", accentSeed: "#946b2d", neutralTintHue: 70, darkDefault: false,
    fonts: { heading: "DM Serif Display", body: "Karla", mono: "Space Mono" }, radius: "soft", ratio: 1.333 },
  { id: "avocado", label: "Avocado", vibeId: "retro", primarySeed: "#8a9a5b", accentSeed: "#d97706", neutralTintHue: 80, darkDefault: false,
    fonts: { heading: "DM Serif Display", body: "Karla", mono: "Space Mono" }, radius: "soft", ratio: 1.25 },

  // mono minimal
  { id: "paper-ink", label: "Paper & Ink", vibeId: "mono-minimal", primarySeed: "#18181b", accentSeed: "#3b82f6", neutralTintHue: null, darkDefault: false,
    fonts: { heading: "Inter", body: "Inter", mono: "JetBrains Mono" }, radius: "soft", ratio: 1.25 },
  { id: "graphite", label: "Graphite", vibeId: "mono-minimal", primarySeed: "#27272a", accentSeed: "#a1a1aa", neutralTintHue: null, darkDefault: true,
    fonts: { heading: "Inter", body: "Manrope", mono: "JetBrains Mono" }, radius: "soft", ratio: 1.25 },

  // ocean calm
  { id: "seafoam", label: "Seafoam", vibeId: "ocean-calm", primarySeed: "#0ea5a6", accentSeed: "#6366f1", neutralTintHue: 190, darkDefault: false,
    fonts: { heading: "Outfit", body: "Public Sans", mono: "Martian Mono" }, radius: "round", ratio: 1.25 },
  { id: "deep-current", label: "Deep Current", vibeId: "ocean-calm", primarySeed: "#0369a1", accentSeed: "#14b8a6", neutralTintHue: 210, darkDefault: true,
    fonts: { heading: "Outfit", body: "Public Sans", mono: "IBM Plex Mono" }, radius: "round", ratio: 1.25 },

  // extra breadth
  { id: "noir-editorial", label: "Noir Editorial", vibeId: "luxury", primarySeed: "#1c1917", accentSeed: "#b45309", neutralTintHue: 40, darkDefault: false,
    fonts: { heading: "Playfair Display", body: "Source Sans 3", mono: "JetBrains Mono" }, radius: "sharp", ratio: 1.5 },
  { id: "vaporwave", label: "Vaporwave", vibeId: "cyberpunk", primarySeed: "#c084fc", accentSeed: "#f472b6", neutralTintHue: 290, darkDefault: true,
    fonts: { heading: "Syne", body: "Inter", mono: "Space Mono" }, radius: "round", ratio: 1.333 },
  { id: "matcha-studio", label: "Matcha Studio", vibeId: "earthy", primarySeed: "#65a30d", accentSeed: "#0d9488", neutralTintHue: 100, darkDefault: false,
    fonts: { heading: "Lora", body: "DM Sans", mono: "Fira Code" }, radius: "round", ratio: 1.2 },
  { id: "ember-dark", label: "Ember Dark", vibeId: "earthy", primarySeed: "#ea580c", accentSeed: "#78716c", neutralTintHue: 25, darkDefault: true,
    fonts: { heading: "Sora", body: "Inter", mono: "JetBrains Mono" }, radius: "soft", ratio: 1.25 },
];
