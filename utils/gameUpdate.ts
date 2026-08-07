/**
 * SullyOS whole-game resource refresh.
 * Deliberately never touches IndexedDB or localStorage: those contain user data.
 */
export const pullLatestGameResources = async (): Promise<void> => {
    if (typeof window === 'undefined') return;

    const reloadUrl = new URL(window.location.href);
    reloadUrl.searchParams.set('__sully_update', String(Date.now()));

    // Check the document without using the browser's HTTP cache before replacing it.
    const response = await fetch(reloadUrl.toString(), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
    if (!response.ok) throw new Error(`更新资源检查失败（HTTP ${response.status}）`);

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

    window.location.replace(reloadUrl.toString());
};
