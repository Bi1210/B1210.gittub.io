/**
 * SullyOS whole-game resource refresh.
 * Deliberately never touches IndexedDB or localStorage: those contain user data.
 */

export const UPDATE_STATUS_KEY = 'sullyos_update_status';
export const LAST_UPDATE_VERSION_KEY = 'sullyos_last_update_version';

export type UpdateStatus = 'checking' | 'downloading' | 'success' | 'failed';

export const setUpdateStatus = (status: UpdateStatus, version?: string): void => {
    try {
        localStorage.setItem(UPDATE_STATUS_KEY, JSON.stringify({ status, version, timestamp: Date.now() }));
    } catch {
        // ignore
    }
};

export const getUpdateStatus = (): { status: UpdateStatus; version?: string; timestamp?: number } | null => {
    try {
        const data = localStorage.getItem(UPDATE_STATUS_KEY);
        if (!data) return null;
        return JSON.parse(data);
    } catch {
        return null;
    }
};

export const clearUpdateStatus = (): void => {
    try {
        localStorage.removeItem(UPDATE_STATUS_KEY);
    } catch {
        // ignore
    }
};

export const pullLatestGameResources = async (): Promise<void> => {
    if (typeof window === 'undefined') return;

    setUpdateStatus('checking');

    const reloadUrl = new URL(window.location.href);
    reloadUrl.searchParams.set('__sully_update', String(Date.now()));

    // Check the document without using the browser's HTTP cache before replacing it.
    try {
        setUpdateStatus('downloading');
        const response = await fetch(reloadUrl.toString(), {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        });
        if (!response.ok) {
            setUpdateStatus('failed');
            throw new Error(`更新资源检查失败（HTTP ${response.status}）`);
        }
    } catch (error) {
        setUpdateStatus('failed');
        throw error;
    }

    // The app's SW is used for keep-alive/push. Re-registering after reload is safe;
    // unregistering here prevents an old controller from serving stale app resources.
    if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(async registration => {
            try { await registration.update(); } catch { /* continue with cleanup */ }
            try { await registration.unregister(); } catch { /* reload can still recover */ }
        }));
    }

    // Cache Storage is frontend resources only. User data is in IndexedDB/localStorage.
    if ('caches' in window) {
        const cacheNames = await window.caches.keys();
        await Promise.all(cacheNames.map(name => window.caches.delete(name)));
    }

    // Mark as success before reload, so the new page can detect it
    setUpdateStatus('success', await getCurrentVersionFromRemote());
    
    window.location.replace(reloadUrl.toString());
};

/** Fetch current version from remote (best effort) */
const getCurrentVersionFromRemote = async (): Promise<string | undefined> => {
    try {
        const response = await fetch('/version.json?' + Date.now(), { cache: 'no-store' });
        if (response.ok) {
            const data = await response.json();
            return data.version;
        }
    } catch {
        // ignore
    }
    return undefined;
};
