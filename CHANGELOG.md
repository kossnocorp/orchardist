# Change Log

All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning].

This change log follows the format documented in [Keep a CHANGELOG].

[semantic versioning]: http://semver.org/
[keep a changelog]: http://keepachangelog.com/

## Unreleased

### Added

- Added **Orchardist: Bootstrap Workspace** (`orchardist.bootstrap`) to bootstrap a repository before it has linked worktrees.

### Changed

- Made bootstrapping available from any worktree while keeping the generated workspace in the main worktree.

- Made Orchardist continue watching unbootstrapped repositories and suggest bootstrapping when a linked worktree is created.

### Removed

- Removed the `orchardist.alwaysBootstrap` option. Creating a workspace now always requires an explicit command or confirmation.

## v0.5.1 - 2026-08-08

### Fixed

- Fixed Starship integration instructions.

## v0.5.0 - 2026-08-08

### Added

- Added opt-in worktree discriminators feature (enable via `orchardist.discriminators`) that assigns a stable symbol to each worktree and makes VS Code show these symbols in file labels, editor and terminal tabs, and workspace dir names

- Added a managed terminal tab title based on the workspace folder.

- Added Bash, Zsh, and Fish integrations that expose the current worktree details through `ORCHARDIST_WORKTREE_NAME` and `ORCHARDIST_WORKTREE_SYMBOL` for shell prompts.

- Added **Orchardist: New Terminal** to create worktree terminals with tab color uniquely assigned to each worktree.

- Added default-enabled `orchardist.filterFiles` to hide files from unfocused worktrees in Quick Open and workspace search results using managed `search.exclude` patterns.

### Changed

- Made linked worktrees sort by name and omit the main directory prefix from names such as `project.feature`.

- Made worktree names use normalized short names and show assigned symbols when discriminators are enabled consistently across the Orchardist UI.

## v0.4.0 - 2026-08-06

### Added

- Added the Open Worktree in New Window command (`orchardist.openWorktreeInNewWindow`).

- Added the Focus Multiple Worktrees command (`orchardist.focusMultipleWorktrees`) with a checkbox selection menu.

### Changed

- Renamed the Focus Worktree command to Focus Single Worktree and added focus-mode actions to the status bar menu.

- Removed the `(focused)` workspace folder suffix and now infer focus from the worktrees present in the workspace.

## v0.3.0 - 2026-07-29

### Added

- Added worktree focus feature (`orchardist.focusWorktree` and `orchardist.unfocusWorktree`).

- Added a status bar item showing the number of worktrees and the focused worktree.

- Made Orchardist detect and suggest opening an existing Orchardist workspace when opening a repository with one.

### Changed

- Made Orchardist activate earlier.

### Fixed

- Removed the redundant workspace refresh command.

## v0.2.1 - 2026-07-28

Initial version
