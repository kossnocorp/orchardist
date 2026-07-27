import * as vscode from "vscode";
import * as path from "node:path";
import { addGitignoreEntry, workspaceFileContent } from "./bootstrap.ts";
import {
  planDirectoryExclusion,
  planWorkspaceFolders,
  workspaceFoldersEqual,
  type ExcludeValue,
  type ManagedExclusion,
} from "./reconcile.ts";

const configurationSection = "orchardist";
const refreshCommand = "orchardist.refresh";
const mainFolderKey = "mainFolder";
const managedRootKey = "managedRoot";
const managedExclusionKey = "managedExclusion";
const managedFolderExclusionKey = "managedFolderExclusion";
const bootstrapAction = "Bootstrap Workspace";

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const mainFolder = resolveMainFolder(context);
  if (!mainFolder) return;

  const configuration = vscode.workspace.getConfiguration(
    configurationSection,
    mainFolder.uri,
  );
  if (!configuration.get("enabled", true)) return;

  const directory = configuration.get("directory", "./trees");
  const mainName = configuration.get("mainName", "main");
  const treesUri = vscode.Uri.joinPath(mainFolder.uri, directory);
  const entries = await readDirectories(treesUri);
  const workspaceUri = vscode.Uri.joinPath(
    mainFolder.uri,
    `${projectName(mainFolder.uri)}.code-workspace`,
  );

  if (!isCurrentWorkspace(workspaceUri)) {
    if (entries.length === 0) return;

    const alwaysBootstrap = configuration.get("alwaysBootstrap", false);
    const choice = alwaysBootstrap
      ? bootstrapAction
      : await vscode.window.showInformationMessage(
          "Orchardist detected worktrees. Do you want to bootstrap this workspace?",
          bootstrapAction,
        );
    if (choice !== bootstrapAction) return;

    await bootstrapWorkspace(
      context,
      mainFolder,
      directory,
      mainName,
      entries,
      workspaceUri,
    );
    return;
  }

  let watcher: vscode.FileSystemWatcher | undefined;
  let timer: NodeJS.Timeout | undefined;

  const sync = async (): Promise<void> => {
    const currentConfiguration = vscode.workspace.getConfiguration(
      configurationSection,
      mainFolder.uri,
    );
    if (!currentConfiguration.get("enabled", true)) return;

    const currentDirectory = currentConfiguration.get("directory", "./trees");
    const currentMainName = currentConfiguration.get("mainName", "main");
    const currentTreesUri = vscode.Uri.joinPath(
      mainFolder.uri,
      currentDirectory,
    );
    const currentEntries = await readDirectories(currentTreesUri);
    const desired = currentEntries.map((name) => ({
      uri: vscode.Uri.joinPath(currentTreesUri, name),
      name,
    }));

    const managedRoot = currentTreesUri.toString();
    const previousManagedRoot =
      context.workspaceState.get<string>(managedRootKey);
    await context.workspaceState.update(managedRootKey, managedRoot);
    await configureMainFolderExclusion(context, mainFolder, currentDirectory);
    reconcileWorkspaceFolders(
      mainFolder,
      currentMainName,
      [previousManagedRoot, managedRoot].filter(
        (uri): uri is string => uri !== undefined,
      ),
      desired,
    );
  };

  const scheduleSync = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void sync(), 200);
  };

  const configureWatcher = (): void => {
    watcher?.dispose();
    const directory = vscode.workspace
      .getConfiguration(configurationSection, mainFolder.uri)
      .get("directory", "./trees");
    watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        mainFolder,
        `${directory.replace(/^\.\//, "")}/*`,
      ),
    );
    context.subscriptions.push(watcher);
    watcher.onDidCreate(scheduleSync);
    watcher.onDidDelete(scheduleSync);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(refreshCommand, sync),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(configurationSection, mainFolder.uri))
        return;
      configureWatcher();
      scheduleSync();
    }),
    { dispose: () => timer && clearTimeout(timer) },
  );

  configureWatcher();
  void sync();
}

export function deactivate(): void {}

async function bootstrapWorkspace(
  context: vscode.ExtensionContext,
  mainFolder: vscode.WorkspaceFolder,
  directory: string,
  mainName: string,
  entries: readonly string[],
  workspaceUri: vscode.Uri,
): Promise<void> {
  await configureMainFolderExclusion(context, mainFolder, directory);
  await addWorkspaceToGitignore(mainFolder.uri, workspaceUri);

  await vscode.workspace.fs.writeFile(
    workspaceUri,
    new TextEncoder().encode(
      workspaceFileContent(directory, mainName, entries),
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
  if (!(await exists(vscode.Uri.joinPath(rootUri, ".git")))) return;

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

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch (error) {
    if (isFileNotFound(error)) return false;
    throw error;
  }
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

async function configureMainFolderExclusion(
  context: vscode.ExtensionContext,
  mainFolder: vscode.WorkspaceFolder,
  directory: string,
): Promise<void> {
  await removeLegacyWorkspaceExclusion(context);

  const relativeDirectory = directory.replace(/^\.\//, "").replace(/\/$/, "");
  const pattern = relativeDirectory;
  const configuration = vscode.workspace.getConfiguration(
    "files",
    mainFolder.uri,
  );
  const current =
    configuration.inspect<Record<string, ExcludeValue>>("exclude")
      ?.workspaceFolderValue ?? {};
  const previous = context.workspaceState.get<ManagedExclusion>(
    managedFolderExclusionKey,
  );
  const { exclude, managed } = planDirectoryExclusion(
    current,
    previous,
    pattern,
  );

  await context.workspaceState.update(managedFolderExclusionKey, managed);
  await configuration.update(
    "exclude",
    exclude,
    vscode.ConfigurationTarget.WorkspaceFolder,
  );
}

async function removeLegacyWorkspaceExclusion(
  context: vscode.ExtensionContext,
): Promise<void> {
  const managed =
    context.workspaceState.get<ManagedExclusion>(managedExclusionKey);
  if (!managed) return;

  const configuration = vscode.workspace.getConfiguration("files");
  const exclude = {
    ...configuration.inspect<Record<string, ExcludeValue>>("exclude")
      ?.workspaceValue,
  };
  if (exclude[managed.pattern] === true) {
    if (managed.previousValue === null) delete exclude[managed.pattern];
    else exclude[managed.pattern] = managed.previousValue;
    await configuration.update(
      "exclude",
      exclude,
      vscode.ConfigurationTarget.Workspace,
    );
  }

  await context.workspaceState.update(managedExclusionKey, undefined);
}

function resolveMainFolder(
  context: vscode.ExtensionContext,
): vscode.WorkspaceFolder | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return undefined;

  const savedUri = context.workspaceState.get<string>(mainFolderKey);
  const mainFolder =
    folders.find((folder) => folder.uri.toString() === savedUri) ?? folders[0];
  if (!mainFolder) return undefined;

  void context.workspaceState.update(mainFolderKey, mainFolder.uri.toString());
  return mainFolder;
}

async function readDirectories(uri: vscode.Uri): Promise<string[]> {
  try {
    const entries = await vscode.workspace.fs.readDirectory(uri);
    return entries
      .filter(([, type]) => type === vscode.FileType.Directory)
      .map(([name]) => name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isFileNotFound(error)) return [];
    throw error;
  }
}

function reconcileWorkspaceFolders(
  mainFolder: vscode.WorkspaceFolder,
  mainName: string,
  managedRootUris: readonly string[],
  desired: readonly { uri: vscode.Uri; name: string }[],
): void {
  const current = vscode.workspace.workspaceFolders ?? [];
  const next = planWorkspaceFolders(
    current.map((folder) => ({
      uri: folder.uri.toString(),
      name: folder.name,
    })),
    mainFolder.uri.toString(),
    mainName,
    managedRootUris,
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
