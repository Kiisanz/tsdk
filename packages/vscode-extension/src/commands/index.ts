import * as vscode from 'vscode';
import { BridgeManager } from '../bridge/bridge-manager.js';

let terminal: vscode.Terminal | undefined;

function getTerminal(): vscode.Terminal {
  if (!terminal || terminal.exitStatus !== undefined) {
    terminal = vscode.window.createTerminal('TSNX');
  }
  return terminal;
}

export function registerCommands(context: vscode.ExtensionContext): void {
  // 1. Sync Configs Command
  context.subscriptions.push(
    vscode.commands.registerCommand('tsnx.syncConfigs', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        vscode.window.showWarningMessage('TSNX: No workspace folder open.');
        return;
      }

      let syncedCount = 0;
      for (const folder of folders) {
        try {
          const res = await BridgeManager.sync(folder.uri.fsPath);
          if (res.scope !== 'none') {
            syncedCount += res.projectCount;
          }
        } catch (err) {
          vscode.window.showErrorMessage(`TSNX Sync error in ${folder.name}: ${(err as Error).message}`);
        }
      }

      if (syncedCount > 0) {
        vscode.window.showInformationMessage(`TSNX: Synchronized ${syncedCount} project(s) for IDE.`);
      }
    }),
  );

  // 2. Build Workspace Command
  context.subscriptions.push(
    vscode.commands.registerCommand('tsnx.buildWorkspace', () => {
      const term = getTerminal();
      term.show();
      term.sendText('tsnx build');
    }),
  );

  // 3. Clean Workspace Command
  context.subscriptions.push(
    vscode.commands.registerCommand('tsnx.cleanWorkspace', () => {
      const term = getTerminal();
      term.show();
      term.sendText('tsnx clean');
    }),
  );
}
