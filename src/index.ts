import { watch, type FSWatcher } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  addGitignoreEntry,
  focusedWorkspaceFolders,
  focusedWorktreeName,
  resolveWorkspaceFileName,
  workspaceFileContent,
} from "./bootstrap.ts";
import {
  discoverGitRepository,
  type GitRepositorySnapshot,
  type GitWorktree,
} from "./git.ts";
import { planWorkspaceFolders, workspaceFoldersEqual } from "./reconcile.ts";

const configurationSection = "orchardist";
const focusSingleCommand = "orchardist.focusWorktree";
const focusMultipleCommand = "orchardist.focusMultipleWorktrees";
const unfocusCommand = "orchardist.unfocusWorktree";
const openWorktreeInNewWindowCommand = "orchardist.openWorktreeInNewWindow";
const worktreeActionsCommand = "orchardist.showWorktreeActions";
const managedWorkspaceContext = "orchardist.managedWorkspace";
const focusedWorktreeContext = "orchardist.focusedWorktree";
const focusModeContext = "orchardist.focusMode";
const managedWorktreesKey = "managedWorktrees";
const bootstrapAction = "Bootstrap Workspace";
const openWorkspaceAction = "Open Workspace";

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
    if (!pathsEqual(openedFolder.uri.fsPath, snapshot.main.path)) return;

    if (await fileExists(workspaceUri)) {
      const choice = await vscode.window.showInformationMessage(
        "Orchardist found an existing worktree workspace. Do you want to open it?",
        openWorkspaceAction,
      );
      if (choice === openWorkspaceAction) {
        await vscode.commands.executeCommand(
          "vscode.openFolder",
          workspaceUri,
          false,
        );
      }
      return;
    }

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
  let focusedPaths = await readFocusedPaths(workspaceUri);
  let expectedWorkspaceFocus: readonly string[] | undefined;
  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
  );
  status.name = "Orchardist Worktrees";
  await vscode.commands.executeCommand(
    "setContext",
    managedWorkspaceContext,
    true,
  );

  const sync = async (): Promise<void> => {
    const currentConfiguration = vscode.workspace.getConfiguration(
      configurationSection,
      mainFolder.uri,
    );
    if (!currentConfiguration.get("enabled", true)) return;

    const current = await discoverGitRepository(gitPath, mainFolder.uri.fsPath);
    const mainName = currentConfiguration.get("mainName", "main");
    const worktrees = [current.main, ...current.linked];
    const focused = worktrees.filter((worktree) =>
      focusedPaths.some((focusedPath) =>
        pathsEqual(worktree.path, focusedPath),
      ),
    );
    focusedPaths = focused.map((worktree) => worktree.path);
    await vscode.commands.executeCommand(
      "setContext",
      focusedWorktreeContext,
      focused.length > 0,
    );
    await vscode.commands.executeCommand(
      "setContext",
      focusModeContext,
      focused.length > 1
        ? "multiple"
        : focused.length === 1
          ? "single"
          : undefined,
    );

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

    if (focused.length > 0) {
      replaceWorkspaceFolders(
        focused.map((worktree) => ({
          uri: vscode.Uri.file(worktree.path),
          name: focusedWorktreeName(path.basename(worktree.path)),
        })),
        () => {
          expectedWorkspaceFocus = focused.map((worktree) => worktree.path);
        },
      );
    } else {
      reconcileWorkspaceFolders(
        vscode.Uri.file(current.main.path),
        mainName,
        previouslyManaged,
        desired,
        () => {
          expectedWorkspaceFocus = [];
        },
      );
    }

    updateStatus(status, focused, worktrees.length);
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
  const workspaceWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      vscode.Uri.file(path.dirname(workspaceUri.fsPath)),
      path.basename(workspaceUri.fsPath),
    ),
  );
  const syncWorkspaceFocus = async (): Promise<void> => {
    const nextFocus = await readFocusedPaths(workspaceUri);
    if (
      expectedWorkspaceFocus !== undefined &&
      focusedPathsEqual(expectedWorkspaceFocus, nextFocus)
    ) {
      expectedWorkspaceFocus = undefined;
      return;
    }

    expectedWorkspaceFocus = undefined;
    focusedPaths = nextFocus;
    await syncWithErrors();
  };
  workspaceWatcher.onDidCreate(() => void syncWorkspaceFocus());
  workspaceWatcher.onDidChange(() => void syncWorkspaceFocus());
  workspaceWatcher.onDidDelete(() => void syncWorkspaceFocus());

  context.subscriptions.push(
    watcher,
    nativeWatcher,
    workspaceWatcher,
    status,
    vscode.commands.registerCommand(focusSingleCommand, async () => {
      try {
        const current = await discoverGitRepository(
          gitPath,
          mainFolder.uri.fsPath,
        );
        const selected = await selectWorktree([
          current.main,
          ...current.linked,
        ]);
        if (!selected) return;

        focusedPaths = [selected.path];
        await syncWithErrors();
      } catch (error) {
        await showGitError(error);
      }
    }),
    vscode.commands.registerCommand(focusMultipleCommand, async () => {
      try {
        const current = await discoverGitRepository(
          gitPath,
          mainFolder.uri.fsPath,
        );
        const selected = await selectWorktrees(
          [current.main, ...current.linked],
          focusedPaths,
        );
        if (!selected || selected.length === 0) return;

        focusedPaths = selected.map((worktree) => worktree.path);
        await syncWithErrors();
      } catch (error) {
        await showGitError(error);
      }
    }),
    vscode.commands.registerCommand(unfocusCommand, async () => {
      focusedPaths = [];
      await syncWithErrors();
    }),
    vscode.commands.registerCommand(
      openWorktreeInNewWindowCommand,
      async () => {
        try {
          const current = await discoverGitRepository(
            gitPath,
            mainFolder.uri.fsPath,
          );
          const selected = await selectWorktree(
            [current.main, ...current.linked],
            "Open Worktree in New Window",
            "Select a worktree to open in a new window",
          );
          if (!selected) return;

          await vscode.commands.executeCommand(
            "vscode.openFolder",
            vscode.Uri.file(selected.path),
            true,
          );
        } catch (error) {
          await showGitError(error);
        }
      },
    ),
    vscode.commands.registerCommand(worktreeActionsCommand, async () => {
      const multiple = focusedPaths.length > 1;
      const selected = await vscode.window.showQuickPick(
        [
          {
            label: multiple
              ? "$(target) Change Focused Worktrees"
              : "$(target) Change Focused Worktree",
            command: multiple ? focusMultipleCommand : focusSingleCommand,
          },
          {
            label: multiple
              ? "$(list-selection) Focus Single Worktree"
              : "$(list-selection) Focus Multiple Worktrees",
            command: multiple ? focusSingleCommand : focusMultipleCommand,
          },
          {
            label: "$(close) Unfocus",
            command: unfocusCommand,
          },
        ],
        {
          placeHolder: "Choose a worktree action",
          title: multiple ? "Focused Worktrees" : "Focused Worktree",
        },
      );
      if (selected) await vscode.commands.executeCommand(selected.command);
    }),
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

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch (error) {
    if (isFileNotFound(error)) return false;
    throw error;
  }
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
  beforeUpdate?: () => void,
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
    beforeUpdate?.();
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

function replaceWorkspaceFolders(
  desired: readonly { uri: vscode.Uri; name: string }[],
  beforeUpdate: () => void,
): void {
  const current = vscode.workspace.workspaceFolders ?? [];
  if (
    workspaceFoldersEqual(
      current.map((folder) => ({
        uri: folder.uri.toString(),
        name: folder.name,
      })),
      desired.map((folder) => ({
        uri: folder.uri.toString(),
        name: folder.name,
      })),
    )
  ) {
    return;
  }

  beforeUpdate();
  vscode.workspace.updateWorkspaceFolders(0, current.length, ...desired);
}

async function readFocusedPaths(
  workspaceUri: vscode.Uri,
): Promise<readonly string[]> {
  try {
    const content = new TextDecoder().decode(
      await vscode.workspace.fs.readFile(workspaceUri),
    );
    return focusedWorkspaceFolders(
      content,
      path.dirname(workspaceUri.fsPath),
    ).map((folder) => folder.path);
  } catch (error) {
    if (isFileNotFound(error)) return [];
    throw error;
  }
}

async function selectWorktrees(
  worktrees: readonly GitWorktree[],
  focusedPaths: readonly string[],
): Promise<readonly GitWorktree[] | undefined> {
  const items = worktrees.map((worktree) => ({
    label: path.basename(worktree.path),
    description: worktree.path,
    picked: focusedPaths.some((focusedPath) =>
      pathsEqual(worktree.path, focusedPath),
    ),
    worktree,
  }));
  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: "Select worktrees to focus",
    title: "Focus Multiple Worktrees",
  });
  return selected?.map((item) => item.worktree);
}

async function selectWorktree(
  worktrees: readonly GitWorktree[],
  title = "Focus Worktree",
  placeHolder = "Select a worktree to focus",
): Promise<GitWorktree | undefined> {
  const items = worktrees.map((worktree) => ({
    label: path.basename(worktree.path),
    description: worktree.path,
    worktree,
  }));
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder,
    title,
  });
  return selected?.worktree;
}

function updateStatus(
  status: vscode.StatusBarItem,
  focused: readonly GitWorktree[],
  worktreeCount: number,
): void {
  const first = focused[0];
  if (focused.length === 1 && first) {
    const name = path.basename(first.path);
    status.text = `$(git-commit) Worktree: ${name}`;
    status.tooltip = `Orchardist is focused on ${name}`;
    status.command = worktreeActionsCommand;
  } else if (focused.length > 1) {
    const names = focused.map((worktree) => path.basename(worktree.path));
    status.text = `$(git-commit) Worktrees: ${focused.length}`;
    status.tooltip = `Orchardist is focused on ${names.join(", ")}`;
    status.command = worktreeActionsCommand;
  } else {
    status.text = `$(git-branch) Worktrees: ${worktreeCount}`;
    status.tooltip = `${worktreeCount} Git worktrees`;
    status.command = focusSingleCommand;
  }
  status.show();
}

function focusedPathsEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((leftPath, index) => pathsEqual(leftPath, right[index]))
  );
}

function pathsEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (
    left === null ||
    left === undefined ||
    right === null ||
    right === undefined
  ) {
    return left === right;
  }
  return path.resolve(left) === path.resolve(right);
}
