/**
 * SullyOS 版本与更新日志管理。
 *
 * 正式构建时这些值由 scripts/write-version-manifest.mjs 从 Git 自动生成，
 * 再由 vite.config.ts 注入；这里的旧值只作为未构建开发环境的安全兜底。
 */

const FALLBACK_VERSION = '1.3.0';
const FALLBACK_DATE = '2026-08-07';

export interface VersionLog {
    version: string;
    date: string;
    title: string;
    changes: string[];
    breaking?: boolean;
}

const generatedChanges = typeof __APP_VERSION_CHANGES__ !== 'undefined' && Array.isArray(__APP_VERSION_CHANGES__)
    ? __APP_VERSION_CHANGES__.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

export const CURRENT_VERSION = typeof __APP_VERSION__ === 'string' && __APP_VERSION__
    ? __APP_VERSION__
    : FALLBACK_VERSION;
export const VERSION_DATE = typeof __APP_VERSION_DATE__ === 'string' && __APP_VERSION_DATE__
    ? __APP_VERSION_DATE__
    : FALLBACK_DATE;

const generatedTitle = typeof __APP_VERSION_TITLE__ === 'string' && __APP_VERSION_TITLE__
    ? __APP_VERSION_TITLE__
    : 'SullyOS 自动构建更新';

// 有构建清单时只展示 Git 自动生成的本次提交；不会再被一段手写的 1.3.0 日志覆盖。
// 未运行构建脚本时保留少量历史兜底，保证开发服务器仍可打开设置页。
const FALLBACK_LOGS: VersionLog[] = [
    {
        version: '1.3.0',
        date: '2026-08-07',
        title: '更新中心上线 + 全局版本提示',
        changes: [
            '【更新】全局检测新版本，发现更新时自动询问是否立即更新',
            '【更新】更新过程显示检查、下载和失败状态',
            '【更新】更新成功重载后自动显示本次更新内容',
            '【稳定性】没有更新或更新失败时不重开游戏、不修改本地数据',
        ],
    },
];

export const VERSION_LOGS: VersionLog[] = generatedChanges.length > 0
    ? [{ version: CURRENT_VERSION, date: VERSION_DATE, title: generatedTitle, changes: generatedChanges }]
    : FALLBACK_LOGS;

export const getLastSeenVersion = (): string | null => {
    try {
        return localStorage.getItem('sullyos_last_seen_version');
    } catch {
        return null;
    }
};

export const setLastSeenVersion = (version: string): void => {
    try {
        localStorage.setItem('sullyos_last_seen_version', version);
    } catch {
        // ignore
    }
};

export const hasNewVersion = (): boolean => {
    const lastSeen = getLastSeenVersion();
    return !lastSeen || lastSeen !== CURRENT_VERSION;
};

export const getVersionsSince = (lastVersion: string | null): VersionLog[] => {
    if (!lastVersion) return VERSION_LOGS;
    const lastIndex = VERSION_LOGS.findIndex(v => v.version === lastVersion);
    if (lastIndex === -1) return VERSION_LOGS;
    return VERSION_LOGS.slice(0, lastIndex);
};
