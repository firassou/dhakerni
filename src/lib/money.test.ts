import { describe, expect, it } from "vitest";
import { formatMillimes, parseMillimes } from "./money";

describe("parseMillimes", () => {
  it.each([
    ["45,300", 45_300],
    ["45.300", 45_300],
    ["45,3", 45_300],
    ["45", 45_000],
    ["0,500", 500],
    ["1 234,500", 1_234_500],
    ["1.234,500", 1_234_500],
    ["1,234.500", 1_234_500],
    ["1.234.567", 1_234_567_000],
    ["45,300 DT", 45_300],
    ["TND 120.750", 120_750],
    ["٤٥٫٣٠٠", 45_300],
    ["٤٥٫٣٠٠ د.ت", 45_300],
    ["۱۲٬۵۰۰٫۰۰۰", 12_500_000],
    ["12,5", 12_500],
    ["12,55", 12_550],
  ])("reads %s", (raw, expected) => expect(parseMillimes(raw)).toBe(expected));

  it("returns null when there is no number", () => {
    expect(parseMillimes("")).toBeNull();
    expect(parseMillimes("DT")).toBeNull();
  });
});

describe("formatMillimes", () => {
  it("always shows three decimals", () => {
    expect(formatMillimes(45_300, "en")).toBe("45.300 DT");
    expect(formatMillimes(45_300, "fr")).toBe("45,300 DT");
    expect(formatMillimes(1_234_500, "en")).toBe("1,234.500 DT");
  });
});
