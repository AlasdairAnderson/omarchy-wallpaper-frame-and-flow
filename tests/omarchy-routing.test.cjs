// Runs against the installed Omarchy implementation, without touching user state.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = process.env.OMARCHY_PATH || '/usr/share/omarchy';
const available = fs.existsSync(path.join(root, 'shell/services/PluginRegistry.qml'));
const integration = (name, fn) => test(name, { skip: available ? false : 'requires Omarchy 4.5 sources' }, fn);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = require('../manifest.json');
const clone = value => JSON.parse(JSON.stringify(value));

const { functions, registry } = require('./omarchy-harness.cjs');

integration('stock background aliases share a route and themes retain the native image picker', () => {
  const model = require(path.join(root, 'shell/plugins/menu/MenuModel.js'));
  const menu = model.mergeMenuSources(model.parseMenuJsonc(read('default/omarchy/omarchy-menu.jsonc')), []);
  for (const route of ['appearance.background', 'background', 'wallpaper']) {
    const id = model.resolveRoute(menu.items, menu.itemOrder, route);
    assert.equal(id, 'appearance.background');
    // Explicitly locks down the 4.5 limitation, not the desired future behavior.
    assert.match(menu.items[id].action, /omarchy-theme-bg-switcher/);
  }
  for (const route of ['appearance.theme', 'theme', 'themes']) {
    const id = model.resolveRoute(menu.items, menu.itemOrder, route);
    assert.equal(id, 'appearance.theme');
    assert.match(menu.items[id].action, /summon omarchy\.image-picker/);
    assert.match(menu.items[id].action, /source.*themes/);
  }
  const bindings = read('default/hypr/bindings/utilities.lua');
  for (const key of ['SPACE', 'W'])
    assert.ok(bindings.includes(`o.bind("SUPER + CTRL + ${key}", "Background switcher", { menu = "background" })`));
});

integration('upstream proposal routes every background entry and restores native selection through the real registry lifecycle', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-flow-upstream-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const files = ['shell/services/PluginRegistry.qml', 'shell/shell.qml', 'default/omarchy/omarchy-menu.jsonc'];
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(temp, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(temp, file));
  }
  const patch = path.resolve(__dirname, '../upstream/omarchy-4.5-background-picker.patch');
  for (const args of [['apply', '--check', patch], ['apply', patch]]) {
    const result = spawnSync('git', args, { cwd: temp, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  const patched = file => fs.readFileSync(path.join(temp, file), 'utf8');
  const model = require(path.join(root, 'shell/plugins/menu/MenuModel.js'));
  const menu = model.mergeMenuSources(model.parseMenuJsonc(patched(files[2])), []);
  const config = { plugins: [{ id: 'personal.service', value: 42 }], idle: { lock: 123 } };
  const r = registry(config, patched(files[0]));
  r.ensureConfigShape(config);
  const before = clone(config);
  const calls = [];
  const shell = { pluginRegistry: r, summon: (id, payload) => { calls.push([id, payload]); return true; } };
  const source = patched(files[1]);
  const helper = source.match(/^  function selectBackground\(\) \{[^]*?^  }/m);
  assert.ok(helper);
  const context = { shell, Util: { execArgv: argv => calls.push(Array.from(argv)) } };
  vm.createContext(context);
  vm.runInContext(helper[0], context);
  shell.selectBackground = context.selectBackground;
  assert.match(source, /function selectBackground\(\): string \{\s+return shell\.selectBackground\(\)/);

  function open(route, enhanced) {
    const id = model.resolveRoute(menu.items, menu.itemOrder, route);
    assert.equal(menu.items[id].action, 'omarchy-shell shell selectBackground');
    context.selectBackground();
    const call = calls.pop();
    if (enhanced) assert.deepEqual(call, [manifest.id, '{}']);
    else {
      assert.deepEqual(call.slice(0, 2), ['bash', '-c']);
      assert.match(call[2], /omarchy-theme-bg-switcher/);
      assert.match(call[2], /omarchy-theme-bg-set/);
    }
  }
  for (const enabled of [false, true, true, false, true]) {
    r.setEnabled(manifest.id, enabled, {});
    for (const route of ['background', 'wallpaper', 'appearance.background']) open(route, enabled);
    // Follow both stock hotkeys through their actual declared menu route.
    const bindings = read('default/hypr/bindings/utilities.lua');
    for (const key of ['SPACE', 'W']) {
      const binding = bindings.match(new RegExp(`o\\.bind\\("SUPER \\+ CTRL \\+ ${key}", "Background switcher", \\{ menu = "([^"]+)" \\}\\)`));
      assert.ok(binding, key);
      open(binding[1], enabled);
    }
    assert.equal(r.resolveEnabledId('omarchy.image-picker'), 'omarchy.image-picker');
    assert.equal(menu.items['appearance.theme'].action,
      model.mergeMenuSources(model.parseMenuJsonc(read(files[2])), []).items['appearance.theme'].action);
  }
  shell.summon = () => false;
  open('background', false);
  shell.summon = (id, payload) => { calls.push([id, payload]); return true; };
  const override = model.mergeMenuSources(model.parseMenuJsonc(patched(files[2])),
    model.parseMenuJsonc('{"appearance.background":{"action":"personal-picker","aliases":["background","wallpaper"]},"personal.notes":{"action":"notes"}}'));
  assert.equal(override.items['appearance.background'].action, 'personal-picker');
  assert.equal(override.items['personal.notes'].action, 'notes');
  // Real remove disables before deleting the installed manifest.
  r.setEnabled(manifest.id, false, {});
  delete r.installedPlugins[manifest.id];
  for (const route of ['background', 'wallpaper', 'appearance.background']) open(route, false);
  assert.deepEqual(clone(config), before);
  assert.equal(r.isEnabled('omarchy.background'), true);

  // Opt-in is strict; merely being a background clone cannot hijack selection.
  r.installedPlugins[manifest.id] = clone(manifest);
  r.setEnabled(manifest.id, true, {});
  for (const value of [undefined, false, 'true']) {
    r.installedPlugins[manifest.id].omarchy.backgroundPicker = value;
    assert.equal(r.backgroundPickerId(), '');
  }
  r.installedPlugins[manifest.id].omarchy.backgroundPicker = true;
  r.installedPlugins[manifest.id].kinds = ['service'];
  assert.equal(r.backgroundPickerId(), '');
  r.installedPlugins[manifest.id].kinds = ['overlay', 'service'];
  r.installedPlugins[manifest.id].entryPoints.overlay = '../escape.qml';
  assert.equal(r.backgroundPickerId(), '');
});

integration('enable/disable and removal restore the native renderer without changing unrelated configuration', () => {
  const config = {
    bar: { layout: { left: [{ id: 'personal.widget', arbitrary: 7 }] } },
    plugins: [{ id: 'personal.service', settings: { keep: true } }],
    disabledPlugins: ['personal.disabled'], idle: { lock: 321 }, personal: { keep: 'yes' }
  };
  const r = registry(config);
  // Normalize only the shape Omarchy itself always initializes.
  r.ensureConfigShape(config);
  const original = clone(config);
  for (const remove of [false, true]) {
    assert.equal(r.setEnabled(manifest.id, true, {}), true);
    assert.equal(r.resolveEnabledId('omarchy.background'), manifest.id);
    assert.equal(r.isEnabled('omarchy.background'), false);
    assert.equal(r.resolveEnabledId('omarchy.image-picker'), 'omarchy.image-picker');
    assert.equal(r.isEnabled('omarchy.image-picker'), true);
    // Preserve edits made while the plugin is enabled, too.
    config.personal.during = 'retained';
    original.personal.during = 'retained';
    assert.equal(r.setEnabled(manifest.id, false, {}), true);
    if (remove) delete r.installedPlugins[manifest.id];
    assert.equal(r.resolveEnabledId('omarchy.background'), 'omarchy.background');
    assert.equal(r.isEnabled('omarchy.background'), true);
    assert.deepEqual(clone(config), original);
  }
});

integration('a previously disabled native renderer stays disabled after the clone is disabled', () => {
  const config = { disabledPlugins: ['omarchy.background'] };
  const r = registry(config);
  r.setEnabled(manifest.id, true, {});
  r.setEnabled(manifest.id, false, {});
  assert.equal(r.isEnabled('omarchy.background'), false);
});

integration('real add/enable/disable/remove commands preserve user files in an isolated HOME', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-flow-install-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const home = path.join(temp, 'home'), bin = path.join(temp, 'bin'), gitRepo = path.join(temp, 'repo');
  for (const dir of [home, bin, gitRepo]) fs.mkdirSync(dir);
  // Use the project's actual distributable files in a local git remote.
  for (const entry of fs.readdirSync(path.resolve(__dirname, '..'), { withFileTypes: true }))
    if (entry.isFile()) fs.copyFileSync(path.resolve(__dirname, '..', entry.name), path.join(gitRepo, entry.name));
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'),
    OMARCHY_PATH: root, PATH: `${bin}:${path.join(root, 'bin')}:${process.env.PATH}` };
  function run(command, args, cwd = temp) {
    const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout}`);
    return result;
  }
  run('git', ['init', '-q'], gitRepo);
  run('git', ['add', '.'], gitRepo);
  run('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'], gitRepo);
  const userFiles = {
    'omarchy/extensions/omarchy-menu.jsonc': '// keep comments\n{"personal.notes":{"action":"notes"}}\n',
    'hypr/bindings.lua': '-- keep binding\no.bind("SUPER + F12", "Notes", "notes")\n',
    'omarchy/plugins/personal.service/settings.json': '{"keep":42}\n'
  };
  for (const [file, content] of Object.entries(userFiles)) {
    const target = path.join(home, '.config', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  const configPath = path.join(home, '.config/omarchy/shell.json');
  const config = { plugins: [{ id: 'personal.service', custom: true }], idle: { lock: 321 } };
  registry(config).ensureConfigShape(config);
  fs.writeFileSync(configPath, JSON.stringify(config));
  // Only the IPC transport is substituted. The commands, registry mutation,
  // clone, validation, catalog, installation, and deletion are real Omarchy.
  fs.writeFileSync(path.join(bin, 'omarchy-shell'), `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const { registry } = require(${JSON.stringify(path.join(__dirname, 'omarchy-harness.cjs'))});
const configPath = path.join(process.env.HOME, '.config/omarchy/shell.json');
const config = JSON.parse(fs.readFileSync(configPath));
const r = registry(config);
const id = ${JSON.stringify(manifest.id)};
if (!fs.existsSync(path.join(process.env.HOME, '.config/omarchy/plugins', id))) delete r.installedPlugins[id];
const [, method, key, value] = process.argv.slice(2);
if (method === 'listPlugins') console.log(JSON.stringify(Object.keys(r.installedPlugins).map(id => ({id, enabled:r.isEnabled(id)}))));
else if (method === 'rescanPlugins') console.log('ok');
else if (method === 'enablePlugin' || method === 'setPluginEnabled') {
  const ok = r.setEnabled(key, method === 'enablePlugin' || value === 'true', {});
  fs.writeFileSync(configPath, JSON.stringify(config));
  console.log(ok ? 'ok' : 'unknown');
} else process.exit(1);
`, { mode: 0o755 });
  const checkFiles = () => {
    for (const [file, content] of Object.entries(userFiles))
      assert.equal(fs.readFileSync(path.join(home, '.config', file), 'utf8'), content);
  };
  run('omarchy-plugin-add', [gitRepo, '--enable', '--yes']);
  const installed = path.join(home, '.config/omarchy/plugins', manifest.id);
  assert.ok(fs.existsSync(path.join(installed, 'ImagePicker.qml')));
  assert.ok(JSON.parse(fs.readFileSync(configPath)).disabledPlugins.includes('omarchy.background'));
  checkFiles();
  run('omarchy-plugin-disable', [manifest.id]);
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath)), clone(config));
  checkFiles();
  run('omarchy-plugin-enable', [manifest.id]);
  run('omarchy-plugin-remove', [manifest.id, '--yes']);
  assert.equal(fs.existsSync(installed), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath)), clone(config));
  checkFiles();
});

integration('plugin lifecycle leaves menu overrides and aliases entirely under user ownership', () => {
  const model = require(path.join(root, 'shell/plugins/menu/MenuModel.js'));
  const raw = '// user comments remain untouched\n{"personal.notes":{"action":"notes"},"appearance.background":{"action":"custom-wallpaper","aliases":["background","wallpaper"]}}';
  const config = {};
  const r = registry(config);
  const menu = () => model.mergeMenuSources(model.parseMenuJsonc(read('default/omarchy/omarchy-menu.jsonc')), model.parseMenuJsonc(raw));
  for (const enabled of [true, false]) {
    r.setEnabled(manifest.id, enabled, {});
    const merged = menu();
    assert.equal(merged.items['personal.notes'].action, 'notes');
    for (const alias of ['background', 'wallpaper'])
      assert.equal(merged.items[model.resolveRoute(merged.items, merged.itemOrder, alias)].action, 'custom-wallpaper');
  }
});

test('desktop left/right double-click handlers open separate background and theme pickers', () => {
  const source = fs.readFileSync(path.join(__dirname, '../Background.qml'), 'utf8');
  const calls = [];
  const context = functions(source, {
    pluginId: manifest.id, shell: { summon: (...args) => { calls.push(args); return true; } },
    Util: { execArgv: argv => calls.push(argv) }
  });
  context.root = context;
  context.openSelector();
  assert.deepEqual(calls.shift(), [manifest.id, '{}']);
  context.openThemeSwitcher();
  assert.deepEqual(Array.from(calls.shift()), ['omarchy-shell', 'shell', 'summon', 'omarchy.image-picker', '{"source":"themes"}']);
  const handler = source.match(/onDoubleClicked: function\(mouse\) \{([^]*?)\n        }/);
  assert.ok(handler);
  const buttons = [];
  vm.runInNewContext(`(function(mouse) {${handler[1]}})({button: 1})`, {
    Qt: { RightButton: 2 }, root: { openSelector: () => buttons.push('background'), openThemeSwitcher: () => buttons.push('theme') }
  });
  vm.runInNewContext(`(function(mouse) {${handler[1]}})({button: 2})`, {
    Qt: { RightButton: 2 }, root: { openSelector: () => buttons.push('background'), openThemeSwitcher: () => buttons.push('theme') }
  });
  assert.deepEqual(buttons, ['background', 'theme']);
});
