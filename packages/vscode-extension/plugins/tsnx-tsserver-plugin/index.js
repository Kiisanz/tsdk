"use strict";

// plugins/tsnx-tsserver-plugin/src/index.ts
function init(modules) {
  const ts = modules.typescript;
  let currentMappings = [];
  function create(info) {
    const logger = info.project.projectService?.logger;
    logger?.info("[TSNX Plugin] Initializing TSServer Plugin for project: " + info.project.projectName);
    if (info.config && Array.isArray(info.config.mappings)) {
      currentMappings = info.config.mappings;
    }
    const proxy = /* @__PURE__ */ Object.create(null);
    for (const k of Object.keys(info.languageService)) {
      const x = info.languageService[k];
      proxy[k] = (...args) => x.apply(info.languageService, args);
    }
    const origGetQuickInfo = info.languageService.getQuickInfoAtPosition.bind(info.languageService);
    proxy.getQuickInfoAtPosition = (fileName, position) => {
      const prior = origGetQuickInfo(fileName, position);
      if (!prior) return prior;
      const norm = fileName.replace(/\\/g, "/");
      const project = currentMappings.find((p) => {
        const sr = p.sourceRoot.replace(/\\/g, "/");
        return norm.startsWith(sr + "/") || norm === sr;
      });
      if (project && prior.documentation) {
        prior.documentation = [
          { kind: "text", text: `[TSNX: ${project.name}]
` },
          ...prior.documentation
        ];
      }
      return prior;
    };
    return proxy;
  }
  function onConfigurationChanged(config) {
    if (config && Array.isArray(config.mappings)) {
      currentMappings = config.mappings;
    }
  }
  return { create, onConfigurationChanged };
}
module.exports = init;
//# sourceMappingURL=index.js.map
