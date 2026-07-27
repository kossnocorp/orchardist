import { describe, expect, it } from "vitest";
import { addGitignoreEntry, workspaceFileContent } from "./bootstrap.ts";

describe("workspaceFileContent", () => {
  it("creates a named main root and detected worktree roots", () => {
    expect(
      JSON.parse(workspaceFileContent("./trees", "main", ["alpha"])),
    ).toEqual({
      folders: [
        { path: ".", name: "main" },
        { path: "trees/alpha", name: "alpha" },
      ],
    });
  });
});

describe("addGitignoreEntry", () => {
  it("appends the managed block with a separating newline", () => {
    expect(addGitignoreEntry("node_modules/", "genotype.code-workspace")).toBe(
      "node_modules/\n# Managed by VS Code Orchardist extension:\ngenotype.code-workspace\n",
    );
  });

  it("does not duplicate an existing entry", () => {
    const current =
      "# Managed by VS Code Orchardist extension:\ngenotype.code-workspace\n";
    expect(addGitignoreEntry(current, "genotype.code-workspace")).toBe(current);
  });
});
