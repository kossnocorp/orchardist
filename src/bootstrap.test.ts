import { describe, expect, it } from "vitest";
import {
  addGitignoreEntry,
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
