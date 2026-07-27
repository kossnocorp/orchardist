import * as path from "node:path";

const workspaceFolderBasenameVariable = "${workspaceFolderBasename}";

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

function normalizeWorkspacePath(workspacePath: string): string {
  return workspacePath.split(path.sep).join("/");
}

export function addGitignoreEntry(current: string, filename: string): string {
  if (current.split(/\r?\n/).includes(filename)) return current;

  const separator = current.length === 0 || current.endsWith("\n") ? "" : "\n";
  return `${current}${separator}# Managed by VS Code Orchardist extension:\n${filename}\n`;
}
