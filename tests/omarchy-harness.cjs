// Execute the installed Omarchy JS in an isolated VM; no desktop IPC or IO.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.OMARCHY_PATH || '/usr/share/omarchy';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = require('../manifest.json');
const clone = value => JSON.parse(JSON.stringify(value));

function functions(source, context) {
  // Top-level QML JS functions end at the two-space closing brace. Assert
  // each requested function exists at its call site so upstream drift fails.
  vm.createContext(context);
  for (const match of source.matchAll(/^  function \w+\([^]*?^  }/gm))
    vm.runInContext(match[0], context);
  return context;
}

function registry(config, registrySource = read('shell/services/PluginRegistry.qml')) {
  const util = functions(read('shell/Commons/Util.qml'), {});
  util.barSections = ['left', 'centerBegin', 'center', 'centerEnd', 'right', 'tray'];
  return functions(registrySource, {
    Util: util, console, registryRevision: 0, lastEnableError: '',
    installedPlugins: {
      [manifest.id]: clone(manifest),
      'omarchy.background': { kinds: ['service'], __isFirstParty: true },
      'omarchy.image-picker': { kinds: ['overlay'], __isFirstParty: true }
    },
    shellConfigProvider: () => config,
    shellConfigMutator: mutate => mutate(config),
    pluginsChanged() {}
  });
}

module.exports = { functions, registry };
