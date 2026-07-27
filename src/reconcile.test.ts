import { describe, expect, it } from "vitest";
import { planWorkspaceFolders, workspaceFoldersEqual } from "./reconcile.ts";

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
