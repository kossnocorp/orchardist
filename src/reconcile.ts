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

export function inferFocusedUris(
  currentUris: readonly string[],
  availableUris: readonly string[],
): readonly string[] {
  const present = new Set(currentUris);
  const focused = availableUris.filter((uri) => present.has(uri));
  return focused.length > 0 && focused.length < availableUris.length
    ? focused
    : [];
}

export function planFocusedWorkspaceFolders(
  current: readonly FolderSpec[],
  availableUris: readonly string[],
  previouslyManagedUris: readonly string[],
  focused: readonly FolderSpec[],
): FolderSpec[] {
  const managedUris = new Set([...availableUris, ...previouslyManagedUris]);
  const preserved = current.filter((folder) => !managedUris.has(folder.uri));
  return [...focused, ...preserved];
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
