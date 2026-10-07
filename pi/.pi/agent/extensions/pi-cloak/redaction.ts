export interface CompiledCloakPattern {
  source: string;
  regex: RegExp;
  replace?: string;
}

export interface RedactionConfig {
  cloakCharacter?: string;
  cloakLength?: number | null;
  tryAllPatterns?: boolean;
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const SENSITIVE_KEY = /^(?:access|accessToken|apiKey|authorization|clientSecret|idToken|key|password|privateKey|refresh|refreshToken|secret|sessionToken|token)$/i;

function repeatToLength(seed: string, length: number): string {
  if (length <= 0 || !seed) return "";
  return seed.repeat(Math.ceil(length / seed.length)).slice(0, length);
}

function applyReplacementTemplate(template: string, match: string, captures: string[]): string {
  return template.replace(/\$(\$|&|\d{1,2})/g, (_token, reference: string) => {
    if (reference === "$") return "$";
    if (reference === "&") return match;
    return captures[Number(reference) - 1] ?? "";
  });
}

function buildMaskedReplacement(
  match: string,
  captures: string[],
  replace: string | undefined,
  config: RedactionConfig,
): string {
  const visible = replace ? applyReplacementTemplate(replace, match, captures) : match.slice(0, 1);
  const targetLength = config.cloakLength ?? Math.max(match.length, visible.length);
  const truncatedVisible = visible.slice(0, targetLength);
  return truncatedVisible + repeatToLength(config.cloakCharacter ?? "*", targetLength - truncatedVisible.length);
}

/** Redact configured patterns from arbitrary tool-result text. */
export function redactText(
  text: string,
  patterns: CompiledCloakPattern[],
  config: RedactionConfig,
): { text: string; changed: boolean } {
  let updated = text;
  let changed = false;

  for (const pattern of patterns) {
    let matched = false;
    const next = updated.replace(pattern.regex, (match: string, ...args: unknown[]) => {
      const captures = args.slice(0, Math.max(0, args.length - 2)).map((value) => String(value ?? ""));
      const replacement = buildMaskedReplacement(match, captures, pattern.replace, config);
      matched ||= replacement !== match;
      return replacement;
    });

    if (matched) {
      updated = next;
      changed = true;
      if (!config.tryAllPatterns) break;
    }
  }

  return { text: updated, changed };
}

/** Redact sensitive keys and configured patterns while preserving structured tool-result shape. */
export function redactJson(
  value: JsonValue,
  patterns: CompiledCloakPattern[],
  config: RedactionConfig,
  key?: string,
): { value: JsonValue; changed: boolean } {
  if (typeof value === "string") {
    if (key && SENSITIVE_KEY.test(key)) {
      return { value: repeatToLength(config.cloakCharacter ?? "*", config.cloakLength ?? value.length), changed: value.length > 0 };
    }
    const result = redactText(value, patterns, config);
    return { value: result.text, changed: result.changed };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const result = redactJson(item, patterns, config);
      changed ||= result.changed;
      return result.value;
    });
    return { value: items, changed };
  }

  if (value && typeof value === "object") {
    let changed = false;
    const entries = Object.entries(value).map(([childKey, childValue]) => {
      const result = redactJson(childValue, patterns, config, childKey);
      changed ||= result.changed;
      return [childKey, result.value] as const;
    });
    return { value: Object.fromEntries(entries), changed };
  }

  return { value, changed: false };
}
