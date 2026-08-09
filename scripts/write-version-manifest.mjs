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
const version = date.replaceAll('-', '.');

const typeLabels = {
  feat: '功能', fix: '修复', perf: '性能', refactor: '重构', docs: '文档',
  test: '测试', build: '构建', ci: '工程', chore: '维护', revert: '回退',
};
const scopeLabels = {
  global: '全局界面', 'global-ui': '全局界面', shell: '系统外壳',
  liquidglass: '液态玻璃', theme: '主题', update: '更新系统', modal: '弹窗',
  app: '应用', settings: '设置', echoes: 'Echoes',
};
const phraseLabels = [
  [/stabilize updates and exit transitions/i, '稳定更新流程与应用退出动画'],
  [/isolate Echoes from global transitions/i, '隔离 Echoes 与全局转场'],
  [/make icon dragging native-like/i, '让图标拖动更接近原生体验'],
  [/lighten icons and enable individual dragging/i, '调整图标亮度并支持单独拖动'],
  [/complete neutral Liquid Glass system/i, '完成中性液态玻璃系统'],
  [/integrate coherent iOS 26 Liquid Glass chrome theme/i, '接入统一的 iOS 26 液态玻璃外壳'],
  [/include API settings component/i, '补齐 API 设置组件'],
];
const translateText = (text) => {
  const known = phraseLabels.find(([pattern]) => pattern.test(text));
  if (known) return known[1];
  return text
    .replace(/\b(global-ui|global|shell|liquidglass|theme|update|modal|settings|app)\b/gi, (value) => scopeLabels[value.toLowerCase()] || value)
    .replace(/\b(stabilize|fix|add|remove|improve|update|include|complete|integrate)\b/gi, (value) => ({ stabilize: '稳定', fix: '修复', add: '新增', remove: '移除', improve: '改进', update: '更新', include: '补齐', complete: '完成', integrate: '接入' }[value.toLowerCase()] || value));
};

const parseCommit = (line) => {
  const [hash, subject, commitDate] = line.split('\x1f');
  if (!hash || !subject) return null;
  const match = subject.match(/^(feat|fix|perf|refactor|docs|test|build|ci|chore|revert)(?:\(([^)]+)\))?!?:\s*(.+)$/i);
  const type = (match?.[1] || 'chore').toLowerCase();
  const scope = match?.[2] || '';
  const rawText = (match?.[3] || subject).trim();
  const text = translateText(rawText);
  const label = typeLabels[type] || '更新';
  return {
    hash: hash.slice(0, 7), type, scope,
    subject: text,
    rawSubject: rawText,
    date: commitDate || date,
    change: `【${label}】${scopeLabels[scope.toLowerCase()] || scope ? `${scopeLabels[scope.toLowerCase()] || scope}：` : ''}${text}`,
  };
};

const beforeSha = process.env.GITHUB_EVENT_BEFORE || process.env.GITHUB_BEFORE_SHA || '';
const validBeforeSha = /^[0-9a-f]{40}$/i.test(beforeSha) && !/^0+$/.test(beforeSha);
const range = validBeforeSha ? `${beforeSha}..HEAD` : '-n 30';
let rawLog = run(`git log --no-merges ${range} --format=%H%x1f%s%x1f%cs`, '');
if (!rawLog && validBeforeSha) rawLog = run('git log --no-merges -n 30 --format=%H%x1f%s%x1f%cs', '');
const commits = rawLog.split('\n').map(parseCommit).filter(Boolean).slice(0, 30);
if (!commits.length && build !== 'unknown') {
  commits.push({ hash: build, type: 'chore', scope: '', subject: '自动生成版本构建', rawSubject: '自动生成版本构建', date, change: '【构建】自动生成版本构建' });
}

const readHistory = () => {
  try {
    const value = JSON.parse(fs.readFileSync('scripts/version-history.json', 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
};
const history = readHistory();
const parseLines = (raw) => raw.split('\n').map(parseCommit).filter(Boolean);
// 不依赖上一次构建产物：每次从完整 Git 历史重建版本索引，同一天多次部署也不会丢日志。
const allCommits = parseLines(run('git log --no-merges -n 200 --format=%H%x1f%s%x1f%cs', ''));
const groupedHistory = [];
for (const commit of allCommits) {
  const groupedVersion = (commit.date || date).replaceAll('-', '.');
  let entry = groupedHistory.find(item => item.version === groupedVersion);
  if (!entry) {
    entry = { version: groupedVersion, date: commit.date || date, title: '本次版本更新', changes: [], build: commit.hash, commits: [] };
    groupedHistory.push(entry);
  }
  entry.changes.push(commit.change);
  entry.commits.push(commit);
}
groupedHistory.forEach(entry => {
  entry.changes = [...new Set(entry.changes)];
  entry.commits = entry.commits.filter((commit, index, all) => all.findIndex(other => other.hash === commit.hash) === index).slice(0, 40);
  entry.title = entry.commits.length === 1 ? entry.commits[0].subject : `本次版本包含 ${entry.commits.length} 项更新`;
});
const currentChanges = commits.map(item => item.change);
const currentTitle = commits.length === 1 ? commits[0].subject : (commits.length ? `本次部署包含 ${commits.length} 项更新` : '本次部署更新');
const sameDayHistory = groupedHistory.find(item => item.version === version);
const currentLog = {
  version, date, title: currentTitle,
  changes: [...new Set([...(sameDayHistory?.changes || []), ...(currentChanges.length ? currentChanges : ['前端资源与稳定性优化'])])],
  build, commits: [...(sameDayHistory?.commits || []), ...commits].filter((commit, index, all) => all.findIndex(other => other.hash === commit.hash) === index).slice(0, 40),
};
// 当前构建 + 完整 Git 日期索引 + 手写旧版本；版本历史只增不减。
const merged = [currentLog, ...groupedHistory, ...history]
  .filter((item) => item && typeof item.version === 'string')
  .reduce((list, item) => {
    const existing = list.find((entry) => entry.version === item.version);
    if (!existing) { list.push({ ...item }); return list; }
    existing.changes = [...new Set([...(existing.changes || []), ...(item.changes || [])])];
    existing.commits = [...(existing.commits || []), ...(item.commits || [])].filter((commit, index, all) => all.findIndex(other => other.hash === commit.hash) === index).slice(0, 40);
    if (item.version === version) { existing.title = currentTitle; existing.date = date; existing.build = build; }
    return list;
  }, [])
  .slice(0, 30);

const manifest = {
  version, date, build, title: currentTitle,
  changes: currentLog.changes,
  history: merged,
  generated: 'git',
  commitCount: commits.length,
  commits,
};
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/version.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`version manifest: v${version} @ ${build}; ${commits.length} commits; ${merged.length} history entries`);
