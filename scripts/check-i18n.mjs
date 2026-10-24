// Every English UI string that goes through t() needs a Persian entry in ui/src/i18n-fa.ts. This lists the ones that
// lack it (exit code 1 when any do), so a new label never shows up in English inside the Persian UI.
// Usage: node scripts/check-i18n.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui', 'src');
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.startsWith('i18n')) files.push(p);
  }
})(src);

const str = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"`;
const patterns = [
  // t('…'), and the English labels that are passed to t() later.
  new RegExp(String.raw`\bt\(\s*(?:${str})`, 'g'),
  new RegExp(String.raw`\b(?:label|short|hint|text): (?:${str})`, 'g'),
  new RegExp(String.raw`attempt\([^;]*?,\s*(?:${str})\)`, 'g'),
  new RegExp(String.raw`^\s+(?:[\w-]+|'[\w-]+'): (?:${str}),?$`, 'gm'),
];
// Command ids ("conn.toggle") and shortcuts ("Mod+T") are not UI text.
const notText = (k) => /^[a-z]+\.[A-Za-z]+$/.test(k) || /^(Mod|Alt|Shift)\+/.test(k) || /^[a-z-]+$/.test(k) || !/[A-Za-z]/.test(k);

const keys = new Set();
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  for (const re of patterns)
    for (const m of text.matchAll(re)) {
      const k = (m[1] ?? m[2] ?? '').replace(/\\'/g, "'").replace(/\\"/g, '"');
      if (k && !notText(k)) keys.add(k);
    }
}
const fa = fs.readFileSync(path.join(src, 'i18n-fa.ts'), 'utf8');
const has = (k) => fa.includes(JSON.stringify(k)) || fa.includes(`'${k.replace(/'/g, "\\'")}'`) || fa.includes(`"${k}"`);
const missing = [...keys].filter((k) => !has(k));
console.log(`${keys.size} UI strings, ${missing.length} without a Persian translation`);
for (const k of missing) console.log(`  ${JSON.stringify(k)}`);
process.exitCode = missing.length ? 1 : 0;
