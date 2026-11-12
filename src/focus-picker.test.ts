import { beforeEach, describe, expect, it, vi } from "vitest";

const { showQuickPick } = vi.hoisted(() => ({ showQuickPick: vi.fn() }));
vi.mock("vscode", () => ({
  window: { showQuickPick },
  QuickPickItemKind: { Separator: -1 },
}));
import { showFocusPicker } from "./focus-picker.ts";

const trees = ["a", "b", "c"].map((path) => ({
  path,
  label: path,
  description: path,
}));
const show = (multiple = true) =>
  showFocusPicker(trees, multiple, "focusMultiple", "unfocus");

beforeEach(() => showQuickPick.mockReset());

describe("showFocusPicker", () => {
  it("shows Select Focused, all trees, and Unfocus in a native single-select menu", async () => {
    await show();
    const [items, options] = showQuickPick.mock.calls[0]!;
    expect(items).toEqual([
      { label: "$(list-selection) Select Focused", command: "focusMultiple" },
      { label: "Focus one", kind: -1 },
      ...trees,
      { label: "", kind: -1 },
      { label: "$(close) Unfocus", command: "unfocus" },
    ]);
    expect(options.canPickMany).toBeUndefined();
  });

  it("preserves the single focus menu order", async () => {
    await show(false);
    expect(showQuickPick.mock.calls[0]![0]).toEqual([
      ...trees,
      { label: "", kind: -1 },
      { label: "$(list-selection) Choose Multiple", command: "focusMultiple" },
      { label: "$(close) Unfocus", command: "unfocus" },
    ]);
  });

  it.each([
    { label: "Select Focused", command: "focusMultiple" },
    trees[1]!,
    { label: "Unfocus", command: "unfocus" },
    undefined,
  ])(
    "returns the selected action, tree, or cancellation: %j",
    async (selected) => {
      showQuickPick.mockResolvedValueOnce(selected);
      expect(await show()).toBe(selected);
    },
  );
});
