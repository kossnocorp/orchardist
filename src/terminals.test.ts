import { describe, expect, it } from "vitest";
import { terminalColor } from "./terminals.ts";

describe("terminalColor", () => {
  const discriminators = [
    { path: "/repo", name: "main" },
    { path: "/repo.feature", name: "feature" },
  ];

  it("maps assignment order to fixed ANSI theme colors", () => {
    expect(
      terminalColor("/repo.feature", ["main", "feature"], discriminators),
    ).toBe("terminal.ansiBlue");
  });

  it("repeats the fixed color order", () => {
    expect(
      terminalColor(
        "/repo.feature",
        ["main", null, null, null, null, null, null, null, null, "feature"],
        discriminators,
      ),
    ).toBe("terminal.ansiGreen");
  });

  it("returns undefined for an unassigned worktree", () => {
    expect(terminalColor("/other", ["main"], discriminators)).toBeUndefined();
  });
});
