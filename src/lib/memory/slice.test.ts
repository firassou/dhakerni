import { describe, expect, it } from "vitest";
import type { ProfileFact } from "../schemas";
import { sliceForParse } from "./slice";

const f = (key: string, value: string, confidence = 0.8): ProfileFact => ({
  id: key,
  key,
  value,
  source: "answer",
  confidence,
  updatedAt: new Date().toISOString(),
});

describe("what the AI is allowed to see", () => {
  const facts = [
    f("vague.شوية", "20"),
    f("vague.later", "60"),
    f("anchor.leave_work", "17:00"),
    f("usual.time.work", "09:00"),
    f("frequent.secret title", "5"),
    f("language.mix", "arabic+latin"),
  ];

  it("sends only facts relevant to this text, never the whole profile", () => {
    const hints = sliceForParse(facts, "بعد شوية نعمل réunion").join(" ");
    expect(hints).toContain("شوية");
    expect(hints).toContain("mix Arabic-script");
    expect(hints).not.toContain("later");
    expect(hints).not.toContain("17:00");
    expect(hints).not.toContain("secret title");
    expect(hints).not.toContain("09:00");
  });
  it("sends nothing from facts that are not trusted yet", () => {
    expect(
      sliceForParse([f("vague.شوية", "20", 0.4), f("language.mix", "x", 0.4)], "بعد شوية"),
    ).toEqual([]);
  });
  it("sends nothing for an empty profile", () => {
    expect(sliceForParse([], "hello")).toEqual([]);
  });
});
