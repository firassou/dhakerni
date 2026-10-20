import { beforeEach, describe, expect, it } from "vitest";
import { getOnline, markOffline, markOnline, resetOnlineForTests, subscribeOnline } from "./online";

describe("online store", () => {
  beforeEach(() => resetOnlineForTests());

  it("starts online and flips both ways", () => {
    expect(getOnline()).toBe(true);
    markOffline();
    expect(getOnline()).toBe(false);
    markOnline();
    expect(getOnline()).toBe(true);
  });

  it("notifies subscribers only when the value changes", () => {
    let calls = 0;
    const off = subscribeOnline(() => calls++);
    markOnline();
    expect(calls).toBe(0);
    markOffline();
    markOffline();
    expect(calls).toBe(1);
    off();
    markOnline();
    expect(calls).toBe(1);
  });
});
