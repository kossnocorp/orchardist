# Change Log

All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning].

This change log follows the format documented in [Keep a CHANGELOG].

[semantic versioning]: http://semver.org/
[keep a changelog]: http://keepachangelog.com/

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
