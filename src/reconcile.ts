export interface FolderSpec {
  readonly uri: string;
  readonly name: string;
}

export function planWorkspaceFolders(
  current: readonly FolderSpec[],
  mainUri: string,
  mainName: string,
  previouslyManagedUris: readonly string[],
  desired: readonly FolderSpec[],
): FolderSpec[] {
  const managedUris = new Set([
    ...previouslyManagedUris,
    ...desired.map((folder) => folder.uri),
  ]);
  const preserved = current.filter(
    (folder) => folder.uri !== mainUri && !managedUris.has(folder.uri),
  );

  return [{ uri: mainUri, name: mainName }, ...preserved, ...desired];
}

export function workspaceFoldersEqual(
  left: readonly FolderSpec[],
  right: readonly FolderSpec[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (folder, index) =>
        folder.uri === right[index]?.uri && folder.name === right[index]?.name,
    )
  );
}
