// Shared fixtures for export.test.ts, context.test.ts, shadcn.test.ts and
// mcp.test.ts, so each test file doesn't invent its own DesignSystem literal.
import { buildFromVibe, semanticFromRamps } from "../build.ts";
import { buildNeutral, buildRamp } from "../color.ts";
import { migrateSystem } from "../tokens.ts";
import { RADIUS_PRESETS, getVibe } from "../vibes.ts";
import type { DesignSystem, DesignSystemV1 } from "../types.ts";

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

/**
 * The edge case as a version-1 file, the shape kernic wrote before 0.3.0.
 * Migration tests read this directly; everything else uses the migrated form.
 */
export const FIXTURE_V1_FILE: DesignSystemV1 = {
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

export const FIXTURE_EDGE_DS: DesignSystem = migrateSystem(FIXTURE_V1_FILE);
