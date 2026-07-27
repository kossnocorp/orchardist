import { describe, expect, it } from "vitest";
import {
  planDirectoryExclusion,
  planWorkspaceFolders,
  workspaceFoldersEqual,
} from "./reconcile.ts";

describe("planDirectoryExclusion", () => {
  it("adds the managed directory while preserving existing exclusions", () => {
    expect(
      planDirectoryExclusion({ "**/.git": true }, undefined, "trees"),
    ).toEqual({
      exclude: { "**/.git": true, trees: true },
      managed: { pattern: "trees", previousValue: null },
    });
  });

  it("removes its old entry when the managed directory changes", () => {
    expect(
      planDirectoryExclusion(
        { trees: true, "**/.git": true },
        { pattern: "trees", previousValue: null },
        "worktrees",
      ),
    ).toEqual({
      exclude: { "**/.git": true, worktrees: true },
      managed: { pattern: "worktrees", previousValue: null },
    });
  });

  it("reapplies an existing managed exclusion when it is missing", () => {
    expect(
      planDirectoryExclusion(
        {},
        { pattern: "trees", previousValue: null },
        "trees",
      ),
    ).toEqual({
      exclude: { trees: true },
      managed: { pattern: "trees", previousValue: null },
    });
  });

  it("restores a previous value and preserves later user changes", () => {
    expect(
      planDirectoryExclusion(
        { trees: true },
        { pattern: "trees", previousValue: false },
        "worktrees",
      ).exclude,
    ).toEqual({ trees: false, worktrees: true });

    expect(
      planDirectoryExclusion(
        { trees: false },
        { pattern: "trees", previousValue: null },
        "worktrees",
      ).exclude,
    ).toEqual({ trees: false, worktrees: true });
  });
});

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
        ["file:///repo/trees"],
        [],
      ),
    ).toEqual([
      { uri: "file:///repo", name: "main" },
      { uri: "file:///shared", name: "shared" },
    ]);
  });

  it("removes folders from the previously configured directory", () => {
    expect(
      planWorkspaceFolders(
        [
          { uri: "file:///repo", name: "main" },
          { uri: "file:///repo/old/alpha", name: "alpha" },
        ],
        "file:///repo",
        "main",
        ["file:///repo/old", "file:///repo/new"],
        [{ uri: "file:///repo/new/beta", name: "beta" }],
      ),
    ).toEqual([
      { uri: "file:///repo", name: "main" },
      { uri: "file:///repo/new/beta", name: "beta" },
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
