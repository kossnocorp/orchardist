import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitWorktree {
  readonly path: string;
  readonly branch?: string;
  readonly detached: boolean;
  readonly locked: boolean;
}

export interface GitRepositorySnapshot {
  readonly main: GitWorktree;
  readonly linked: readonly GitWorktree[];
  readonly commonDirectory: string;
}

interface PorcelainRecord extends GitWorktree {
  readonly bare: boolean;
  readonly prunable: boolean;
}

interface PorcelainRecordBuilder {
  path?: string;
  branch?: string;
  detached?: boolean;
  locked?: boolean;
  bare?: boolean;
  prunable?: boolean;
}

export async function discoverGitRepository(
  gitPath: string,
  workingDirectory: string,
): Promise<GitRepositorySnapshot> {
  const [worktreeResult, commonDirectoryResult] = await Promise.all([
    execFileAsync(gitPath, ["worktree", "list", "--porcelain", "-z"], {
      cwd: workingDirectory,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    }),
    execFileAsync(
      gitPath,
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      {
        cwd: workingDirectory,
        encoding: "utf8",
      },
    ),
  ]);

  const worktrees = parseWorktreePorcelain(worktreeResult.stdout);
  const main = worktrees[0];
  if (!main) throw new Error("Git did not report a main worktree.");

  return {
    main,
    linked: worktrees.slice(1),
    commonDirectory: commonDirectoryResult.stdout.trim(),
  };
}

export function parseWorktreePorcelain(output: string): GitWorktree[] {
  const records: PorcelainRecord[] = [];
  let record: PorcelainRecordBuilder | undefined;

  for (const field of output.split("\0")) {
    if (field === "") {
      if (record?.path) records.push(toRecord(record));
      record = undefined;
      continue;
    }

    const separator = field.indexOf(" ");
    const key = separator === -1 ? field : field.slice(0, separator);
    const value = separator === -1 ? undefined : field.slice(separator + 1);

    if (key === "worktree") {
      if (record?.path) records.push(toRecord(record));
      record = value === undefined ? undefined : { path: value };
      continue;
    }
    if (!record) continue;

    switch (key) {
      case "branch":
        if (value !== undefined) record.branch = value;
        break;
      case "detached":
        record.detached = true;
        break;
      case "locked":
        record.locked = true;
        break;
      case "bare":
        record.bare = true;
        break;
      case "prunable":
        record.prunable = true;
        break;
    }
  }

  if (record?.path) records.push(toRecord(record));
  return records
    .filter((entry) => !entry.bare && !entry.prunable)
    .map(({ path, branch, detached, locked }) => ({
      path,
      ...(branch === undefined ? {} : { branch }),
      detached,
      locked,
    }));
}

export function hasAddedWorktree(
  known: readonly GitWorktree[],
  current: readonly GitWorktree[],
): boolean {
  const knownPaths = new Set(known.map((worktree) => worktree.path));
  return current.some((worktree) => !knownPaths.has(worktree.path));
}

function toRecord(record: PorcelainRecordBuilder): PorcelainRecord {
  return {
    path: record.path!,
    ...(record.branch === undefined ? {} : { branch: record.branch }),
    detached: record.detached ?? false,
    locked: record.locked ?? false,
    bare: record.bare ?? false,
    prunable: record.prunable ?? false,
  };
}
