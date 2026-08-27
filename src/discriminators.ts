import * as path from "node:path";
import { applyEdits, modify, parse } from "jsonc-parser";

export const defaultDiscriminatorSymbols = [
  "🟢",
  "🔵",
  "🟣",
  "🟡",
  "🔴",
  "⚪️",
  "🟠",
  "🟤",
  "⚫️",
] as const;

export const discriminatorHistorySetting = "orchardist.discriminatorHistory";
const discriminatorPatternsSetting = "orchardist.discriminatorPatterns";
const fileExcludePatternsSetting = "orchardist.fileExcludePatterns";
const archivedWorktreesSetting = "orchardist.archivedWorktrees";

export interface WorktreeIdentity {
  readonly path: string;
  readonly name: string;
}

export interface Discriminator {
  readonly path: string;
  readonly name: string;
  readonly symbol: string;
}

export interface DiscriminatorPlan {
  readonly discriminators: readonly Discriminator[];
  readonly history: readonly (string | null)[];
}

export function worktreeName(
  worktreePath: string,
  mainPath: string,
  mainName: string,
  projectName?: string,
): string {
  if (path.resolve(worktreePath) === path.resolve(mainPath)) return mainName;

  const basename = path.basename(worktreePath);
  for (const name of [projectName, path.basename(mainPath)]) {
    const prefix = name ? `${name}.` : "";
    if (prefix && basename.startsWith(prefix)) {
      return basename.slice(prefix.length);
    }
  }
  return basename;
}

export function sortWorktrees(
  mainPath: string,
  mainName: string,
  linkedPaths: readonly string[],
  projectName?: string,
): readonly WorktreeIdentity[] {
  return [
    { path: mainPath, name: mainName },
    ...linkedPaths
      .map((worktreePath) => ({
        path: worktreePath,
        name: worktreeName(worktreePath, mainPath, mainName, projectName),
      }))
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) ||
          left.path.localeCompare(right.path),
      ),
  ];
}

export function assignDiscriminators(
  worktrees: readonly WorktreeIdentity[],
  previousHistory: readonly unknown[],
  symbols: readonly string[],
): DiscriminatorPlan {
  const availableSymbols = symbols.filter((symbol) => symbol.length > 0);
  if (availableSymbols.length === 0) {
    return { discriminators: [], history: [] };
  }

  const activeNames = new Set(worktrees.map((worktree) => worktree.name));
  const history: (string | null)[] = previousHistory.map((name) =>
    typeof name === "string" && activeNames.has(name) ? name : null,
  );
  const mainName = worktrees[0]?.name;
  const mainIndex = mainName ? history.indexOf(mainName) : -1;
  if (mainName && mainIndex !== 0) {
    if (mainIndex > 0) history[mainIndex] = history[0] ?? null;
    history[0] = mainName;
  }
  const assignedNames = new Set(
    history.flatMap((name) => (name ? [name] : [])),
  );

  for (const worktree of worktrees) {
    if (assignedNames.has(worktree.name)) continue;

    const completeLayers = Math.floor(history.length / availableSymbols.length);
    const hasPartialLayer = history.length % availableSymbols.length !== 0;
    const reusableIndex = hasPartialLayer
      ? -1
      : history.findIndex((name) => name === null);
    if (reusableIndex >= 0 && completeLayers > 0) {
      history[reusableIndex] = worktree.name;
    } else {
      history.push(worktree.name);
    }
    assignedNames.add(worktree.name);
  }

  const indexByName = new Map(
    history.flatMap((name, index) => (name ? [[name, index] as const] : [])),
  );
  return {
    history,
    discriminators: worktrees.flatMap((worktree) => {
      const index = indexByName.get(worktree.name);
      return index === undefined
        ? []
        : [
            {
              ...worktree,
              symbol: availableSymbols[index % availableSymbols.length]!,
            },
          ];
    }),
  };
}

export function discriminatorEnvironment(
  discriminators: readonly Discriminator[],
): string {
  return discriminators
    .map(({ path: worktreePath, name, symbol }) =>
      [worktreePath, name, symbol, ""].join(";"),
    )
    .join("");
}

export function readDiscriminatorHistory(content: string): readonly unknown[] {
  const workspace = parse(content) as {
    settings?: Record<string, unknown>;
  } | null;
  const history = workspace?.settings?.[discriminatorHistorySetting];
  return Array.isArray(history) ? history : [];
}

export function updateDiscriminatorSettings(
  content: string,
  discriminators: readonly Discriminator[],
  history: readonly (string | null)[] = [],
  visualsEnabled = true,
  quickOpenExcludedPaths: readonly string[] = [],
  archivedWorktreePaths?: readonly string[],
): string {
  const workspace = parse(content) as {
    settings?: Record<string, unknown>;
  } | null;
  const settings = workspace?.settings ?? {};
  const previousPatterns = settings[discriminatorPatternsSetting];
  const ownedPatterns = Array.isArray(previousPatterns)
    ? previousPatterns.filter(
        (pattern): pattern is string => typeof pattern === "string",
      )
    : [];
  const customPatterns = settings["workbench.editor.customLabels.patterns"];
  const nextCustomPatterns =
    customPatterns &&
    typeof customPatterns === "object" &&
    !Array.isArray(customPatterns)
      ? { ...(customPatterns as Record<string, unknown>) }
      : {};
  for (const pattern of ownedPatterns) delete nextCustomPatterns[pattern];

  const changes: [string[], unknown][] = visualsEnabled
    ? (() => {
        const patterns = discriminators.flatMap(
          ({ path: worktreePath, symbol }) => {
            const dotfilePattern = normalizePatternPath(
              path.join(worktreePath, ".*"),
            );
            const generalPattern = normalizePatternPath(
              path.join(worktreePath, "**"),
            );
            nextCustomPatterns[dotfilePattern] = `${symbol} \${filename}`;
            nextCustomPatterns[generalPattern] =
              `${symbol} \${filename}.\${extname}`;
            return [dotfilePattern, generalPattern];
          },
        );
        return [
          [["settings", discriminatorHistorySetting], history],
          [["settings", discriminatorPatternsSetting], patterns],
          [["settings", "workbench.editor.customLabels.enabled"], true],
          [
            ["settings", "workbench.editor.customLabels.patterns"],
            nextCustomPatterns,
          ],
        ];
      })()
    : ownedPatterns.length > 0
      ? [
          [["settings", discriminatorPatternsSetting], undefined],
          [["settings", "workbench.editor.customLabels.enabled"], undefined],
          [
            ["settings", "workbench.editor.customLabels.patterns"],
            Object.keys(nextCustomPatterns).length > 0
              ? nextCustomPatterns
              : undefined,
          ],
        ]
      : [];
  changes.push(
    [["settings", discriminatorHistorySetting], history],
    [
      ["settings", "terminal.integrated.tabs.title"],
      "${workspaceFolderName} ${separator} ${process}",
    ],
  );

  const previousQuickOpenPatterns = settings[fileExcludePatternsSetting];
  const ownedQuickOpenPatterns = Array.isArray(previousQuickOpenPatterns)
    ? previousQuickOpenPatterns.filter(
        (pattern): pattern is string => typeof pattern === "string",
      )
    : [];
  const searchExclude = settings["search.exclude"];
  const nextSearchExclude =
    searchExclude &&
    typeof searchExclude === "object" &&
    !Array.isArray(searchExclude)
      ? { ...(searchExclude as Record<string, unknown>) }
      : {};
  for (const pattern of ownedQuickOpenPatterns)
    delete nextSearchExclude[pattern];
  const quickOpenPatterns = quickOpenExcludedPaths.map((worktreePath) =>
    normalizePatternPath(path.join(worktreePath, "**")),
  );
  for (const pattern of quickOpenPatterns) nextSearchExclude[pattern] = true;
  changes.push(
    [
      ["settings", fileExcludePatternsSetting],
      quickOpenPatterns.length > 0 ? quickOpenPatterns : undefined,
    ],
    [
      ["settings", "search.exclude"],
      Object.keys(nextSearchExclude).length > 0 ? nextSearchExclude : undefined,
    ],
  );
  if (archivedWorktreePaths !== undefined) {
    changes.push([
      ["settings", archivedWorktreesSetting],
      archivedWorktreePaths,
    ]);
  }

  let next = content;
  for (const [jsonPath, value] of changes) {
    next = applyEdits(
      next,
      modify(next, jsonPath, value, { formattingOptions }),
    );
  }
  return next;
}

const formattingOptions = {
  insertSpaces: true,
  tabSize: 2,
  eol: "\n",
} as const;

function normalizePatternPath(patternPath: string): string {
  return patternPath.split(path.sep).join("/");
}
