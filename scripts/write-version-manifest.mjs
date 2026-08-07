import fs from 'node:fs';
import { execSync } from 'node:child_process';

const source = fs.readFileSync('utils/version.ts', 'utf8');
const version = source.match(/CURRENT_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] || 'unknown';
const date = source.match(/VERSION_DATE\s*=\s*['"]([^'"]+)['"]/)?.[1] || new Date().toISOString().slice(0, 10);
const build = (
  process.env.GITHUB_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.COMMIT_REF ||
  (() => { try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { return 'unknown'; } })()
).slice(0, 7);

const manifest = { version, date, build };
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/version.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`version manifest: v${version} @ ${build}`);
