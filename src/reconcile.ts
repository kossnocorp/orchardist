export interface FolderSpec {
  readonly uri: string;
  readonly name: string;
}

export type ExcludeValue = boolean | { readonly when: string };

export interface ManagedExclusion {
  readonly pattern: string;
  readonly previousValue: ExcludeValue | null;
}

export function planDirectoryExclusion(
  current: Readonly<Record<string, ExcludeValue>>,
  previous: ManagedExclusion | undefined,
  pattern: string,
): {
  readonly exclude: Record<string, ExcludeValue>;
  readonly managed: ManagedExclusion;
} {
  const exclude = { ...current };

  if (previous && previous.pattern !== pattern) {
    if (exclude[previous.pattern] === true) {
      if (previous.previousValue === null) delete exclude[previous.pattern];
      else exclude[previous.pattern] = previous.previousValue;
    }
  }

  if (previous?.pattern === pattern) {
    exclude[pattern] = true;
    return { exclude, managed: previous };
  }

  const managed: ManagedExclusion = {
    pattern,
    previousValue: Object.hasOwn(exclude, pattern) ? exclude[pattern]! : null,
  };
  exclude[pattern] = true;
  return { exclude, managed };
}

export function planWorkspaceFolders(
  current: readonly FolderSpec[],
  mainUri: string,
  mainName: string,
  managedRootUris: readonly string[],
  desired: readonly FolderSpec[],
): FolderSpec[] {
  const managedPrefixes = managedRootUris.map(
    (uri) => `${uri.replace(/\/$/, "")}/`,
  );
  const preserved = current
    .filter(
      (folder) =>
        folder.uri === mainUri ||
        !managedPrefixes.some((prefix) => folder.uri.startsWith(prefix)),
    )
    .map((folder) =>
      folder.uri === mainUri ? { ...folder, name: mainName } : folder,
    );

  return [...preserved, ...desired];
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
