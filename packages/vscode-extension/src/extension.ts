import * as vscode from 'vscode';
import { BridgeManager } from './bridge/bridge-manager.js';
import { ProjectMapper, ProjectMapping } from './project-mapper.js';
import { registerCommands } from './commands/index.js';

let statusBarItem: vscode.StatusBarItem;
let syncTimeout: NodeJS.Timeout | undefined;

interface TypeScriptExtensionApi {
  configurePlugin(pluginId: string, configuration: Record<string, unknown>): void;
}

async function getTsPluginApi(): Promise<TypeScriptExtensionApi | undefined> {
  try {
    const tsExt = vscode.extensions.getExtension('vscode.typescript-language-features');
    if (!tsExt) return undefined;
    if (!tsExt.isActive) {
      await tsExt.activate();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exports = tsExt.exports as any;
    return exports?.getAPI ? exports.getAPI(0) : undefined;
  } catch {
    return undefined;
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // 1. Register commands
  registerCommands(context);

  // 2. Setup Status Bar Item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  statusBarItem.command = 'tsnx.syncConfigs';
  statusBarItem.text = '$(layers) TSNX';
  statusBarItem.tooltip = 'Click to synchronize TSNX TypeScript configurations';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // 3. Initial sync across all open workspace folders
  await triggerSync();

  // 4. File Watcher for reactive updates when manifests change
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{tswork,tsproj}');

  const debouncedSync = () => {
    if (syncTimeout) {
      clearTimeout(syncTimeout);
    }
    syncTimeout = setTimeout(() => {
      triggerSync().catch((err) => {
        console.error('[TSNX Extension] Watcher sync error:', err);
      });
    }, 500);
  };

  watcher.onDidChange(debouncedSync);
  watcher.onDidCreate(debouncedSync);
  watcher.onDidDelete(debouncedSync);

  context.subscriptions.push(watcher);
}

async function triggerSync(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return;
  }

  let totalProjects = 0;
  let active = false;
  const allMappings: ProjectMapping[] = [];

  for (const folder of folders) {
    const rootPath = folder.uri.fsPath;
    try {
      // Step A: Sync physical configs
      const res = await BridgeManager.sync(rootPath);
      if (res.scope !== 'none') {
        active = true;
        totalProjects += res.projectCount;
      }

      // Step B: Extract project mappings and compiler options
      const wsMapping = ProjectMapper.getWorkspaceMapping(rootPath);
      if (wsMapping) {
        allMappings.push(...wsMapping.projects);
      }
    } catch (err) {
      console.error(`[TSNX Extension] Sync failed in ${folder.name}:`, err);
    }
  }

  // Step C: Push mapped projects & compiler settings to TSServer Plugin
  const tsApi = await getTsPluginApi();
  if (tsApi) {
    tsApi.configurePlugin('tsnx-tsserver-plugin', {
      mappings: allMappings,
    });
  }

  if (active && statusBarItem) {
    statusBarItem.text = `$(layers) TSNX (${totalProjects})`;
    statusBarItem.tooltip = `TSNX Active: ${totalProjects} project(s) synchronized with TSServer. Click to re-sync.`;
  }
}

export function deactivate(): void {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
}
