import { describe, expect, it } from "vitest";
import {
  addGitignoreEntry,
  focusedWorkspaceFolders,
  focusedWorktreeName,
  resolveWorkspaceFileName,
  workspaceFileContent,
} from "./bootstrap.ts";

describe("resolveWorkspaceFileName", () => {
  it("expands the workspace folder basename variable", () => {
    expect(
      resolveWorkspaceFileName(
        "${workspaceFolderBasename}.wt.code-workspace",
        "genotype",
      ),
    ).toBe("genotype.wt.code-workspace");
  });

  it("preserves custom names without variables", () => {
    expect(
      resolveWorkspaceFileName("development.code-workspace", "genotype"),
    ).toBe("development.code-workspace");
  });
});

describe("workspaceFileContent", () => {
  it("creates relative roots for internal and external worktrees", () => {
    expect(
      JSON.parse(
        workspaceFileContent("/repo", "main", [
          "/repo/trees/alpha",
          "/external/beta",
        ]),
      ),
    ).toEqual({
      folders: [
        { path: ".", name: "main" },
        { path: "trees/alpha", name: "alpha" },
        { path: "../external/beta", name: "beta" },
      ],
    });
  });
});

describe("focusedWorkspaceFolders", () => {
  it("reads a focused worktree from a JSONC workspace", () => {
    expect(
      focusedWorkspaceFolders(
        `{
          // Focus is persisted in the folder name.
          "folders": [{ "path": "../feature", "name": "feature (focused)" }]
        }`,
        "/repo/main",
      ),
    ).toEqual([{ path: "/repo/feature", name: "feature" }]);
  });

  it("reads multiple focused worktrees", () => {
    expect(
      focusedWorkspaceFolders(
        `{ "folders": [
          { "path": "../alpha", "name": "alpha (focused)" },
          { "path": "../beta", "name": "beta (focused)" }
        ] }`,
        "/repo/main",
      ),
    ).toEqual([
      { path: "/repo/alpha", name: "alpha" },
      { path: "/repo/beta", name: "beta" },
    ]);
  });

  it("ignores ordinary workspace folders", () => {
    expect(
      focusedWorkspaceFolders(
        `{ "folders": [{ "path": ".", "name": "main" }] }`,
        "/repo/main",
      ),
    ).toEqual([]);
  });
});

describe("focusedWorktreeName", () => {
  it("adds the persisted focus marker", () => {
    expect(focusedWorktreeName("feature")).toBe("feature (focused)");
  });
});

describe("addGitignoreEntry", () => {
  it("appends the managed block with a separating newline", () => {
    expect(
      addGitignoreEntry("node_modules/", "genotype.orchardist.code-workspace"),
    ).toBe(
      "node_modules/\n# Managed by VS Code Orchardist extension:\ngenotype.orchardist.code-workspace\n",
    );
  });

  it("does not duplicate an existing entry", () => {
    const current =
      "# Managed by VS Code Orchardist extension:\ngenotype.orchardist.code-workspace\n";
    expect(
      addGitignoreEntry(current, "genotype.orchardist.code-workspace"),
    ).toBe(current);
  });
});
