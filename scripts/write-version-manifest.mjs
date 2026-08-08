import fs from 'node:fs';
import { execSync } from 'node:child_process';

const run = (command, fallback = '') => {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
};

const fullBuild = (
  process.env.GITHUB_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.COMMIT_REF ||
  run('git rev-parse HEAD', 'unknown')
);
const build = fullBuild.slice(0, 7);
const headDate = run('git show -s --format=%cs HEAD', new Date().toISOString().slice(0, 10));
const date = /^\d{4}-\d{2}-\d{2}$/.test(headDate) ? headDate : new Date().toISOString().slice(0, 10);
// 版本号由构建日期自动产生；同一天的多个构建由 build hash 区分，不再手工卡在 1.3.0。
const version = date.replaceAll('-', '.');

const typeLabels = {
  feat: '功能',
  fix: '修复',
  perf: '性能',
  refactor: '重构',
  docs: '文档',
  test: '测试',
  build: '构建',
  ci: '工程',
  chore: '维护',
  revert: '回退',
};

const parseCommit = (line) => {
  const [hash, subject, commitDate] = line.split('\x1f');
  if (!hash || !subject) return null;
  const match = subject.match(/^(feat|fix|perf|refactor|docs|test|build|ci|chore|revert)(?:\(([^)]+)\))?!?:\s*(.+)$/i);
  const type = (match?.[1] || 'chore').toLowerCase();
  const scope = match?.[2] || '';
  const text = (match?.[3] || subject).trim();
  const label = typeLabels[type] || '更新';
  return {
    hash: hash.slice(0, 7),
    type,
    scope,
    subject: text,
    date: commitDate || date,
    change: `【${label}】${scope ? `${scope}：` : ''}${text}`,
  };
};

// 每次构建自动读取「本次部署包含的提交」。push 工作流提供 before SHA，
// 本地构建 / 手动 workflow 没有时退回最近 30 条；Git 提交本身就是更新日志来源，
// 不再要求额外维护一份容易过期的手写 changelog。
const beforeSha = process.env.GITHUB_EVENT_BEFORE || process.env.GITHUB_BEFORE_SHA || '';
const validBeforeSha = /^[0-9a-f]{40}$/i.test(beforeSha) && !/^0+$/.test(beforeSha);
const range = validBeforeSha ? `${beforeSha}..HEAD` : '-n 30';
let rawLog = run(`git log --no-merges ${range} --format=%H%x1f%s%x1f%cs`, '');
// 首次推送 / before SHA 不在浅克隆中时，仍然给出可读日志，不让构建失败。
if (!rawLog && validBeforeSha) {
  rawLog = run('git log --no-merges -n 30 --format=%H%x1f%s%x1f%cs', '');
}
const commits = rawLog
  .split('\n')
  .map(parseCommit)
  .filter(Boolean)
  .slice(0, 30);
if (!commits.length && build !== 'unknown') {
  commits.push({ hash: build, type: 'chore', scope: '', subject: '自动生成版本构建', date, change: '【构建】自动生成版本构建' });
}

const changes = commits.map(item => item.change);
const title = commits.length === 1
  ? `自动构建 · ${commits[0].subject}`
  : commits.length > 1
    ? `自动汇总 · ${commits.length} 次 Git 提交`
    : '自动构建 · 本次部署';

const manifest = {
  version,
  date,
  build,
  title,
  changes: changes.length ? changes : ['本次更新日志由 Git 提交自动生成'],
  generated: 'git',
  commitCount: commits.length,
  commits: commits.slice(0, 30),
};
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/version.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`version manifest: v${version} @ ${build}; ${commits.length} git commits`);
