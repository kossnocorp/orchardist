import { watch, type FSWatcher } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  addGitignoreEntry,
  resolveWorkspaceFileName,
  workspaceFileContent,
} from "./bootstrap.ts";
import { discoverGitRepository, type GitRepositorySnapshot } from "./git.ts";
import { planWorkspaceFolders, workspaceFoldersEqual } from "./reconcile.ts";

const configurationSection = "orchardist";
const refreshCommand = "orchardist.refresh";
const managedWorktreesKey = "managedWorktrees";
const bootstrapAction = "Bootstrap Workspace";

interface GitExtension {
  readonly enabled: boolean;
  getAPI(version: 1): { readonly git: { readonly path: string } };
}

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const openedFolder = vscode.workspace.workspaceFolders?.[0];
  if (!openedFolder) return;

  const configuration = vscode.workspace.getConfiguration(
    configurationSection,
    openedFolder.uri,
  );
  if (!configuration.get("enabled", true)) return;

  const gitPath = await resolveGitPath();
  let snapshot: GitRepositorySnapshot;
  try {
    snapshot = await discoverGitRepository(gitPath, openedFolder.uri.fsPath);
  } catch (error) {
    await showGitError(error);
    return;
  }

  const mainUri = vscode.Uri.file(snapshot.main.path);
  const workspaceFileName = resolveWorkspaceFileName(
    configuration.get(
      "workspaceFileName",
      "${workspaceFolderBasename}.wt.code-workspace",
    ),
    projectName(mainUri),
  );
  const workspaceUri = vscode.Uri.joinPath(mainUri, workspaceFileName);

  if (!isCurrentWorkspace(workspaceUri)) {
    if (snapshot.linked.length === 0) return;

    const alwaysBootstrap = configuration.get("alwaysBootstrap", false);
    const choice = alwaysBootstrap
      ? bootstrapAction
      : await vscode.window.showInformationMessage(
          "Orchardist detected worktrees. Do you want to bootstrap this workspace?",
          bootstrapAction,
        );
    if (choice !== bootstrapAction) return;

    await bootstrapWorkspace(configuration, snapshot, workspaceUri);
    return;
  }

  const mainFolder =
    vscode.workspace.getWorkspaceFolder(mainUri) ??
    vscode.workspace.workspaceFolders?.[0];
  if (!mainFolder) return;

  let timer: NodeJS.Timeout | undefined;

  const sync = async (): Promise<void> => {
    const currentConfiguration = vscode.workspace.getConfiguration(
      configurationSection,
      mainFolder.uri,
    );
    if (!currentConfiguration.get("enabled", true)) return;

    const current = await discoverGitRepository(gitPath, mainFolder.uri.fsPath);
    const mainName = currentConfiguration.get("mainName", "main");
    const desired = current.linked.map((worktree) => ({
      uri: vscode.Uri.file(worktree.path),
      name: path.basename(worktree.path),
    }));
    const previouslyManaged =
      context.workspaceState.get<readonly string[]>(managedWorktreesKey) ?? [];
    await context.workspaceState.update(
      managedWorktreesKey,
      desired.map((folder) => folder.uri.toString()),
    );

    reconcileWorkspaceFolders(
      vscode.Uri.file(current.main.path),
      mainName,
      previouslyManaged,
      desired,
    );
  };

  const syncWithErrors = async (): Promise<void> => {
    try {
      await sync();
    } catch (error) {
      await showGitError(error);
    }
  };

  const scheduleSync = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncWithErrors(), 200);
  };

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      vscode.Uri.file(snapshot.commonDirectory),
      "worktrees/**",
    ),
  );
  watcher.onDidCreate(scheduleSync);
  watcher.onDidChange(scheduleSync);
  watcher.onDidDelete(scheduleSync);
  const nativeWatcher = createNativeWorktreeWatcher(
    snapshot.commonDirectory,
    scheduleSync,
  );

  context.subscriptions.push(
    watcher,
    nativeWatcher,
    vscode.commands.registerCommand(refreshCommand, syncWithErrors),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(configurationSection, mainFolder.uri)) {
        scheduleSync();
      }
    }),
    { dispose: () => timer && clearTimeout(timer) },
  );

  await syncWithErrors();
}

export function deactivate(): void {}

function createNativeWorktreeWatcher(
  commonDirectory: string,
  onDidChange: () => void,
): vscode.Disposable {
  const worktreesDirectory = path.join(commonDirectory, "worktrees");
  let watcher: FSWatcher | undefined;
  let disposed = false;

  const watchCommonDirectory = (): void => {
    if (disposed) return;
    watcher?.close();
    try {
      watcher = watch(commonDirectory, { persistent: false }, (_, filename) => {
        if (filename?.toString() !== "worktrees") return;
        onDidChange();
        watchWorktreesDirectory();
      });
      watcher.on("error", () => watcher?.close());
    } catch {
      watcher = undefined;
    }
  };

  const watchWorktreesDirectory = (): void => {
    if (disposed) return;
    watcher?.close();
    try {
      watcher = watch(worktreesDirectory, { persistent: false }, onDidChange);
      watcher.on("error", watchCommonDirectory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        watchCommonDirectory();
      } else {
        watcher = undefined;
      }
    }
  };

  watchWorktreesDirectory();
  return {
    dispose: () => {
      disposed = true;
      watcher?.close();
    },
  };
}

async function bootstrapWorkspace(
  configuration: vscode.WorkspaceConfiguration,
  snapshot: GitRepositorySnapshot,
  workspaceUri: vscode.Uri,
): Promise<void> {
  if (configuration.get("ignoreWorkspaceFile", true)) {
    await addWorkspaceToGitignore(
      vscode.Uri.file(snapshot.main.path),
      workspaceUri,
    );
  }

  const mainName = configuration.get("mainName", "main");
  await vscode.workspace.fs.writeFile(
    workspaceUri,
    new TextEncoder().encode(
      workspaceFileContent(
        snapshot.main.path,
        mainName,
        snapshot.linked.map((worktree) => worktree.path),
      ),
    ),
  );
  await vscode.commands.executeCommand(
    "vscode.openFolder",
    workspaceUri,
    false,
  );
}

async function addWorkspaceToGitignore(
  rootUri: vscode.Uri,
  workspaceUri: vscode.Uri,
): Promise<void> {
  const gitignoreUri = vscode.Uri.joinPath(rootUri, ".gitignore");
  const filename = path.basename(workspaceUri.fsPath);
  let current = "";
  try {
    current = new TextDecoder().decode(
      await vscode.workspace.fs.readFile(gitignoreUri),
    );
  } catch (error) {
    if (!isFileNotFound(error)) throw error;
  }

  const next = addGitignoreEntry(current, filename);
  if (next === current) return;
  await vscode.workspace.fs.writeFile(
    gitignoreUri,
    new TextEncoder().encode(next),
  );
}

async function resolveGitPath(): Promise<string> {
  const extension = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!extension) return "git";

  try {
    const gitExtension = await extension.activate();
    return gitExtension.enabled ? gitExtension.getAPI(1).git.path : "git";
  } catch {
    return "git";
  }
}

async function showGitError(error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await vscode.window.showErrorMessage(
    `Orchardist could not read Git worktrees: ${message}`,
  );
}

function isFileNotFound(error: unknown): boolean {
  return (
    error instanceof vscode.FileSystemError && error.code === "FileNotFound"
  );
}

function isCurrentWorkspace(workspaceUri: vscode.Uri): boolean {
  return vscode.workspace.workspaceFile?.toString() === workspaceUri.toString();
}

function projectName(uri: vscode.Uri): string {
  return path.basename(uri.fsPath);
}

function reconcileWorkspaceFolders(
  mainUri: vscode.Uri,
  mainName: string,
  previouslyManagedUris: readonly string[],
  desired: readonly { uri: vscode.Uri; name: string }[],
): void {
  const current = vscode.workspace.workspaceFolders ?? [];
  const next = planWorkspaceFolders(
    current.map((folder) => ({
      uri: folder.uri.toString(),
      name: folder.name,
    })),
    mainUri.toString(),
    mainName,
    previouslyManagedUris,
    desired.map((folder) => ({
      uri: folder.uri.toString(),
      name: folder.name,
    })),
  );

  if (
    !workspaceFoldersEqual(
      current.map((folder) => ({
        uri: folder.uri.toString(),
        name: folder.name,
      })),
      next,
    )
  ) {
    vscode.workspace.updateWorkspaceFolders(
      0,
      current.length,
      ...next.map((folder) => ({
        uri: vscode.Uri.parse(folder.uri),
        name: folder.name,
      })),
    );
  }
}
