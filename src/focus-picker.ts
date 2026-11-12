import * as vscode from "vscode";
import type { WorktreePickerItem } from "./pickers.ts";

type FocusItem = vscode.QuickPickItem & { path?: string; command?: string };

export async function showFocusPicker(
  trees: readonly WorktreePickerItem[],
  multiple: boolean,
  focusMultipleCommand: string,
  unfocusCommand: string,
): Promise<FocusItem | undefined> {
  const separator = { label: "", kind: vscode.QuickPickItemKind.Separator };
  const selectFocused = {
    label: multiple
      ? "$(list-selection) Select Focused"
      : "$(list-selection) Choose Multiple",
    command: focusMultipleCommand,
  };
  const unfocus = { label: "$(close) Unfocus", command: unfocusCommand };
  const items: FocusItem[] = multiple
    ? [
        selectFocused,
        { ...separator, label: "Focus one" },
        ...trees,
        separator,
        unfocus,
      ]
    : [...trees, separator, selectFocused, unfocus];
  return vscode.window.showQuickPick(items, {
    title: multiple ? "Focused Worktrees" : "Focused Worktree",
    placeHolder: "Select a worktree to focus or choose an action",
  });
}
