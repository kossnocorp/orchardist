import { describe, expect, it } from "vitest";
import {
  addGitignoreEntry,
  parseWorkspaceFolders,
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
  it("creates a workspace with only the main worktree", () => {
    expect(JSON.parse(workspaceFileContent("/repo", "main", []))).toEqual({
      folders: [{ path: ".", name: "main" }],
    });
  });

  it("creates relative roots for internal and external worktrees", () => {
    expect(
      JSON.parse(
        workspaceFileContent("/repo", "main", [
          { path: "/repo/trees/alpha" },
          { path: "/external/beta" },
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

  it("persists terminal assignments without visual discriminators", () => {
    expect(
      JSON.parse(
        workspaceFileContent(
          "/repo",
          "main",
          [{ path: "/repo/feature", name: "feature" }],
          {
            discriminators: [
              { path: "/repo", name: "main", symbol: "green" },
              { path: "/repo/feature", name: "feature", symbol: "blue" },
            ],
            history: ["main", "feature"],
          },
          false,
        ),
      ),
    ).toEqual({
      folders: [
        { path: ".", name: "main" },
        { path: "feature", name: "feature" },
      ],
      settings: {
        "orchardist.discriminatorHistory": ["main", "feature"],
        "terminal.integrated.tabs.title":
          "${workspaceFolderName} ${separator} ${process}",
      },
    });
  });
});

describe("parseWorkspaceFolders", () => {
  it("reads workspace folders from JSONC", () => {
    expect(
      parseWorkspaceFolders(
        `{
          // Folder names do not determine focus.
          "folders": [{ "path": "../feature", "name": "feature" }]
        }`,
        "/repo/main",
      ),
    ).toEqual([{ path: "/repo/feature", name: "feature" }]);
  });

  it("reads multiple folders and preserves legacy names", () => {
    expect(
      parseWorkspaceFolders(
        `{ "folders": [
          { "path": "../alpha", "name": "alpha (focused)" },
          { "path": "../beta" }
        ] }`,
        "/repo/main",
      ),
    ).toEqual([
      { path: "/repo/alpha", name: "alpha (focused)" },
      { path: "/repo/beta", name: undefined },
    ]);
  });

  it("ignores malformed workspace folders", () => {
    expect(
      parseWorkspaceFolders(
        `{ "folders": [{ "name": "missing-path" }, { "path": 42 }] }`,
        "/repo/main",
      ),
    ).toEqual([]);
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
