// Lists the English texts the interface translates (`t`, `tn`, `tr`, `msg`
// in src/) and, with --missing, those without translations yet.
// Usage: node scripts/i18n-keys.mjs [--missing] [--json] [files...]
import fs from 'node:fs';
import path from 'node:path';

const STRING = String.raw`(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")`;
const SINGLE = new RegExp(String.raw`\b(?:t|tr|msg|tKnown)\(\s*` + STRING, 'g');
const PLURAL = new RegExp(
  String.raw`\btn\(\s*[^,()]+(?:\([^()]*\))?,\s*` + STRING + String.raw`\s*,\s*` + STRING,
  'g',
);
const TEMPLATE = /\b(?:t|tr|tn|msg)\(\s*`/g;

const unescape = (s) => s.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');

export function sourceFiles(dir = 'src') {
  const out = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) {
        if (!['tests', 'generated', 'messages'].includes(f)) walk(p);
      } else if (/\.(tsx?|mts)$/.test(f)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** Map of English text -> files that use it, plus template-literal misuse. */
export function extract(files) {
  const keys = new Map();
  const problems = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const add = (k) => {
      if (!keys.has(k)) keys.set(k, new Set());
      keys.get(k).add(file);
    };
    for (const m of src.matchAll(SINGLE)) add(unescape(m[1] ?? m[2]));
    for (const m of src.matchAll(PLURAL)) add(unescape(m[3] ?? m[4]));
    for (const _ of src.matchAll(TEMPLATE))
      problems.push(`${file}: template literal passed to t()`);
  }
  return { keys, problems };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const missingOnly = args.includes('--missing');
  const json = args.includes('--json');
  const files = args.filter((a) => !a.startsWith('--'));
  const { keys, problems } = extract(files.length ? files : sourceFiles());
  let have = new Set();
  if (missingOnly) {
    const dir = 'src/i18n/messages';
    for (const f of fs.readdirSync(dir)) {
      if (f === 'index.ts' || f === 'types.ts') continue;
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const m of src.matchAll(
        /^  (?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|([A-Za-z_$][\w$]*)):/gm,
      ))
        have.add(m[3] ?? unescape(m[1] ?? m[2]));
    }
  }
  const list = [...keys.keys()].filter((k) => !missingOnly || !have.has(k));
  if (json) console.log(JSON.stringify(list, null, 1));
  else for (const k of list) console.log(k);
  for (const p of problems) console.error(p);
  console.error(`${list.length} texts`);
}
