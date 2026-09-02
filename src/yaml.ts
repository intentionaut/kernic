/**
 * A small YAML emitter for the shapes kernic writes into DESIGN.md front
 * matter: nested maps, lists, strings, numbers, booleans. It is deliberately
 * not a general YAML library. Everything it produces is also valid for the
 * `yaml` parser Google's DESIGN.md linter uses, which is what the conformance
 * test checks.
 */

export type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Strings YAML would otherwise read as something else, or that carry syntax. */
function needsQuotes(s: string): boolean {
  if (s.length === 0) return true;
  if (/^[\s#{}\[\]&*!|>'"%@`\-?:,]/.test(s)) return true;
  if (/[\s]$/.test(s)) return true;
  if (/: |\s#|\n|\t/.test(s)) return true;
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return true;
  if (/^[-+]?(\d[\d_]*\.?\d*([eE][-+]?\d+)?|\.\d+|0x[0-9a-fA-F]+|0o[0-7]+|\.inf|\.nan)$/i.test(s)) return true;
  return false;
}

function scalar(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return needsQuotes(value) ? JSON.stringify(value) : value;
}

function key(k: string): string {
  return PLAIN_KEY.test(k) ? k : JSON.stringify(k);
}

function isMap(v: YamlValue): v is { [key: string]: YamlValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function lines(value: YamlValue, indent: number): string[] {
  const pad = "  ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${pad}[]`];
    const out: string[] = [];
    for (const item of value) {
      if (isMap(item)) {
        const inner = lines(item, indent + 1);
        // First key rides on the "- " line, the rest indent under it.
        out.push(`${pad}- ${inner[0].trimStart()}`, ...inner.slice(1));
      } else if (Array.isArray(item)) {
        out.push(`${pad}-`, ...lines(item, indent + 1));
      } else {
        out.push(`${pad}- ${scalar(item)}`);
      }
    }
    return out;
  }
  if (isMap(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return [`${pad}{}`];
    const out: string[] = [];
    for (const [k, v] of entries) {
      if (v === undefined) continue;
      if (isMap(v) || Array.isArray(v)) {
        const inner = lines(v, indent + 1);
        const empty = inner.length === 1 && (inner[0].trim() === "{}" || inner[0].trim() === "[]");
        if (empty) out.push(`${pad}${key(k)}: ${inner[0].trim()}`);
        else out.push(`${pad}${key(k)}:`, ...inner);
      } else {
        out.push(`${pad}${key(k)}: ${scalar(v)}`);
      }
    }
    return out;
  }
  return [`${pad}${scalar(value)}`];
}

/** Serialize a map to YAML, two-space indented, with a trailing newline. */
export function toYaml(value: { [key: string]: YamlValue }): string {
  return lines(value, 0).join("\n") + "\n";
}
