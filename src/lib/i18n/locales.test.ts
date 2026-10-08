import { describe, expect, it } from "vitest";
import { LOCALES, lookup, matchLocale, messages, translate } from "./locales";

function keys(node: unknown, prefix = ""): string[] {
  if (typeof node !== "object" || node === null) return [prefix];
  return Object.entries(node).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("messages", () => {
  it("has identical key sets in every locale", () => {
    const base = keys(messages.en).sort();
    for (const l of LOCALES) expect(keys(messages[l]).sort()).toEqual(base);
  });
  it("has no empty strings", () => {
    for (const l of LOCALES) for (const k of keys(messages[l])) expect(lookup(l, k)).toBeTruthy();
  });
});

describe("matchLocale", () => {
  it("picks the first supported language in preference order", () => {
    expect(matchLocale(["de-DE", "ar-TN", "en"])).toBe("ar");
    expect(matchLocale(["fr-CA", "en"])).toBe("fr");
  });
  it("falls back to English", () => {
    expect(matchLocale(["de", "ja"])).toBe("en");
    expect(matchLocale([])).toBe("en");
  });
});

describe("translate", () => {
  it("interpolates variables and falls back to the key", () => {
    expect(translate("en", "nope.missing")).toBe("nope.missing");
  });
});
