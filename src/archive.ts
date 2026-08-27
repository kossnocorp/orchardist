import * as path from "node:path";

export interface WorktreePath {
  readonly path: string;
}

export interface WorktreeArchive<T extends WorktreePath> {
  readonly all: readonly T[];
  readonly active: readonly T[];
  readonly archived: readonly T[];
  readonly archivedPaths: readonly string[];
}

export function partitionArchivedWorktrees<T extends WorktreePath>(
  main: T,
  linked: readonly T[],
  archivedPaths: readonly unknown[],
): WorktreeArchive<T> {
  const requestedPaths = archivedPaths.filter(
    (archivedPath): archivedPath is string => typeof archivedPath === "string",
  );
  const archived = linked.filter((worktree) =>
    requestedPaths.some((archivedPath) =>
      pathsEqual(worktree.path, archivedPath),
    ),
  );

  return {
    all: [main, ...linked],
    active: [
      main,
      ...linked.filter(
        (worktree) =>
          !archived.some((candidate) =>
            pathsEqual(candidate.path, worktree.path),
          ),
      ),
    ],
    archived,
    archivedPaths: archived.map((worktree) => worktree.path),
  };
}

function pathsEqual(left: string, right: string): boolean {
  return path.resolve(left) === path.resolve(right);
}
