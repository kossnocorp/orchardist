import { describe, expect, it } from "vitest";
import { parseWorktreePorcelain } from "./git.ts";

describe("parseWorktreePorcelain", () => {
  it("parses main, detached, locked, external, and unusual worktree paths", () => {
    const output = [
      "worktree /repo",
      "HEAD abc",
      "branch refs/heads/main",
      "",
      "worktree /repo/trees/feature one",
      "HEAD def",
      "detached",
      "",
      "worktree /external/line\nbreak",
      "HEAD 123",
      "branch refs/heads/external",
      "locked portable drive",
      "",
      "",
    ].join("\0");

    expect(parseWorktreePorcelain(output)).toEqual([
      {
        path: "/repo",
        branch: "refs/heads/main",
        detached: false,
        locked: false,
      },
      {
        path: "/repo/trees/feature one",
        detached: true,
        locked: false,
      },
      {
        path: "/external/line\nbreak",
        branch: "refs/heads/external",
        detached: false,
        locked: true,
      },
    ]);
  });

  it("skips bare and prunable records", () => {
    const output = [
      "worktree /repo",
      "HEAD abc",
      "",
      "worktree /bare",
      "bare",
      "",
      "worktree /missing",
      "prunable gitdir file points to non-existent location",
      "",
      "worktree /valid",
      "HEAD def",
      "",
      "",
    ].join("\0");

    expect(parseWorktreePorcelain(output).map((entry) => entry.path)).toEqual([
      "/repo",
      "/valid",
    ]);
  });
});
