import type * as tsModule from 'typescript';

interface ProjectMapping {
  name: string;
  directory: string;
  sourceRoot: string;
  configPath: string;
  compilerOptions: Record<string, unknown>;
  references: string[];
}

interface PluginConfig {
  mappings?: ProjectMapping[];
}

function init(modules: { typescript: typeof tsModule }) {
  const ts = modules.typescript;
  let currentMappings: ProjectMapping[] = [];

  function create(info: tsModule.server.PluginCreateInfo): tsModule.LanguageService {
    const logger = info.project.projectService?.logger;
    logger?.info('[TSNX Plugin] Initializing TSServer Plugin for project: ' + info.project.projectName);

    // Initial config if provided
    if (info.config && Array.isArray((info.config as PluginConfig).mappings)) {
      currentMappings = (info.config as PluginConfig).mappings!;
    }

    // Set up Language Service Proxy
    const proxy: tsModule.LanguageService = Object.create(null);
    for (const k of Object.keys(info.languageService) as Array<keyof tsModule.LanguageService>) {
      const x = info.languageService[k]!;
      // @ts-expect-error dynamic proxy assignment
      proxy[k] = (...args: unknown[]) => x.apply(info.languageService, args);
    }

    // Intercept QuickInfo (Hover) to show TSNX Project context in tooltips
    const origGetQuickInfo = info.languageService.getQuickInfoAtPosition.bind(info.languageService);
    proxy.getQuickInfoAtPosition = (fileName: string, position: number) => {
      const prior = origGetQuickInfo(fileName, position);
      if (!prior) return prior;

      const norm = fileName.replace(/\\/g, '/');
      const project = currentMappings.find((p) => {
        const sr = p.sourceRoot.replace(/\\/g, '/');
        return norm.startsWith(sr + '/') || norm === sr;
      });

      if (project && prior.documentation) {
        prior.documentation = [
          { kind: 'text', text: `[TSNX: ${project.name}]\n` },
          ...prior.documentation,
        ];
      }

      return prior;
    };

    return proxy;
  }

  function onConfigurationChanged(config: PluginConfig | undefined): void {
    if (config && Array.isArray(config.mappings)) {
      currentMappings = config.mappings;
    }
  }

  return { create, onConfigurationChanged };
}

export = init;
