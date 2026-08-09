/**
 * SullyOS 版本与更新日志管理。构建清单和旧版本日志共用一份数据源。
 */

const FALLBACK_VERSION = '1.3.0';
const FALLBACK_DATE = '2026-08-07';

export interface VersionLog {
    version: string;
    date: string;
    title: string;
    changes: string[];
    build?: string;
    breaking?: boolean;
}

const isVersionLog = (value: unknown): value is VersionLog => {
    if (!value || typeof value !== 'object') return false;
    const item = value as Partial<VersionLog>;
    return typeof item.version === 'string'
        && typeof item.date === 'string'
        && typeof item.title === 'string'
        && Array.isArray(item.changes)
        && item.changes.every(change => typeof change === 'string');
};

const generatedChanges = typeof __APP_VERSION_CHANGES__ !== 'undefined' && Array.isArray(__APP_VERSION_CHANGES__)
    ? __APP_VERSION_CHANGES__.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
const generatedHistory = typeof __APP_VERSION_HISTORY__ !== 'undefined' && Array.isArray(__APP_VERSION_HISTORY__)
    ? __APP_VERSION_HISTORY__.filter(isVersionLog)
    : [];

export const CURRENT_VERSION = typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? __APP_VERSION__ : FALLBACK_VERSION;
export const VERSION_DATE = typeof __APP_VERSION_DATE__ === 'string' && __APP_VERSION_DATE__ ? __APP_VERSION_DATE__ : FALLBACK_DATE;
const generatedTitle = typeof __APP_VERSION_TITLE__ === 'string' && __APP_VERSION_TITLE__ ? __APP_VERSION_TITLE__ : 'SullyOS 自动构建更新';

const FALLBACK_LOGS: VersionLog[] = [
    { version: '1.3.0', date: '2026-08-07', title: '更新中心上线 + 全局版本提示', changes: ['【更新】全局检测新版本，发现更新时自动询问是否立即更新', '【更新】更新过程显示检查、下载和失败状态', '【更新】更新成功重载后自动显示本次更新内容', '【稳定性】没有更新或更新失败时不重开游戏、不修改本地数据'] },
    { version: '1.2.0', date: '2026-08-07', title: '稳定性大幅增强 + Echoes 界面美化', changes: ['【稳定性】Echoes 主题崩溃修复：3 层降级防护，旧存档不再白屏', '【稳定性】键盘闪退修复：输入时键盘不再频繁收回', '【稳定性】全局资源更新：设置页和崩溃页都能一键拉取最新前端', '【Echoes】选项默认展开：精美渐变卡片 + 点击收起', '【Echoes】滚动位置记忆：切 Tab 回来自动恢复阅读位置', '【Echoes】输入区精简：高度压缩 30%，更精巧不占屏幕'] },
    { version: '1.1.0', date: '2026-08-06', title: 'Echoes 沉浸式游戏系统', changes: ['新增 Echoes：独立的 AI 沉浸式游戏系统', '支持自定义世界、身份、角色、规则、文风和 UI', '小说化叙事 + 连续性保障 + 玩家能动性', '多档位选择：阅读档 / 互动档 / 沉浸档 / 沙盒档'] },
];

const currentLog: VersionLog = {
    version: CURRENT_VERSION,
    date: VERSION_DATE,
    title: generatedTitle,
    changes: generatedChanges.length ? generatedChanges : FALLBACK_LOGS[0].changes,
};

// 构建脚本已将历史清单注入；去重时优先保留当前版本，并保留基线旧日志。
const history = [...generatedHistory, ...FALLBACK_LOGS, currentLog].reduce<VersionLog[]>((result, item) => {
    const existing = result.find(log => log.version === item.version);
    if (!existing) { result.push(item); return result; }
    if (item.version === CURRENT_VERSION) {
        existing.title = currentLog.title;
        existing.date = currentLog.date;
        existing.changes = currentLog.changes;
    }
    return result;
}, []);

export const VERSION_LOGS: VersionLog[] = history;

export const getLastSeenVersion = (): string | null => {
    try { return localStorage.getItem('sullyos_last_seen_version'); } catch { return null; }
};
export const setLastSeenVersion = (version: string): void => {
    try { localStorage.setItem('sullyos_last_seen_version', version); } catch { /* ignore */ }
};
export const hasNewVersion = (): boolean => !getLastSeenVersion() || getLastSeenVersion() !== CURRENT_VERSION;
export const getVersionsSince = (lastVersion: string | null): VersionLog[] => {
    if (!lastVersion) return VERSION_LOGS;
    const lastIndex = VERSION_LOGS.findIndex(v => v.version === lastVersion);
    return lastIndex === -1 ? VERSION_LOGS : VERSION_LOGS.slice(0, lastIndex);
};
