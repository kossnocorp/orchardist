import * as path from "node:path";
import { parse } from "jsonc-parser";
import {
  type Discriminator,
  updateDiscriminatorSettings,
} from "./discriminators.ts";

const workspaceFolderBasenameVariable = "${workspaceFolderBasename}";
export interface ParsedWorkspaceFolder {
  readonly path: string;
  readonly name: string | undefined;
}

export function resolveWorkspaceFileName(
  template: string,
  workspaceFolderBasename: string,
): string {
  return template.replaceAll(
    workspaceFolderBasenameVariable,
    workspaceFolderBasename,
  );
}

export function workspaceFileContent(
  mainPath: string,
  mainName: string,
  linked: readonly { readonly path: string; readonly name?: string }[],
  discriminatorPlan?: {
    readonly discriminators: readonly Discriminator[];
    readonly history: readonly (string | null)[];
  },
  visualsEnabled = false,
): string {
  const workspace = {
    folders: [
      {
        path: ".",
        name:
          visualsEnabled && discriminatorPlan
            ? `${discriminatorPlan.discriminators[0]?.symbol} ${mainName}`
            : mainName,
      },
      ...linked.map((worktree, index) => ({
        path: normalizeWorkspacePath(path.relative(mainPath, worktree.path)),
        name:
          visualsEnabled && discriminatorPlan
            ? `${discriminatorPlan.discriminators[index + 1]?.symbol} ${worktree.name ?? path.basename(worktree.path)}`
            : (worktree.name ?? path.basename(worktree.path)),
      })),
    ],
  };

  const content = `${JSON.stringify(workspace, undefined, 2)}\n`;
  return discriminatorPlan
    ? updateDiscriminatorSettings(
        content,
        discriminatorPlan.discriminators,
        discriminatorPlan.history,
        visualsEnabled,
      )
    : content;
}

export function parseWorkspaceFolders(
  content: string,
  workspaceDirectory: string,
): readonly ParsedWorkspaceFolder[] {
  const workspace = parse(content) as {
    folders?: { path?: unknown; name?: unknown }[];
  } | null;
  return (workspace?.folders ?? []).flatMap((folder) => {
    if (typeof folder.path !== "string") {
      return [];
    }

    return [
      {
        path: path.resolve(workspaceDirectory, folder.path),
        name: typeof folder.name === "string" ? folder.name : undefined,
      },
    ];
  });
}

function normalizeWorkspacePath(workspacePath: string): string {
  return workspacePath.split(path.sep).join("/");
}

export function addGitignoreEntry(current: string, filename: string): string {
  if (current.split(/\r?\n/).includes(filename)) return current;

  const separator = current.length === 0 || current.endsWith("\n") ? "" : "\n";
  return `${current}${separator}# Managed by VS Code Orchardist extension:\n${filename}\n`;
}
