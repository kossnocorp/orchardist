# VS Code Orchardist

Sync VS Code workspace with Git worktrees.

It watches for Git worktrees in a project and automatically generates a VS Code workspace that includes all of them.

It allows you to work in a single VS Code window with multiple worktrees, without having to open multiple windows or manually manage workspaces.

## Installation

- For Visual Studio Code, [install from VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nocorp.orchardist).
- For Cursor, Antigravity, Windsurf, etc., [install from Open VSX Registry](https://open-vsx.org/extension/nocorp/orchardist).

## Configuration

### `orchardist.enabled`

Defaults to `true`. Set to `false` to disable the extension.

### `orchardist.alwaysBootstrap`

Defaults to `false`. Set to `true` to automatically bootstrap a workspace regardless of whether a repository has worktrees.

### `orchardist.mainName`

Defaults to `main`. Set the main workspace name.

### `orchardist.ignoreWorkspaceFile`

Defaults to `true`. Set to `false` to stop the extension from automatically adding the workspace file to `.gitignore`.

## Changelog

See [the changelog](./CHANGELOG.md).

## License

[MIT © Sasha Koss](https://koss.nocorp.me/mit/)
