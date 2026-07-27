export function workspaceFileContent(
  directory: string,
  mainName: string,
  entries: readonly string[],
): string {
  const relativeDirectory = directory.replace(/^\.\//, "").replace(/\/$/, "");
  const workspace = {
    folders: [
      { path: ".", name: mainName },
      ...entries.map((name) => ({
        path: `${relativeDirectory}/${name}`,
        name,
      })),
    ],
  };

  return `${JSON.stringify(workspace, undefined, 2)}\n`;
}

export function addGitignoreEntry(current: string, filename: string): string {
  if (current.split(/\r?\n/).includes(filename)) return current;

  const separator = current.length === 0 || current.endsWith("\n") ? "" : "\n";
  return `${current}${separator}# Managed by VS Code Orchardist extension:\n${filename}\n`;
}
