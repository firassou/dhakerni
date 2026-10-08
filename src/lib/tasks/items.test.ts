import { describe, expect, it } from "vitest";
import { Task } from "../schemas";
import {
  acceptSuggestion,
  addItem,
  addStep,
  chooseOption,
  dismissAllSuggestions,
  dismissSuggestion,
  formatItem,
  itemsDone,
  removeItem,
  setItemQty,
  stepsDone,
  toggleItem,
  toggleStep,
} from "./items";

const stamp = new Date().toISOString();
const base = (extra: Partial<Task> = {}) =>
  Task.parse({ id: "t", title: "Buy", order: 0, createdAt: stamp, updatedAt: stamp, ...extra });

describe("formatting", () => {
  it("shows quantity and unit the natural way", () => {
    expect(formatItem({ name: "juice", qty: 2, unit: null }, "en")).toBe("2× juice");
    expect(formatItem({ name: "milk", qty: 2, unit: "L" }, "en")).toBe("2 L milk");
    expect(formatItem({ name: "bread", qty: null, unit: null }, "en")).toBe("bread");
    expect(formatItem({ name: "طماطم", qty: 0.5, unit: "كيلو" }, "en")).toBe("0.5 كيلو طماطم");
  });
});

describe("items", () => {
  it("add, check, change quantity, remove", () => {
    let t = addItem(base(), "  juice ", 2);
    expect(t.items).toMatchObject([{ name: "juice", qty: 2, done: false }]);
    const id = t.items[0].id;
    t = toggleItem(t, id);
    expect(itemsDone(t)).toBe(1);
    t = setItemQty(t, id, 3);
    expect(t.items[0].qty).toBe(3);
    expect(setItemQty(t, id, 0).items[0].qty).toBeNull(); // zero is not a quantity
    expect(removeItem(t, id).items).toEqual([]);
  });
  it("ignores empty names", () => {
    const t = base();
    expect(addItem(t, "   ")).toBe(t);
  });
});

describe("steps and suggestions", () => {
  it("a suggestion becomes a step only when accepted", () => {
    let t = base({ suggestions: ["Book transport", "Pack"] });
    expect(t.subtasks).toEqual([]);
    t = acceptSuggestion(t, "Book transport");
    expect(t.subtasks.map((s) => s.title)).toEqual(["Book transport"]);
    expect(t.suggestions).toEqual(["Pack"]);
    t = dismissSuggestion(t, "Pack");
    expect(t.suggestions).toEqual([]);
    expect(dismissAllSuggestions(base({ suggestions: ["a", "b"] })).suggestions).toEqual([]);
  });
  it("steps can be checked off", () => {
    let t = addStep(addStep(base(), "one"), "two");
    t = toggleStep(t, t.subtasks[0].id);
    expect(stepsDone(t)).toBe(1);
  });
});

describe("decisions", () => {
  const withDecision = () =>
    base({
      decision: {
        options: ["New phone", "Repair"],
        recommendation: "Repair",
        reason: "Only the screen",
        chosen: null,
      },
    });
  it("choosing settles it, choosing again undoes it, the suggestion is kept", () => {
    let t = chooseOption(withDecision(), "Repair");
    expect(t.decision).toMatchObject({ chosen: "Repair", recommendation: "Repair" });
    t = chooseOption(t, "Repair");
    expect(t.decision?.chosen).toBeNull();
    t = chooseOption(t, "New phone"); // free to disagree with the suggestion
    expect(t.decision?.chosen).toBe("New phone");
  });
  it("does nothing on a task without a decision", () => {
    const t = base();
    expect(chooseOption(t, "x")).toBe(t);
  });
});
