import * as path from "node:path";
import { parse } from "jsonc-parser";

const workspaceFolderBasenameVariable = "${workspaceFolderBasename}";
const focusedSuffix = " (focused)";

export interface FocusedWorkspaceFolder {
  readonly path: string;
  readonly name: string;
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
  linkedPaths: readonly string[],
): string {
  const workspace = {
    folders: [
      { path: ".", name: mainName },
      ...linkedPaths.map((worktreePath) => ({
        path: normalizeWorkspacePath(path.relative(mainPath, worktreePath)),
        name: path.basename(worktreePath),
      })),
    ],
  };

  return `${JSON.stringify(workspace, undefined, 2)}\n`;
}

export function focusedWorkspaceFolders(
  content: string,
  workspaceDirectory: string,
): readonly FocusedWorkspaceFolder[] {
  const workspace = parse(content) as {
    folders?: { path?: unknown; name?: unknown }[];
  } | null;
  return (workspace?.folders ?? []).flatMap((folder) => {
    if (
      typeof folder.path !== "string" ||
      typeof folder.name !== "string" ||
      !folder.name.endsWith(focusedSuffix)
    ) {
      return [];
    }

    return [
      {
        path: path.resolve(workspaceDirectory, folder.path),
        name: folder.name.slice(0, -focusedSuffix.length),
      },
    ];
  });
}

export function focusedWorktreeName(name: string): string {
  return `${name}${focusedSuffix}`;
}

function normalizeWorkspacePath(workspacePath: string): string {
  return workspacePath.split(path.sep).join("/");
}

export function addGitignoreEntry(current: string, filename: string): string {
  if (current.split(/\r?\n/).includes(filename)) return current;

  const separator = current.length === 0 || current.endsWith("\n") ? "" : "\n";
  return `${current}${separator}# Managed by VS Code Orchardist extension:\n${filename}\n`;
}
