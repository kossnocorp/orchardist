import * as path from "node:path";
import { parse } from "jsonc-parser";

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
