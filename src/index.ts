import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    "orchardist.helloWorld",
    async () => {
      await vscode.window.showInformationMessage("Hello, cruel world!");
    },
  );

  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
