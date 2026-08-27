import { describe, expect, it } from "vitest";
import {
  assignDiscriminators,
  discriminatorEnvironment,
  readDiscriminatorHistory,
  sortWorktrees,
  updateDiscriminatorSettings,
  worktreeName,
} from "./discriminators.ts";

describe("worktree names", () => {
  it("strips the main directory prefix from linked worktrees", () => {
    expect(
      worktreeName("/code/alumnium.feature-a", "/code/alumnium", "main"),
    ).toBe("feature-a");
    expect(worktreeName("/worktrees/runner", "/code/alumnium", "main")).toBe(
      "runner",
    );
    expect(
      worktreeName(
        "/worktrees/alumnium.ci-pass-threshold",
        "/code/main",
        "main",
        "alumnium",
      ),
    ).toBe("ci-pass-threshold");
  });

  it("sorts linked worktrees while keeping main first", () => {
    expect(
      sortWorktrees(
        "/code/alumnium",
        "main",
        ["/code/alumnium.zeta", "/worktrees/alpha"],
        "alumnium",
      ),
    ).toEqual([
      { path: "/code/alumnium", name: "main" },
      { path: "/worktrees/alpha", name: "alpha" },
      { path: "/code/alumnium.zeta", name: "zeta" },
    ]);
  });
});

describe("assignDiscriminators", () => {
  const worktree = (name: string) => ({ path: `/repo/${name}`, name });

  it("preserves slots and appends while the current layer has room", () => {
    expect(
      assignDiscriminators(
        [worktree("main"), worktree("feature-b"), worktree("feature-c")],
        ["main", "feature-a", "feature-b"],
        ["green", "blue", "purple", "yellow"],
      ),
    ).toEqual({
      history: ["main", null, "feature-b", "feature-c"],
      discriminators: [
        { ...worktree("main"), symbol: "green" },
        { ...worktree("feature-b"), symbol: "purple" },
        { ...worktree("feature-c"), symbol: "yellow" },
      ],
    });
  });

  it("reuses the first null after completing a symbol layer", () => {
    expect(
      assignDiscriminators(
        [worktree("main"), worktree("feature-c")],
        ["main", "feature-a", null],
        ["green", "blue", "purple"],
      ).history,
    ).toEqual(["main", "feature-c", null]);
  });

  it("repeats symbols in additional layers", () => {
    const plan = assignDiscriminators(
      [worktree("main"), worktree("a"), worktree("b")],
      [],
      ["green", "blue"],
    );
    expect(plan.discriminators.map(({ symbol }) => symbol)).toEqual([
      "green",
      "blue",
      "green",
    ]);
  });

  it("repairs history so main always receives the first symbol", () => {
    const plan = assignDiscriminators(
      [worktree("main"), worktree("feature")],
      ["feature", "main"],
      ["green", "blue"],
    );
    expect(plan.history).toEqual(["main", "feature"]);
    expect(plan.discriminators.map(({ symbol }) => symbol)).toEqual([
      "green",
      "blue",
    ]);
  });
});

describe("workspace discriminator settings", () => {
  it("adds settings and preserves user patterns", () => {
    const next = updateDiscriminatorSettings(
      `{
        // Keep this comment.
        "folders": [],
        "settings": {
          "workbench.editor.customLabels.patterns": { "**/*.test.ts": "test" }
        }
      }`,
      [{ path: "/repo/main", name: "main", symbol: "green" }],
      ["main"],
    );
    const parsed = JSON.parse(next.replace(/\/\/ Keep this comment\.\n/, ""));
    expect(next).toContain("// Keep this comment.");
    expect(parsed.settings).toMatchObject({
      "orchardist.discriminatorHistory": ["main"],
      "orchardist.discriminatorPatterns": ["/repo/main/.*", "/repo/main/**"],
      "terminal.integrated.tabs.title":
        "${workspaceFolderName} ${separator} ${process}",
      "workbench.editor.customLabels.enabled": true,
      "workbench.editor.customLabels.patterns": {
        "**/*.test.ts": "test",
        "/repo/main/.*": "green ${filename}",
        "/repo/main/**": "green ${filename}.${extname}",
      },
    });
    expect(
      Object.keys(parsed.settings["workbench.editor.customLabels.patterns"]),
    ).toEqual(["**/*.test.ts", "/repo/main/.*", "/repo/main/**"]);
    expect(readDiscriminatorHistory(next)).toEqual(["main"]);
  });

  it("removes owned settings and patterns when disabled", () => {
    const enabled = updateDiscriminatorSettings(
      `{ "folders": [], "settings": {
        "workbench.editor.customLabels.patterns": { "custom": "label" }
      } }`,
      [{ path: "/repo/main", name: "main", symbol: "green" }],
      ["main"],
    );
    const disabled = updateDiscriminatorSettings(
      enabled,
      [{ path: "/repo/main", name: "main", symbol: "green" }],
      ["main"],
      false,
    );
    const parsed = JSON.parse(disabled);
    expect(parsed.settings).toEqual({
      "orchardist.discriminatorHistory": ["main"],
      "terminal.integrated.tabs.title":
        "${workspaceFolderName} ${separator} ${process}",
      "workbench.editor.customLabels.patterns": { custom: "label" },
    });
  });

  it("filters unfocused worktrees while preserving user search exclusions", () => {
    const filtered = updateDiscriminatorSettings(
      `{ "folders": [], "settings": {
        "search.exclude": { "**/generated/**": true }
      } }`,
      [],
      [],
      false,
      ["/repo/feature", "/worktrees/other"],
    );
    const parsed = JSON.parse(filtered);
    expect(parsed.settings).toMatchObject({
      "orchardist.fileExcludePatterns": [
        "/repo/feature/**",
        "/worktrees/other/**",
      ],
      "search.exclude": {
        "**/generated/**": true,
        "/repo/feature/**": true,
        "/worktrees/other/**": true,
      },
    });

    const restored = updateDiscriminatorSettings(filtered, [], [], false);
    expect(JSON.parse(restored).settings).toMatchObject({
      "search.exclude": { "**/generated/**": true },
    });
    expect(
      JSON.parse(restored).settings["orchardist.fileExcludePatterns"],
    ).toBeUndefined();
  });

  it("replaces only previously owned file exclusions", () => {
    const next = updateDiscriminatorSettings(
      `{ "folders": [], "settings": {
        "orchardist.fileExcludePatterns": ["/repo/old/**"],
        "search.exclude": {
          "/repo/old/**": true,
          "/repo/user/**": false
        }
      } }`,
      [],
      [],
      false,
      ["/repo/new"],
    );
    expect(JSON.parse(next).settings["search.exclude"]).toEqual({
      "/repo/user/**": false,
      "/repo/new/**": true,
    });
  });

  it("persists archived worktrees, including an explicit empty list", () => {
    const archived = updateDiscriminatorSettings(
      `{ "folders": [] }`,
      [],
      [],
      false,
      [],
      ["/trees/alpha"],
    );
    expect(
      JSON.parse(archived).settings["orchardist.archivedWorktrees"],
    ).toEqual(["/trees/alpha"]);

    const restored = updateDiscriminatorSettings(
      archived,
      [],
      [],
      false,
      [],
      [],
    );
    expect(
      JSON.parse(restored).settings["orchardist.archivedWorktrees"],
    ).toEqual([]);
  });
});

it("serializes terminal environment records", () => {
  expect(
    discriminatorEnvironment([
      { path: "/repo/main", name: "main", symbol: "green" },
      { path: "/repo/feature", name: "feature", symbol: "blue" },
    ]),
  ).toBe("/repo/main;main;green;/repo/feature;feature;blue;");
});
