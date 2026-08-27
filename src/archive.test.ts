import { describe, expect, it } from "vitest";
import { partitionArchivedWorktrees } from "./archive.ts";

describe("partitionArchivedWorktrees", () => {
  const main = { path: "/repo" };
  const linked = [{ path: "/trees/alpha" }, { path: "/trees/beta" }];

  it("separates archived linked worktrees from active worktrees", () => {
    expect(partitionArchivedWorktrees(main, linked, ["/trees/beta"])).toEqual({
      all: [main, ...linked],
      active: [main, linked[0]],
      archived: [linked[1]],
      archivedPaths: ["/trees/beta"],
    });
  });

  it("never archives main and prunes stale, duplicate, and invalid paths", () => {
    expect(
      partitionArchivedWorktrees(main, linked, [
        "/repo",
        "/trees/alpha",
        "/trees/alpha/../alpha",
        "/trees/deleted",
        null,
      ]),
    ).toEqual({
      all: [main, ...linked],
      active: [main, linked[1]],
      archived: [linked[0]],
      archivedPaths: ["/trees/alpha"],
    });
  });
});
