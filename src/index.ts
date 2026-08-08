import { watch, type FSWatcher } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  addGitignoreEntry,
  parseWorkspaceFolders,
  resolveWorkspaceFileName,
  workspaceFileContent,
} from "./bootstrap.ts";
import {
  assignDiscriminators,
  defaultDiscriminatorSymbols,
  discriminatorEnvironment,
  readDiscriminatorHistory,
  sortWorktrees,
  updateDiscriminatorSettings,
} from "./discriminators.ts";
import {
  discoverGitRepository,
  type GitRepositorySnapshot,
  type GitWorktree,
} from "./git.ts";
import {
  inferFocusedUris,
  planFocusedWorkspaceFolders,
  planWorkspaceFolders,
  workspaceFoldersEqual,
} from "./reconcile.ts";
import { worktreePickerItems } from "./pickers.ts";
import { terminalColor } from "./terminals.ts";

const configurationSection = "orchardist";
const focusSingleCommand = "orchardist.focusWorktree";
const focusMultipleCommand = "orchardist.focusMultipleWorktrees";
const unfocusCommand = "orchardist.unfocusWorktree";
const openWorktreeInNewWindowCommand = "orchardist.openWorktreeInNewWindow";
const newTerminalCommand = "orchardist.newTerminal";
const worktreeActionsCommand = "orchardist.showWorktreeActions";
const managedWorkspaceContext = "orchardist.managedWorkspace";
const focusedWorktreeContext = "orchardist.focusedWorktree";
const focusModeContext = "orchardist.focusMode";
const managedWorktreesKey = "managedWorktrees";
const discriminatorEnvironmentVariable = "ORCHARDIST_DISCRIMINATORS";
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
  if (!configuration.get("enabled", true)) {
    updateDiscriminatorEnvironment(context, undefined);
    return;
  }

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

    await bootstrapWorkspace(context, configuration, snapshot, workspaceUri);
    return;
  }

  const mainFolder =
    vscode.workspace.getWorkspaceFolder(mainUri) ??
    vscode.workspace.workspaceFolders?.[0];
  if (!mainFolder) return;

  let timer: NodeJS.Timeout | undefined;
  let syncQueue = Promise.resolve();
  let focusedPaths = inferFocusedPaths(
    vscode.workspace.workspaceFolders ?? [],
    [snapshot.main, ...snapshot.linked],
  );
  let expectedWorkspaceUris: readonly string[] | undefined;
  let latestDiscriminatorPlan: ReturnType<typeof assignDiscriminators>;
  let latestIdentities: ReturnType<typeof sortWorktrees> = [];
  let latestDiscriminatorVisuals = false;
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
    const identities = sortWorktrees(
      current.main.path,
      mainName,
      current.linked.map((worktree) => worktree.path),
      projectName(workspaceUri),
    );
    const worktreeByPath = new Map(
      [current.main, ...current.linked].map((worktree) => [
        worktree.path,
        worktree,
      ]),
    );
    const worktrees = identities.flatMap((identity) => {
      const worktree = worktreeByPath.get(identity.path);
      return worktree ? [worktree] : [];
    });
    const discriminatorPlan = await planDiscriminators(
      currentConfiguration,
      workspaceUri,
      identities,
    );
    latestDiscriminatorPlan = discriminatorPlan;
    const discriminatorVisuals = currentConfiguration.get(
      "discriminators",
      false,
    );
    latestIdentities = identities;
    latestDiscriminatorVisuals = discriminatorVisuals;
    const displayName = (worktreePath: string, name: string): string => {
      const discriminator = discriminatorPlan.discriminators.find((candidate) =>
        pathsEqual(candidate.path, worktreePath),
      );
      return discriminatorVisuals && discriminator
        ? `${discriminator.symbol} ${name}`
        : name;
    };
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

    const linkedIdentities = identities.slice(1);
    const desired = linkedIdentities.map((identity) => ({
      uri: vscode.Uri.file(identity.path),
      name: displayName(identity.path, identity.name),
    }));
    const availableUris = worktrees.map((worktree) =>
      vscode.Uri.file(worktree.path).toString(),
    );
    const previouslyManaged =
      context.workspaceState.get<readonly string[]>(managedWorktreesKey) ?? [];
    await context.workspaceState.update(
      managedWorktreesKey,
      desired.map((folder) => folder.uri.toString()),
    );

    if (focused.length > 0) {
      reconcileFocusedWorkspaceFolders(
        availableUris,
        previouslyManaged,
        focused.map((worktree) => {
          const identity = identities.find((candidate) =>
            pathsEqual(candidate.path, worktree.path),
          );
          const name = identity?.name ?? path.basename(worktree.path);
          return {
            uri: vscode.Uri.file(worktree.path),
            name: displayName(worktree.path, name),
          };
        }),
        () => {
          expectedWorkspaceUris = focused.map((worktree) =>
            vscode.Uri.file(worktree.path).toString(),
          );
        },
      );
    } else {
      reconcileWorkspaceFolders(
        vscode.Uri.file(current.main.path),
        displayName(current.main.path, mainName),
        previouslyManaged,
        desired,
        () => {
          expectedWorkspaceUris = availableUris;
        },
      );
    }

    await synchronizeDiscriminatorSettings(
      context,
      workspaceUri,
      discriminatorPlan,
      discriminatorVisuals,
      focused.length > 0
        ? focused.map((worktree) => worktree.path)
        : identities.map((identity) => identity.path),
    );

    updateStatus(
      status,
      focused,
      worktrees.length,
      pickerItems(
        identities,
        discriminatorPlan.discriminators,
        discriminatorVisuals,
      ),
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
    timer = setTimeout(() => {
      syncQueue = syncQueue.then(syncWithErrors, syncWithErrors);
    }, 200);
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
    const current = await discoverGitRepository(gitPath, mainFolder.uri.fsPath);
    const worktrees = [current.main, ...current.linked];
    const workspacePaths = await readWorkspacePaths(workspaceUri);
    const workspaceUris = workspacePaths.map((workspacePath) =>
      vscode.Uri.file(workspacePath).toString(),
    );
    if (
      expectedWorkspaceUris !== undefined &&
      uriSetsEqual(expectedWorkspaceUris, workspaceUris)
    ) {
      expectedWorkspaceUris = undefined;
      return;
    }

    expectedWorkspaceUris = undefined;
    focusedPaths = inferFocusedPathsFromPaths(workspacePaths, worktrees);
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
        const selected = await selectWorktree(
          [current.main, ...current.linked],
          latestIdentities,
          latestDiscriminatorPlan.discriminators,
          latestDiscriminatorVisuals,
        );
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
          latestIdentities,
          latestDiscriminatorPlan.discriminators,
          latestDiscriminatorVisuals,
        );
        if (!selected || selected.length === 0) return;

        focusedPaths =
          selected.length === current.linked.length + 1
            ? []
            : selected.map((worktree) => worktree.path);
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
            latestIdentities,
            latestDiscriminatorPlan.discriminators,
            latestDiscriminatorVisuals,
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
    vscode.commands.registerCommand(newTerminalCommand, async () => {
      const activePaths = (vscode.workspace.workspaceFolders ?? []).map(
        (folder) => folder.uri.fsPath,
      );
      const selectedPath =
        activePaths.length === 1
          ? activePaths[0]
          : await selectWorktreePath(
              latestIdentities,
              latestDiscriminatorPlan.discriminators,
              latestDiscriminatorVisuals,
              "New Terminal",
              "Select a worktree for the terminal",
            );
      if (!selectedPath) return;

      const identity = latestIdentities.find((candidate) =>
        pathsEqual(candidate.path, selectedPath),
      );

      const color = terminalColor(
        selectedPath,
        latestDiscriminatorPlan.history,
        latestDiscriminatorPlan.discriminators,
      );
      const options: vscode.TerminalOptions = {
        cwd: vscode.Uri.file(selectedPath),
        name: identity?.name ?? path.basename(selectedPath),
        ...(color ? { color: new vscode.ThemeColor(color) } : {}),
      };
      const terminal = vscode.window.createTerminal(options);
      terminal.show();
    }),
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
  context: vscode.ExtensionContext,
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
  const identities = sortWorktrees(
    snapshot.main.path,
    mainName,
    snapshot.linked.map((worktree) => worktree.path),
    projectName(workspaceUri),
  );
  const discriminatorPlan = assignDiscriminators(
    identities,
    [],
    configuration.get<readonly string[]>(
      "discriminatorSymbols",
      defaultDiscriminatorSymbols,
    ),
  );
  updateDiscriminatorEnvironment(context, discriminatorPlan.discriminators);
  await vscode.workspace.fs.writeFile(
    workspaceUri,
    new TextEncoder().encode(
      workspaceFileContent(
        snapshot.main.path,
        mainName,
        identities.slice(1),
        discriminatorPlan,
        configuration.get("discriminators", false),
      ),
    ),
  );
  await vscode.commands.executeCommand(
    "vscode.openFolder",
    workspaceUri,
    false,
  );
}

async function planDiscriminators(
  configuration: vscode.WorkspaceConfiguration,
  workspaceUri: vscode.Uri,
  worktrees: readonly { readonly path: string; readonly name: string }[],
): Promise<ReturnType<typeof assignDiscriminators>> {
  const content = new TextDecoder().decode(
    await vscode.workspace.fs.readFile(workspaceUri),
  );
  return assignDiscriminators(
    worktrees,
    readDiscriminatorHistory(content),
    configuration.get<readonly string[]>(
      "discriminatorSymbols",
      defaultDiscriminatorSymbols,
    ),
  );
}

async function synchronizeDiscriminatorSettings(
  context: vscode.ExtensionContext,
  workspaceUri: vscode.Uri,
  plan: ReturnType<typeof assignDiscriminators>,
  visualsEnabled: boolean,
  expectedPaths: readonly string[],
): Promise<void> {
  const content = await readWorkspaceContentWithPaths(
    workspaceUri,
    expectedPaths,
  );
  if (content === undefined) return;
  const next = updateDiscriminatorSettings(
    content,
    plan.discriminators,
    plan.history,
    visualsEnabled,
  );
  if (next !== content) {
    await vscode.workspace.fs.writeFile(
      workspaceUri,
      new TextEncoder().encode(next),
    );
  }
  updateDiscriminatorEnvironment(context, plan.discriminators);
}

async function readWorkspaceContentWithPaths(
  workspaceUri: vscode.Uri,
  expectedPaths: readonly string[],
): Promise<string | undefined> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const content = new TextDecoder().decode(
      await vscode.workspace.fs.readFile(workspaceUri),
    );
    const actualPaths = parseWorkspaceFolders(
      content,
      path.dirname(workspaceUri.fsPath),
    ).map((folder) => folder.path);
    if (pathSetsEqual(expectedPaths, actualPaths)) return content;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  return undefined;
}

function updateDiscriminatorEnvironment(
  context: vscode.ExtensionContext,
  discriminators:
    | readonly {
        readonly path: string;
        readonly name: string;
        readonly symbol: string;
      }[]
    | undefined,
): void {
  const collection = context.environmentVariableCollection;
  collection.persistent = true;
  if (discriminators && discriminators.length > 0) {
    collection.replace(
      discriminatorEnvironmentVariable,
      discriminatorEnvironment(discriminators),
    );
  } else {
    collection.delete(discriminatorEnvironmentVariable);
  }
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

function reconcileFocusedWorkspaceFolders(
  availableUris: readonly string[],
  previouslyManagedUris: readonly string[],
  desired: readonly { uri: vscode.Uri; name: string }[],
  beforeUpdate: () => void,
): void {
  const current = vscode.workspace.workspaceFolders ?? [];
  const next = planFocusedWorkspaceFolders(
    current.map((folder) => ({
      uri: folder.uri.toString(),
      name: folder.name,
    })),
    availableUris,
    previouslyManagedUris,
    desired.map((folder) => ({
      uri: folder.uri.toString(),
      name: folder.name,
    })),
  );
  if (
    workspaceFoldersEqual(
      current.map((folder) => ({
        uri: folder.uri.toString(),
        name: folder.name,
      })),
      next,
    )
  ) {
    return;
  }

  beforeUpdate();
  vscode.workspace.updateWorkspaceFolders(
    0,
    current.length,
    ...next.map((folder) => ({
      uri: vscode.Uri.parse(folder.uri),
      name: folder.name,
    })),
  );
}

async function readWorkspacePaths(
  workspaceUri: vscode.Uri,
): Promise<readonly string[]> {
  try {
    const content = new TextDecoder().decode(
      await vscode.workspace.fs.readFile(workspaceUri),
    );
    return parseWorkspaceFolders(
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
  identities: ReturnType<typeof sortWorktrees>,
  discriminators: ReturnType<typeof assignDiscriminators>["discriminators"],
  visualsEnabled: boolean,
): Promise<readonly GitWorktree[] | undefined> {
  const worktreeByPath = new Map(
    worktrees.map((worktree) => [worktree.path, worktree]),
  );
  const items = pickerItems(identities, discriminators, visualsEnabled).flatMap(
    (item) => {
      const worktree = worktreeByPath.get(item.path);
      return worktree
        ? [
            {
              ...item,
              picked: focusedPaths.some((focusedPath) =>
                pathsEqual(item.path, focusedPath),
              ),
              worktree,
            },
          ]
        : [];
    },
  );
  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: "Select worktrees to focus",
    title: "Focus Multiple Worktrees",
  });
  return selected?.map((item) => item.worktree);
}

async function selectWorktree(
  worktrees: readonly GitWorktree[],
  identities: ReturnType<typeof sortWorktrees>,
  discriminators: ReturnType<typeof assignDiscriminators>["discriminators"],
  visualsEnabled: boolean,
  title = "Focus Worktree",
  placeHolder = "Select a worktree to focus",
): Promise<GitWorktree | undefined> {
  const selectedPath = await selectWorktreePath(
    identities,
    discriminators,
    visualsEnabled,
    title,
    placeHolder,
  );
  return worktrees.find((worktree) => pathsEqual(worktree.path, selectedPath));
}

async function selectWorktreePath(
  identities: ReturnType<typeof sortWorktrees>,
  discriminators: ReturnType<typeof assignDiscriminators>["discriminators"],
  visualsEnabled: boolean,
  title: string,
  placeHolder: string,
): Promise<string | undefined> {
  const items = pickerItems(identities, discriminators, visualsEnabled);
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder,
    title,
  });
  return selected?.path;
}

function pickerItems(
  identities: ReturnType<typeof sortWorktrees>,
  discriminators: ReturnType<typeof assignDiscriminators>["discriminators"],
  visualsEnabled: boolean,
) {
  const symbolByPath = new Map(
    discriminators.map((discriminator) => [
      discriminator.path,
      discriminator.symbol,
    ]),
  );
  return worktreePickerItems(
    identities.map((identity) => ({
      ...identity,
      ...(symbolByPath.get(identity.path)
        ? { symbol: symbolByPath.get(identity.path)! }
        : {}),
    })),
    visualsEnabled,
  );
}

function updateStatus(
  status: vscode.StatusBarItem,
  focused: readonly GitWorktree[],
  worktreeCount: number,
  items: ReturnType<typeof pickerItems>,
): void {
  const first = focused[0];
  if (focused.length === 1 && first) {
    const name =
      items.find((item) => pathsEqual(item.path, first.path))?.label ??
      path.basename(first.path);
    status.text = `$(git-commit) Worktree: ${name}`;
    status.tooltip = `Orchardist is focused on ${name}`;
    status.command = worktreeActionsCommand;
  } else if (focused.length > 1) {
    const names = focused.map((worktree) => path.basename(worktree.path));
    status.text = `$(git-commit) Focused worktrees: ${focused.length}`;
    status.tooltip = `Orchardist is focused on ${names.join(", ")}`;
    status.command = worktreeActionsCommand;
  } else {
    status.text = `$(git-branch) Worktrees: ${worktreeCount}`;
    status.tooltip = `${worktreeCount} Git worktrees`;
    status.command = focusSingleCommand;
  }
  status.show();
}

function inferFocusedPaths(
  folders: readonly vscode.WorkspaceFolder[],
  worktrees: readonly GitWorktree[],
): readonly string[] {
  return inferFocusedPathsFromPaths(
    folders.map((folder) => folder.uri.fsPath),
    worktrees,
  );
}

function inferFocusedPathsFromPaths(
  folderPaths: readonly string[],
  worktrees: readonly GitWorktree[],
): readonly string[] {
  const pathByUri = new Map(
    worktrees.map((worktree) => [
      vscode.Uri.file(worktree.path).toString(),
      worktree.path,
    ]),
  );
  return inferFocusedUris(
    folderPaths.map((folderPath) => vscode.Uri.file(folderPath).toString()),
    [...pathByUri.keys()],
  ).flatMap((uri) => {
    const workspacePath = pathByUri.get(uri);
    return workspacePath ? [workspacePath] : [];
  });
}

function uriSetsEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const rightSet = new Set(right);
  return (
    left.length === rightSet.size && left.every((uri) => rightSet.has(uri))
  );
}

function pathSetsEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((leftPath) =>
      right.some((rightPath) => pathsEqual(leftPath, rightPath)),
    )
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
