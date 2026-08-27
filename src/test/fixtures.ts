// Shared fixtures for export.test.ts, context.test.ts, and mcp.test.ts, so each
// test file doesn't invent its own DesignSystem literal.
import { buildFromVibe, semanticFromRamps } from "../build.ts";
import { buildNeutral, buildRamp } from "../color.ts";
import { RADIUS_PRESETS, getVibe } from "../vibes.ts";
import type { DesignSystem } from "../types.ts";

export const FIXED_CREATED_AT = "2024-01-01T00:00:00.000Z";

/** Realistic, vibe-derived fixture — exercises the "tech" preset's gradients and distinct fonts. */
export const FIXTURE_VIBE_DS: DesignSystem = buildFromVibe("acme-tech", getVibe("tech")!);
FIXTURE_VIBE_DS.createdAt = FIXED_CREATED_AT;

/** Hand-built edge case: pure-gray neutral, heading === body (export dedup), no gradients. */
const edgeColors = {
  primary: buildRamp("#808080"),
  accent: buildRamp("#808080"),
  neutral: buildNeutral(),
};

export const FIXTURE_EDGE_DS: DesignSystem = {
  schemaVersion: 1,
  name: "edge-case",
  vibe: "custom",
  createdAt: FIXED_CREATED_AT,
  colors: edgeColors,
  semantic: semanticFromRamps(edgeColors, false),
  fonts: { heading: "DM Serif Display", body: "DM Serif Display", mono: "Space Mono" },
  radius: { style: "sharp", ...RADIUS_PRESETS.sharp },
  typeScale: { ratio: 1.125, baseRem: 1 },
  // gradients intentionally omitted
};
