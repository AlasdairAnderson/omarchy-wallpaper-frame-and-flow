const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const repo = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repo, 'ImagePicker.qml'), 'utf8');
function picker() {
  const context = {
    Quickshell: { env: key => key === 'XDG_RUNTIME_DIR' ? '/run/user/1000' : '' },
    Util: { execArgv: argv => context.executed = argv },
    imageDirs: '/backgrounds', selectedImage: '', selectionFile: '', doneFile: '',
    requestActive: false, requestSerial: 1, showAlignment: false, externalRequest: false,
    applyProc: { running: false }, defaultPickerProc: { running: false },
    currentPath: () => '/backgrounds/example.jpg',
    scriptPath: name => path.join(repo, name),
    cancel: () => context.cancelled = true,
    openSelector: (...args) => context.openArgs = args,
    opened: true, errorText: ''
  };
  context.root = context;
  vm.createContext(context);
  for (const name of ['isRuntimePath', 'sanitizeRuntimePath', 'open', 'applySelected', 'finishApply']) {
    const match = source.match(new RegExp('  function ' + name + '\\([^]*?\\n  }'));
    if (match) vm.runInContext(match[0], context);
  }
  return context;
}
test('the plugin replaces only the desktop background service', () => {
  const manifest = require('../manifest.json');
  assert.equal(manifest.omarchy.clonedFrom, 'omarchy.background');
  assert.ok(manifest.kinds.includes('service'));
});
test('a theme request reaches the native theme picker, never the wallpaper carousel', () => {
  const p = picker();
  p.open('{"source":"themes"}');
  assert.equal(p.openArgs, undefined);
  assert.equal(p.executed[3], 'omarchy.image-picker');
  assert.equal(JSON.parse(p.executed[4]).source, 'themes');
});
test('the standalone picker applies without a caller-owned selection file', () => {
  const p = picker();
  p.applySelected();
  assert.equal(p.cancelled, undefined);
  assert.equal(p.applyProc.running, true);
  assert.equal(p.applyProc.command[1], 'set');
});
test('IPC supports Omarchy mktemp files while refusing symlinks and unsafe paths', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-flow-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const runtime = path.join(base, 'runtime');
  fs.mkdirSync(runtime, { mode: 0o700 });
  const env = { ...process.env, XDG_RUNTIME_DIR: runtime, SELECTED_WALLPAPER_PATH: '/images/example.jpg' };
  const run = (...args) => spawnSync(path.join(repo, 'ipc-file.sh'), args, { env, encoding: 'utf8' });
  const selection = path.join(base, 'selection'), done = path.join(base, 'done');
  fs.writeFileSync(selection, '', { mode: 0o600 });
  const result = run('apply', selection, done);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(selection, 'utf8'), '/images/example.jpg\n');
  assert.equal(fs.statSync(selection).mode & 0o777, 0o600);
  assert.ok(fs.existsSync(done));
  const link = path.join(base, 'link');
  fs.symlinkSync(selection, link);
  assert.notEqual(run('write', link).status, 0);
  assert.notEqual(run('write', '/etc/frame-flow-test').status, 0);
});

const model = require('../FrameFlowModel.js');
test('all five alignment steps crop the desktop at the selected position', () => {
  for (const [value, ratio] of [['left', 0], ['25%', 0.25], ['center', 0.5], ['75%', 0.75], ['right', 1]]) {
    assert.equal(model.positionFor('/images/panorama.jpg', { 'panorama.jpg': value }), ratio);
    const geometry = model.coverGeometry(1920, 1080, 3840, 1080, ratio);
    assert.equal(geometry.x, Math.round(-1920 * ratio));
    assert.equal(geometry.width, 3840);
    assert.equal(geometry.height, 1080);
  }
  assert.equal(model.positionFor('/images/a.jpg', { 'a.jpg': 'left', '/images/a.jpg': 'right' }), 1);
  assert.deepEqual(model.decodeSize(1920, 1080, 7680, 2160), { width: 3840, height: 1080 });
  assert.deepEqual(model.decodeSize(1920, 1080, 640, 480), { width: 640, height: 480 });
});
test('slideshow settings are shared, bounded, and default to off', () => {
  assert.deepEqual(model.slideshowConfig(''), { enabled: false, interval: 900 });
  assert.deepEqual(model.slideshowConfig('broken'), { enabled: false, interval: 900 });
  for (const interval of [10, 300, 900, 1800, 3600]) {
    assert.deepEqual(model.slideshowConfig(JSON.stringify({ enabled: true, interval })), { enabled: true, interval });
  }
  assert.equal(model.slideshowConfig('{"enabled":"false","interval":1}').enabled, false);
  assert.equal(model.slideshowConfig('{"enabled":true,"interval":1}').interval, 10);
  assert.equal(model.slideshowConfig('{"interval":999999999999}').interval, 86400);
});

test('standalone application persists alignment and calls the public wallpaper backend safely', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-flow-apply-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const runtime = path.join(base, 'runtime'), bin = path.join(base, 'bin');
  fs.mkdirSync(runtime, { mode: 0o700 }); fs.mkdirSync(bin);
  const wallpaper = path.join(base, 'a $(touch bad) "quoted".png');
  fs.writeFileSync(wallpaper, 'image');
  const record = path.join(base, 'backend-args');
  fs.writeFileSync(path.join(bin, 'omarchy-theme-bg-set'), '#!/bin/bash\nprintf "%s" "$1" > "$TEST_RECORD"\n', { mode: 0o700 });
  const config = path.join(base, 'config', 'alignments.json');
  const result = spawnSync(path.join(repo, 'ipc-file.sh'), ['set', config, '75%'], {
    encoding: 'utf8', env: { ...process.env, XDG_RUNTIME_DIR: runtime, SELECTED_WALLPAPER_PATH: wallpaper, PATH: bin + ':' + process.env.PATH, TEST_RECORD: record }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(record, 'utf8'), wallpaper);
  const saved = JSON.parse(fs.readFileSync(config));
  assert.equal(saved[wallpaper], '75%');
  assert.equal(saved[path.basename(wallpaper)], '75%');
});

test('slideshow advances and wraps across symlinked theme and user backgrounds', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-flow-cycle-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const state = path.join(base, '.local/state/omarchy/current');
  const stock = path.join(base, 'stock'), bin = path.join(base, 'bin');
  const user = path.join(base, '.config/omarchy/backgrounds/example');
  for (const dir of [state, stock, user, bin]) fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(stock, 'backgrounds'));
  const first = path.join(stock, 'backgrounds/first.jpg'), second = path.join(user, 'second.png');
  fs.writeFileSync(first, 'image'); fs.writeFileSync(second, 'image');
  fs.writeFileSync(path.join(stock, 'backgrounds/ignore.txt'), 'ignore');
  fs.symlinkSync(stock, path.join(state, 'theme'));
  fs.writeFileSync(path.join(state, 'theme.name'), 'example\n');
  fs.symlinkSync(first, path.join(state, 'background'));
  fs.writeFileSync(path.join(bin, 'omarchy-theme-bg-set'), '#!/bin/bash\nln -nsf "$1" "$HOME/.local/state/omarchy/current/background"\n', { mode: 0o700 });
  const env = { ...process.env, HOME: base, PATH: bin + ':' + process.env.PATH };
  const run = () => spawnSync('python3', [path.join(repo, 'backgrounds.py'), '--next'], { env, encoding: 'utf8' });
  assert.equal(run().status, 0);
  assert.equal(fs.realpathSync(path.join(state, 'background')), second);
  assert.equal(run().status, 0);
  assert.equal(fs.realpathSync(path.join(state, 'background')), first);
});


test('failed wallpaper application preserves the request for retry', () => {
  const p = picker();
  p.selectionFile = '/tmp/selection'; p.doneFile = '/tmp/done';
  p.requestActive = true;
  p.applySelected();
  p.finishApply(1);
  assert.equal(p.opened, true);
  assert.equal(p.selectionFile, '/tmp/selection');
  assert.equal(p.requestActive, true);
  assert.match(p.errorText, /retry/);
  p.finishApply(0);
  assert.equal(p.opened, false);
  assert.equal(p.selectionFile, '');
  assert.equal(p.requestActive, false);
});

test('file IPC accepts shared sticky /tmp but rejects an insecure private parent', t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-flow-shared-'));
  const target = base + '.selection';
  t.after(() => {
    fs.rmSync(base, { recursive: true, force: true });
    fs.rmSync(target, { force: true });
  });
  const runtime = path.join(base, 'runtime'); fs.mkdirSync(runtime, { mode: 0o700 });
  const env = { ...process.env, XDG_RUNTIME_DIR: runtime };
  const run = file => spawnSync(path.join(repo, 'ipc-file.sh'), ['write', file, '/images/a.jpg'], { env, encoding: 'utf8' });
  const result = run(target);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(target, 'utf8'), '/images/a.jpg\n');
  fs.chmodSync(base, 0o755);
  assert.notEqual(run(path.join(base, 'unsafe')).status, 0);
});
