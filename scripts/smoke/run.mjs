// Installer smoke test (T49): install the built package, start the app with
// `--smoke-test --smoke-seed` (first run: a test story and a save), install
// the same package again over it, start it again, and check that the story
// is still there. The app writes a report each time; see report.mjs.
//
//   node scripts/smoke/run.mjs --dir <folder with the bundles> --version 0.1.0
//
// Linux: the .deb (with sudo when not root; xvfb-run without a display).
// Windows: the NSIS setup.exe, silently, for the current user.
// macOS: the .dmg, copied to /Applications.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportProblems } from './report.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const RUN_TIMEOUT_MS = 240_000;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function sh(cmd, args, opts = {}) {
  console.log(`$ ${[cmd, ...args].join(' ')}`);
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.error) throw r.error;
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`${cmd} exited with ${r.status ?? r.signal}`);
  }
  return r;
}

function find(dir, test) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory() && !name.endsWith('.app')) out.push(...find(p, test));
    else if (test(name)) out.push(p);
  }
  return out;
}

function one(list, what) {
  if (list.length !== 1) throw new Error(`expected one ${what}, found ${list.length}: ${list}`);
  return list[0];
}

const sudo = (cmd, args) => (process.getuid?.() === 0 ? sh(cmd, args) : sh('sudo', [cmd, ...args]));

const platforms = {
  linux: {
    installer: (dir) =>
      one(
        find(dir, (n) => n.endsWith('.deb')),
        '.deb',
      ),
    install(deb) {
      sudo('apt-get', ['install', '-y', '--reinstall', path.resolve(deb)]);
      const pkg = sh('dpkg-deb', ['-f', deb, 'Package']).stdout.trim();
      const files = sh('dpkg', ['-L', pkg]).stdout.split('\n');
      return one(
        files.filter((f) => f.startsWith('/usr/bin/')),
        'program in /usr/bin',
      );
    },
    run(exe, args, env) {
      return process.env.DISPLAY
        ? sh(exe, args, { env, allowFail: true, timeout: RUN_TIMEOUT_MS })
        : sh('xvfb-run', ['-a', exe, ...args], { env, allowFail: true, timeout: RUN_TIMEOUT_MS });
    },
  },
  win32: {
    installer: (dir) =>
      one(
        find(dir, (n) => n.endsWith('-setup.exe')),
        'NSIS setup.exe',
      ),
    install(setup) {
      sh(setup, ['/S']);
      const base = path.join(process.env.LOCALAPPDATA ?? '', 'Dear to Love');
      return one(
        find(base, (n) => n.endsWith('.exe') && !/^uninstall/i.test(n)),
        `program in ${base}`,
      );
    },
    run: (exe, args, env) => sh(exe, args, { env, allowFail: true, timeout: RUN_TIMEOUT_MS }),
  },
  darwin: {
    installer: (dir) =>
      one(
        find(dir, (n) => n.endsWith('.dmg')),
        '.dmg',
      ),
    install(dmg) {
      const mount = mkdtempSync(path.join(tmpdir(), 'dtl-dmg-'));
      sh('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, dmg]);
      try {
        const app = one(
          readdirSync(mount).filter((n) => n.endsWith('.app')),
          '.app in the disk image',
        );
        const dest = path.join('/Applications', app);
        rmSync(dest, { recursive: true, force: true });
        sh('ditto', [path.join(mount, app), dest]);
        const macos = path.join(dest, 'Contents', 'MacOS');
        return path.join(macos, one(readdirSync(macos), 'program in Contents/MacOS'));
      } finally {
        sh('hdiutil', ['detach', mount], { allowFail: true });
      }
    },
    run: (exe, args, env) => sh(exe, args, { env, allowFail: true, timeout: RUN_TIMEOUT_MS }),
  },
};

function main() {
  const dir = arg('--dir');
  const version = arg('--version');
  if (!dir || !version) {
    console.error('Usage: node scripts/smoke/run.mjs --dir <bundles> --version <x.y.z>');
    process.exit(2);
  }
  const p = platforms[process.platform];
  if (!p) throw new Error(`no smoke test for ${process.platform}`);
  const schema = readdirSync(path.join(root, 'src-tauri', 'migrations')).filter((f) =>
    /^\d{4}_.*\.sql$/.test(f),
  ).length;
  const work = mkdtempSync(path.join(tmpdir(), 'dtl-smoke-'));
  // Linux: a fresh data folder of its own. Windows and macOS runners start
  // empty, so the app's usual folder is used there.
  const env = { ...process.env };
  if (process.platform === 'linux') {
    env.XDG_DATA_HOME = path.join(work, 'data');
    env.XDG_CONFIG_HOME = path.join(work, 'config');
  }
  const installer = path.resolve(p.installer(dir));
  console.log(`Installer: ${installer}`);

  const runs = [
    { name: 'first run', seeded: true },
    { name: 'after reinstalling', seeded: false },
  ];
  let failed = false;
  for (const [i, run] of runs.entries()) {
    console.log(`\n== ${run.name}`);
    const exe = p.install(installer);
    const report = path.join(work, `report-${i + 1}.json`);
    const args = ['--smoke-test', report, ...(run.seeded ? ['--smoke-seed'] : [])];
    const r = p.run(exe, args, env);
    if (r.status !== 0) console.log(`The app exited with ${r.status ?? r.signal}.`);
    const data = existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : null;
    console.log(JSON.stringify(data, null, 2));
    const problems = reportProblems(data, { version, schema, seeded: run.seeded });
    if (problems.length) {
      failed = true;
      console.log(`FAILED (${run.name}):\n  ${problems.join('\n  ')}`);
    } else {
      console.log(`PASSED (${run.name})`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main();
