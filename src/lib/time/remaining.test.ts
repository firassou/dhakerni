import { describe, expect, it } from "vitest";
import { formatRemaining } from "./remaining";

const now = new Date(2026, 9, 8, 10, 0); // Thu 8 Oct 2026, 10:00
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();

describe("formatRemaining (informal, rounded)", () => {
  it("minutes under an hour", () => {
    expect(formatRemaining(at(8, 10, 25), now, "en")).toBe("in 25 minutes");
    expect(formatRemaining(at(8, 10, 1), now, "en")).toBe("in 1 minute");
  });
  it("this minute when it is about to happen", () => {
    expect(formatRemaining(new Date(now.getTime() + 20_000).toISOString(), now, "en")).toBe(
      "this minute",
    );
  });
  it("hours later today", () => {
    expect(formatRemaining(at(8, 12, 5), now, "en")).toBe("in 2 hours");
    expect(formatRemaining(at(8, 17, 0), now, "en")).toBe("in 7 hours");
  });
  it("tomorrow and days, by calendar day, not by 24-hour blocks", () => {
    expect(formatRemaining(at(9, 8, 0), now, "en")).toBe("tomorrow"); // 22 hours away reads better as "tomorrow"
    expect(formatRemaining(at(9, 3, 0), now, "en")).toBe("in 17 hours");
    expect(formatRemaining(at(9, 23, 0), now, "en")).toBe("tomorrow");
    expect(formatRemaining(at(11, 9, 0), now, "en")).toBe("in 3 days");
  });
  it("weeks further out, nothing beyond two months", () => {
    expect(formatRemaining(at(29, 9), now, "en")).toBe("in 3 weeks");
    expect(formatRemaining(new Date(2027, 2, 1).toISOString(), now, "en")).toBeNull();
  });
  it("nothing for the past", () => {
    expect(formatRemaining(at(8, 9, 0), now, "en")).toBeNull();
    expect(formatRemaining(now.toISOString(), now, "en")).toBeNull();
  });
  it("speaks French and Arabic", () => {
    expect(formatRemaining(at(8, 10, 25), now, "fr")).toBe("dans 25 minutes");
    expect(formatRemaining(at(9, 23, 0), now, "fr")).toBe("demain");
    expect(formatRemaining(at(8, 10, 25), now, "ar")).toMatch(/25|٢٥/);
  });
});
