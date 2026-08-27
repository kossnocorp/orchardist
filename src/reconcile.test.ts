import { describe, expect, it } from "vitest";
import {
  inferFocusedUris,
  planFocusedWorkspaceFolders,
  planWorkspaceFolders,
  workspaceFoldersEqual,
} from "./reconcile.ts";

describe("planWorkspaceFolders", () => {
  it("renames the main folder and adds desired directories in order", () => {
    expect(
      planWorkspaceFolders(
        [{ uri: "file:///repo", name: "repo" }],
        "file:///repo",
        "main",
        ["file:///repo/trees"],
        [
          { uri: "file:///repo/trees/alpha", name: "alpha" },
          { uri: "file:///repo/trees/beta", name: "beta" },
        ],
      ),
    ).toEqual([
      { uri: "file:///repo", name: "main" },
      { uri: "file:///repo/trees/alpha", name: "alpha" },
      { uri: "file:///repo/trees/beta", name: "beta" },
    ]);
  });

  it("removes deleted directories while preserving unrelated folders", () => {
    expect(
      planWorkspaceFolders(
        [
          { uri: "file:///repo", name: "main" },
          { uri: "file:///repo/trees/deleted", name: "deleted" },
          { uri: "file:///shared", name: "shared" },
        ],
        "file:///repo",
        "main",
        ["file:///repo/trees/deleted"],
        [],
      ),
    ).toEqual([
      { uri: "file:///repo", name: "main" },
      { uri: "file:///shared", name: "shared" },
    ]);
  });

  it("removes archived worktrees while preserving unrelated folders", () => {
    expect(
      planWorkspaceFolders(
        [
          { uri: "file:///repo", name: "main" },
          { uri: "file:///trees/active", name: "active" },
          { uri: "file:///trees/archived", name: "archived" },
          { uri: "file:///shared", name: "shared" },
        ],
        "file:///repo",
        "main",
        ["file:///trees/active", "file:///trees/archived"],
        [{ uri: "file:///trees/active", name: "active" }],
      ),
    ).toEqual([
      { uri: "file:///repo", name: "main" },
      { uri: "file:///shared", name: "shared" },
      { uri: "file:///trees/active", name: "active" },
    ]);
  });

  it("removes previously managed external worktrees by exact URI", () => {
    expect(
      planWorkspaceFolders(
        [
          { uri: "file:///repo", name: "main" },
          { uri: "file:///external/alpha", name: "alpha" },
          { uri: "file:///external/manual", name: "manual" },
        ],
        "file:///repo",
        "main",
        ["file:///external/alpha"],
        [{ uri: "file:///elsewhere/beta", name: "beta" }],
      ),
    ).toEqual([
      { uri: "file:///repo", name: "main" },
      { uri: "file:///external/manual", name: "manual" },
      { uri: "file:///elsewhere/beta", name: "beta" },
    ]);
  });

  it("restores the main folder after focusing a linked worktree", () => {
    expect(
      planWorkspaceFolders(
        [
          {
            uri: "file:///repo/trees/alpha",
            name: "alpha (focused)",
          },
        ],
        "file:///repo",
        "main",
        ["file:///repo/trees/alpha", "file:///repo/trees/beta"],
        [
          { uri: "file:///repo/trees/alpha", name: "alpha" },
          { uri: "file:///repo/trees/beta", name: "beta" },
        ],
      ),
    ).toEqual([
      { uri: "file:///repo", name: "main" },
      { uri: "file:///repo/trees/alpha", name: "alpha" },
      { uri: "file:///repo/trees/beta", name: "beta" },
    ]);
  });

  it("restores all worktrees after focusing multiple worktrees", () => {
    expect(
      planWorkspaceFolders(
        [
          { uri: "file:///repo/trees/alpha", name: "alpha (focused)" },
          { uri: "file:///repo/trees/beta", name: "beta (focused)" },
        ],
        "file:///repo",
        "main",
        ["file:///repo/trees/alpha", "file:///repo/trees/beta"],
        [
          { uri: "file:///repo/trees/alpha", name: "alpha" },
          { uri: "file:///repo/trees/beta", name: "beta" },
        ],
      ),
    ).toEqual([
      { uri: "file:///repo", name: "main" },
      { uri: "file:///repo/trees/alpha", name: "alpha" },
      { uri: "file:///repo/trees/beta", name: "beta" },
    ]);
  });
});

describe("workspaceFoldersEqual", () => {
  it("compares both URI and display name in order", () => {
    const folders = [{ uri: "file:///repo", name: "main" }];

    expect(workspaceFoldersEqual(folders, folders)).toBe(true);
    expect(
      workspaceFoldersEqual(folders, [
        { uri: "file:///repo", name: "renamed" },
      ]),
    ).toBe(false);
  });
});

describe("inferFocusedUris", () => {
  const available = ["file:///repo", "file:///alpha", "file:///beta"];

  it("infers single and multiple focus from proper subsets", () => {
    expect(inferFocusedUris(["file:///alpha"], available)).toEqual([
      "file:///alpha",
    ]);
    expect(
      inferFocusedUris(["file:///repo", "file:///beta"], available),
    ).toEqual(["file:///repo", "file:///beta"]);
  });

  it("treats all, none, and one out of one as unfocused", () => {
    expect(inferFocusedUris(available, available)).toEqual([]);
    expect(inferFocusedUris([], available)).toEqual([]);
    expect(inferFocusedUris(["file:///repo"], ["file:///repo"])).toEqual([]);
  });

  it("ignores unrelated folders", () => {
    expect(
      inferFocusedUris(["file:///alpha", "file:///shared"], available),
    ).toEqual(["file:///alpha"]);
  });

  it("does not infer focus when every non-archived worktree is present", () => {
    expect(
      inferFocusedUris(
        ["file:///repo", "file:///alpha"],
        ["file:///repo", "file:///alpha"],
      ),
    ).toEqual([]);
  });
});

describe("planFocusedWorkspaceFolders", () => {
  it("preserves unrelated folders and canonicalizes legacy managed names", () => {
    expect(
      planFocusedWorkspaceFolders(
        [
          { uri: "file:///alpha", name: "alpha (focused)" },
          { uri: "file:///shared", name: "shared (focused)" },
        ],
        ["file:///repo", "file:///alpha", "file:///beta"],
        ["file:///alpha", "file:///beta"],
        [{ uri: "file:///alpha", name: "alpha" }],
      ),
    ).toEqual([
      { uri: "file:///alpha", name: "alpha" },
      { uri: "file:///shared", name: "shared (focused)" },
    ]);
  });

  it("removes stale previously managed worktrees", () => {
    expect(
      planFocusedWorkspaceFolders(
        [
          { uri: "file:///alpha", name: "alpha" },
          { uri: "file:///deleted", name: "deleted" },
        ],
        ["file:///repo", "file:///alpha"],
        ["file:///alpha", "file:///deleted"],
        [{ uri: "file:///alpha", name: "alpha" }],
      ),
    ).toEqual([{ uri: "file:///alpha", name: "alpha" }]);
  });
});
