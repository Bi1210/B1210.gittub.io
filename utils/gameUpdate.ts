/**
 * Whole-game update utilities.
 * Cache Storage / Service Worker are frontend resources only. IndexedDB and localStorage
 * user data are never cleared; localStorage is used only for the update handshake.
 */
import { BUILD_LABEL } from './buildInfo';
import { CURRENT_VERSION } from './version';

export const UPDATE_STATUS_KEY = 'sullyos_update_status';
export const LAST_UPDATE_VERSION_KEY = 'sullyos_last_update_version';

export type UpdateStatus = 'checking' | 'downloading' | 'success' | 'failed';
export type UpdatePhase = UpdateStatus;

export interface RemoteVersionManifest {
    version: string;
    date?: string;
    build?: string;
    title?: string;
    changes?: string[];
}

export interface PullUpdateResult {
    updated: boolean;
    manifest?: RemoteVersionManifest;
}

export const setUpdateStatus = (status: UpdateStatus, version?: string): void => {
    try {
        localStorage.setItem(UPDATE_STATUS_KEY, JSON.stringify({ status, version, timestamp: Date.now() }));
    } catch {
        // ignore storage failures
    }
};

export const getUpdateStatus = (): { status: UpdateStatus; version?: string; timestamp?: number } | null => {
    try {
        const raw = localStorage.getItem(UPDATE_STATUS_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || typeof data.status !== 'string') return null;
        return data;
    } catch {
        return null;
    }
};

export const clearUpdateStatus = (): void => {
    try { localStorage.removeItem(UPDATE_STATUS_KEY); } catch { /* ignore */ }
};

const currentBuild = BUILD_LABEL.split('@').pop() || '';

const versionUrl = (): string => {
    const base = import.meta.env.BASE_URL || './';
    const url = new URL('version.json', new URL(base, window.location.href));
    url.searchParams.set('_', String(Date.now()));
    return url.toString();
};

/** 从当前部署渠道读取版本清单；请求失败只返回 null，不影响游戏运行。 */
export const getRemoteVersionManifest = async (): Promise<RemoteVersionManifest | null> => {
    if (typeof window === 'undefined') return null;
    try {
        const response = await fetch(versionUrl(), {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        });
        if (!response.ok) return null;
        const data = await response.json();
        if (!data || typeof data.version !== 'string' || !data.version.trim()) return null;
        return {
            version: data.version.trim(),
            date: typeof data.date === 'string' ? data.date : undefined,
            build: typeof data.build === 'string' ? data.build : undefined,
            title: typeof data.title === 'string' ? data.title : undefined,
            changes: Array.isArray(data.changes) ? data.changes.filter((item: unknown): item is string => typeof item === 'string').slice(0, 30) : undefined,
        };
    } catch {
        return null;
    }
};

const isNewManifest = (manifest: RemoteVersionManifest): boolean => {
    if (manifest.version !== CURRENT_VERSION) return true;
    // Cloudflare 等未接入构建脚本的静态部署会使用 dev 清单；
    // dev 只用于版本存在性兜底，不能拿来和真实 commit 比较，否则每次启动都会误报更新。
    if (!manifest.build || manifest.build === 'dev' || !currentBuild || currentBuild === 'unknown') return false;
    return manifest.build !== currentBuild;
};

/**
 * 拉取整套前端资源。没有新版本时返回 updated:false，不刷新页面；
 * 只有确定远端版本/构建号更新后才清资源并重载。
 */
export const pullLatestGameResources = async (onPhase?: (phase: UpdatePhase) => void): Promise<PullUpdateResult> => {
    if (typeof window === 'undefined') return { updated: false };
    onPhase?.('checking');
    setUpdateStatus('checking');

    const manifest = await getRemoteVersionManifest();
    if (!manifest) {
        clearUpdateStatus();
        onPhase?.('failed');
        throw new Error('无法获取版本清单，请检查网络或稍后重试');
    }
    if (!isNewManifest(manifest)) {
        clearUpdateStatus();
        return { updated: false, manifest };
    }

    const reloadUrl = new URL(window.location.href);
    reloadUrl.searchParams.set('__sully_update', String(Date.now()));

    try {
        onPhase?.('downloading');
        setUpdateStatus('downloading', manifest.version);
        const response = await fetch(reloadUrl.toString(), {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        });
        if (!response.ok) throw new Error(`更新资源检查失败（HTTP ${response.status}）`);

        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(async registration => {
                try { await registration.update(); } catch { /* continue */ }
                try { await registration.unregister(); } catch { /* continue */ }
            }));
        }

        if ('caches' in window) {
            const cacheNames = await window.caches.keys();
            await Promise.all(cacheNames.map(name => window.caches.delete(name)));
        }

        setUpdateStatus('success', manifest.version);
        onPhase?.('success');
        window.location.replace(reloadUrl.toString());
        return { updated: true, manifest };
    } catch (error) {
        setUpdateStatus('failed', manifest.version);
        onPhase?.('failed');
        throw error;
    }
};
