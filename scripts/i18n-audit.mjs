// Finds likely untranslated interface text: JSX text and English string
// attributes outside t(). A rough audit for development, not a test.
import fs from 'node:fs';
import { sourceFiles } from './i18n-keys.mjs';

const files = process.argv.slice(2).length ? process.argv.slice(2) : sourceFiles();
for (const file of files) {
  if (!file.endsWith('.tsx')) continue;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const s = line.trim();
    const jsxText =
      /^[A-Z][^<>{}=;()]*[ .!?:…][^<>{}=;()]*$/.test(s) &&
      !/^(import|export|const|let|return|type|if|else|case|default|function|await|throw)\b/.test(
        s,
      ) &&
      !s.includes('//');
    const attr = /\b(aria-label|title|placeholder|label|alt)="[A-Za-z][^"]*[a-z ][^"]*"/.test(s);
    const inline = />[A-Za-z][^<>{}]*[a-z][^<>{}]*</.test(s);
    if (jsxText || attr || inline) console.log(`${file}:${i + 1}: ${s}`);
  });
}
