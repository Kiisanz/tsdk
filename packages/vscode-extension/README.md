# TSNX for Visual Studio Code

The official Visual Studio Code extension for the **TSNX (TypeScript Next)** Framework.

## Features

- **Zero-Config TypeScript Bridge**: Automatically synchronizes `.tswork` and `.tsproj` manifests into transparent IDE project references. No manual `tsconfig.json` maintenance needed!
- **Schema Validation & Autocomplete**: Rich YAML autocomplete, hover documentation, and validation for `.tswork` and `.tsproj` files.
- **Commands**:
  - `TSNX: Synchronize Project Configurations` (`tsnx.syncConfigs`)
  - `TSNX: Build Workspace` (`tsnx.buildWorkspace`)
  - `TSNX: Clean Workspace` (`tsnx.cleanWorkspace`)

## Requirements

Requires Node.js 18+ and TSNX CLI (`npm install -g @tsnx/cli`).

## License

MIT
