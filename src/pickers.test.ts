import { describe, expect, it } from "vitest";
import { worktreePickerItems } from "./pickers.ts";

describe("worktreePickerItems", () => {
  const identities = [
    { path: "/repo", name: "main", symbol: "green" },
    { path: "/trees/repo.feature", name: "feature", symbol: "blue" },
  ];

  it("uses normalized names and full paths", () => {
    expect(worktreePickerItems(identities, false)).toEqual([
      { label: "main", description: "/repo", path: "/repo" },
      {
        label: "feature",
        description: "/trees/repo.feature",
        path: "/trees/repo.feature",
      },
    ]);
  });

  it("adds assigned symbols when visuals are enabled", () => {
    expect(
      worktreePickerItems(identities, true).map(({ label }) => label),
    ).toEqual(["green main", "blue feature"]);
  });
});
