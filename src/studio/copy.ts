/**
 * Static per-vibe copy for the Studio live preview.
 *
 * Each entry gives the preview demo content a voice that matches its vibe,
 * so the palette is never judged against words that fight it.
 * Keyed by vibe id; `default` is the kernic-flavored fallback.
 */

export interface PreviewCopy {
  brand: string;
  links: [string, string, string];
  navCta: string;
  /** Headline text before the accent word. */
  h1: string;
  /** The accent (gradient/primary) word, punctuation included. */
  h1Accent: string;
  sub: string;
  primaryCta: string;
  ghostCta: string;
  cards: { title: string; body: string; chip: string }[];
  formHeading: string;
  emailPlaceholder: string;
  formCta: string;
}

export const DEFAULT_COPY: PreviewCopy = {
  brand: "Acme",
  links: ["Product", "Pricing", "Docs"],
  navCta: "Sign in",
  h1: "Ship software that looks ",
  h1Accent: "intentional.",
  sub: "One design system, tuned once, applied everywhere. No default-blue buttons ever again.",
  primaryCta: "Get started free",
  ghostCta: "See how it works",
  cards: [
    { title: "Tokens as JSON", body: "Plain files you own. Version them, diff them, share them.", chip: "core" },
    { title: "Perceptual ramps", body: "OKLCH color with gamut fitting from 50 to 950.", chip: "color" },
    { title: "Type that breathes", body: "Scales built on musical ratios, not vibes alone.", chip: "type" },
  ],
  formHeading: "Stay in the loop",
  emailPlaceholder: "you@studio.dev",
  formCta: "Subscribe",
};

export const PREVIEW_COPY: Record<string, PreviewCopy> = {
  default: DEFAULT_COPY,

  retro: {
    brand: "Sunset Radio",
    links: ["Shows", "Mixtapes", "About"],
    navCta: "Tune in",
    h1: "Broadcasting from the ",
    h1Accent: "golden hour.",
    sub: "Warm signals, vinyl crackle and late-night frequencies — straight to your room.",
    primaryCta: "Tune in live",
    ghostCta: "Browse the archives",
    cards: [
      { title: "Vinyl Fridays", body: "New pressings and deep cuts, every week at seven.", chip: "on-air" },
      { title: "Cassette Club", body: "Members get first listen to limited mixtape runs.", chip: "analog" },
      { title: "Late Frequencies", body: "After-midnight sets for the beautifully awake.", chip: "AM/FM" },
    ],
    formHeading: "Join the listener's club",
    emailPlaceholder: "you@nightowl.fm",
    formCta: "Subscribe",
  },

  tech: {
    brand: "pulse//metric",
    links: ["Docs", "CLI", "Changelog"],
    navCta: "Sign in",
    h1: "Ship telemetry at ",
    h1Accent: "the speed of thought.",
    sub: "Sub-millisecond event ingestion for teams who read graphs before email.",
    primaryCta: "Get the CLI",
    ghostCta: "Read the docs",
    cards: [
      { title: "Zero-config agents", body: "One binary. Auto-discovers every service you run.", chip: "edge" },
      { title: "Plain SQL queries", body: "No proprietary language. Your team already knows it.", chip: "oss" },
      { title: "Alerts that sleep", body: "Only pages when the graph actually matters.", chip: "v2.4" },
    ],
    formHeading: "Join the beta",
    emailPlaceholder: "you@startup.dev",
    formCta: "Request access",
  },

  corporate: {
    brand: "Northbridge Advisory",
    links: ["Services", "Industries", "Insights"],
    navCta: "Contact us",
    h1: "Clarity for ",
    h1Accent: "complex decisions.",
    sub: "Advisory built on forty years of steady judgment — measured, compliant, delivered.",
    primaryCta: "Book a consultation",
    ghostCta: "Our approach",
    cards: [
      { title: "Risk & compliance", body: "Frameworks that stand up to regulators and boards alike.", chip: "governance" },
      { title: "Operating models", body: "Structure that scales without losing accountability.", chip: "strategy" },
      { title: "Board advisory", body: "A steady voice for the decisions that define decades.", chip: "trusted" },
    ],
    formHeading: "Request our credentials",
    emailPlaceholder: "you@company.com",
    formCta: "Get in touch",
  },

  neon: {
    brand: "Lumen Pay",
    links: ["Product", "Pricing", "Developers"],
    navCta: "Sign in",
    h1: "Money that moves at ",
    h1Accent: "light speed.",
    sub: "One API for instant global payouts — built for tomorrow's banks.",
    primaryCta: "Start building",
    ghostCta: "View pricing",
    cards: [
      { title: "Instant payouts", body: "Settle in 180 countries before the button click fades.", chip: "api" },
      { title: "Smart FX routing", body: "The best executable rate on every transaction, automatically.", chip: "global" },
      { title: "Compliance built-in", body: "KYC, AML and audit trails from day one.", chip: "instant" },
    ],
    formHeading: "Get the changelog",
    emailPlaceholder: "you@fintech.io",
    formCta: "Subscribe",
  },

  minimal: {
    brand: "norr",
    links: ["Work", "Journal", "Contact"],
    navCta: "Sign in",
    h1: "Less, ",
    h1Accent: "but better.",
    sub: "A quiet workspace for people who think before they type.",
    primaryCta: "Start writing",
    ghostCta: "See the work",
    cards: [
      { title: "Plain text", body: "No formats fighting you. Your words, as files.", chip: "files" },
      { title: "Local first", body: "Works on a plane. Works in twenty years.", chip: "offline" },
      { title: "No settings", body: "The decisions are made. Write.", chip: "focus" },
    ],
    formHeading: "Occasional letters",
    emailPlaceholder: "you@quiet.place",
    formCta: "Subscribe",
  },

  "soft-pastel": {
    brand: "bloom",
    links: ["Routines", "Journal", "Sleep"],
    navCta: "Say hello",
    h1: "Small rituals, ",
    h1Accent: "softer days.",
    sub: "A gentle companion for habits, rest and slow mornings.",
    primaryCta: "Begin gently",
    ghostCta: "Take a tour",
    cards: [
      { title: "Morning pages", body: "Three kind prompts before the day gets loud.", chip: "daily" },
      { title: "Wind-down timer", body: "Screens dim as the sky does.", chip: "rest" },
      { title: "Mood garden", body: "Watch small check-ins grow into something lovely.", chip: "gentle" },
    ],
    formHeading: "Stay in touch",
    emailPlaceholder: "you@bloom.garden",
    formCta: "Subscribe",
  },

  fun: {
    brand: "Pizza-O-Matic",
    links: ["Menu", "Deals", "Parties"],
    navCta: "Order now",
    h1: "Pizza night, but ",
    h1Accent: "a whole party.",
    sub: "Hot, fast and ridiculously cheesy — delivered with extra confetti.",
    primaryCta: "Order now",
    ghostCta: "See the deals",
    cards: [
      { title: "Build your own", body: "Drag, drop, devour. No wrong answers.", chip: "yum" },
      { title: "Party packs", body: "Feeds the team. Impresses the humans.", chip: "hot" },
      { title: "Loyalty sprinkles", body: "Every slice earns you more slices.", chip: "free" },
    ],
    formHeading: "Get the deals",
    emailPlaceholder: "you@hungry.com",
    formCta: "Sign me up",
  },

  earthy: {
    brand: "Root & Row",
    links: ["Farm", "Boxes", "Journal"],
    navCta: "Say hello",
    h1: "Grown slowly, ",
    h1Accent: "delivered honestly.",
    sub: "Seasonal boxes from soil we know by name — vegetables, herbs and small joys.",
    primaryCta: "This week's box",
    ghostCta: "Meet the farm",
    cards: [
      { title: "Seasonal boxes", body: "Whatever the ground gave us this week, packed at dawn.", chip: "seasonal" },
      { title: "Soil to door", body: "Picked within 24 hours of landing on your step.", chip: "local" },
      { title: "The growers", body: "Six families, four generations, one valley.", chip: "story" },
    ],
    formHeading: "Field notes, monthly",
    emailPlaceholder: "you@hedgerow.uk",
    formCta: "Subscribe",
  },
};
