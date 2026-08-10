import React, { useCallback, useEffect, useState } from 'react';
import Modal from './os/Modal';
import { BUILD_LABEL } from '../utils/buildInfo';
import { CURRENT_VERSION, VERSION_LOGS, type VersionLog } from '../utils/version';
import {
    clearUpdateStatus,
    getRemoteVersionManifest,
    getUpdateStatus,
    pullLatestGameResources,
    type RemoteVersionManifest,
    type UpdatePhase,
} from '../utils/gameUpdate';

const DISMISSED_UPDATE_KEY = 'sullyos_update_dismissed';
const RUNTIME_VERSION_KEY = 'sullyos_runtime_version';
const LEGACY_SEEN_VERSION_KEY = 'sullyos_last_seen_version';
const DISMISS_HOURS = 12;

const currentBuild = BUILD_LABEL.split('@').pop() || '';

const isNewerManifest = (manifest: RemoteVersionManifest): boolean => {
    if (manifest.version !== CURRENT_VERSION) return true;
    if (!manifest.build || manifest.build === 'dev' || !currentBuild || currentBuild === 'unknown') return false;
    return manifest.build !== currentBuild;
};

const readDismissed = (): { key?: string; at?: number } => {
    try {
        return JSON.parse(localStorage.getItem(DISMISSED_UPDATE_KEY) || '{}');
    } catch {
        return {};
    }
};

const writeDismissed = (key: string) => {
    try {
        localStorage.setItem(DISMISSED_UPDATE_KEY, JSON.stringify({ key, at: Date.now() }));
    } catch {
        // ignore storage failures
    }
};

const manifestKey = (manifest: RemoteVersionManifest) => `${manifest.version}|${manifest.build || ''}`;

const toVersionLog = (manifest: RemoteVersionManifest): VersionLog => {
    const builtIn = VERSION_LOGS.find(item => item.version === manifest.version);
    return {
        version: manifest.version,
        date: manifest.date || builtIn?.date || new Date().toISOString().slice(0, 10),
        title: manifest.title || builtIn?.title || 'SullyOS 游戏更新',
        changes: manifest.changes?.length ? manifest.changes : (builtIn?.changes || ['前端资源与稳定性优化']),
    };
};

const UpdateCenter: React.FC = () => {
    const [remote, setRemote] = useState<RemoteVersionManifest | null>(null);
    const [log, setLog] = useState<VersionLog | null>(null);
    const [phase, setPhase] = useState<'idle' | 'prompt' | 'updating' | 'success' | 'failed' | 'latest'>('idle');
    const [error, setError] = useState('');

    const checkForUpdate = useCallback(async () => {
        try {
            const manifest = await getRemoteVersionManifest();
            if (!manifest || !manifest.version) return;

            const key = manifestKey(manifest);
            let runtimeVersion = '';
            try { runtimeVersion = localStorage.getItem(RUNTIME_VERSION_KEY) || ''; } catch { /* ignore */ }
            const dismissed = readDismissed();
            const recentlyDismissed = dismissed.key === key
                && typeof dismissed.at === 'number'
                && Date.now() - dismissed.at < DISMISS_HOURS * 60 * 60 * 1000;

            // 成功更新后的新页面：只展示一次“游戏已更新”，不再重新询问更新。
            if (runtimeVersion === key) return;
            if (isNewerManifest(manifest) && !recentlyDismissed) {
                setRemote(manifest);
                setLog(toVersionLog(manifest));
                setPhase('prompt');
                return;
            }

            // 远端版本已经和当前构建一致，但用户此前没有看过该版本的更新说明。
            let legacySeen = '';
            try { legacySeen = localStorage.getItem(LEGACY_SEEN_VERSION_KEY) || ''; } catch { /* ignore */ }
            if (manifest.version === CURRENT_VERSION && legacySeen !== CURRENT_VERSION && !recentlyDismissed) {
                setRemote(manifest);
                setLog(toVersionLog(manifest));
                setPhase('success');
            }
        } catch {
            // 后台检查失败不打断游戏，也不刷新页面。
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        const status = getUpdateStatus();
        if (status?.status === 'success' && status.timestamp && Date.now() - status.timestamp < 60_000) {
            clearUpdateStatus();
            getRemoteVersionManifest().then(manifest => {
                if (cancelled || !manifest) return;
                setRemote(manifest);
                setLog(toVersionLog(manifest));
                try { localStorage.setItem(RUNTIME_VERSION_KEY, manifestKey(manifest)); } catch { /* ignore */ }
                setPhase('success');
            }).catch(() => clearUpdateStatus());
        } else if (status) {
            clearUpdateStatus();
            void checkForUpdate();
        } else {
            void checkForUpdate();
        }

        const onVisible = () => {
            if (document.visibilityState === 'visible') void checkForUpdate();
        };
        document.addEventListener('visibilitychange', onVisible);
        // 用户可能长时间停留在前台不切出去，仅靠 visibilitychange 会错过新版本；
        // 定时轮询兜底，不依赖用户手动触发页面可见性变化。
        const intervalId = window.setInterval(() => {
            if (document.visibilityState === 'visible') void checkForUpdate();
        }, 5 * 60 * 1000);
        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisible);
            window.clearInterval(intervalId);
        };
    }, [checkForUpdate]);

    const closeSuccess = () => {
        if (remote) {
            const key = manifestKey(remote);
            writeDismissed(key);
            try {
                localStorage.setItem(RUNTIME_VERSION_KEY, key);
                localStorage.setItem(LEGACY_SEEN_VERSION_KEY, remote.version);
            } catch { /* ignore */ }
        }
        setPhase('idle');
    };

    const startUpdate = async () => {
        if (!remote || phase === 'updating') return;
        setPhase('updating');
        setError('');
        try {
            const result = await pullLatestGameResources((next: UpdatePhase) => {
                if (next === 'failed') setPhase('failed');
            });
            if (!result.updated) {
                setPhase('idle');
                return;
            }
            // 成功后工具会重载页面；新页面会显示 success 弹窗。
        } catch (reason: any) {
            setError(reason?.message || '网络不可用，请稍后重试');
            setPhase('failed');
        }
    };

    if (phase === 'idle') return null;

    if (phase === 'prompt' && log) {
        return (
            <Modal
                isOpen
                title="🎉 发现新版本"
                onClose={() => { if (remote) writeDismissed(manifestKey(remote)); setPhase('idle'); }}
                footer={
                    <div className="flex w-full gap-2">
                        <button type="button" onClick={() => { if (remote) writeDismissed(manifestKey(remote)); setPhase('idle'); }} className="flex-1 rounded-2xl bg-slate-100 py-3 font-bold text-slate-600 active:scale-95">稍后再说</button>
                        <button type="button" onClick={() => void startUpdate()} className="flex-1 rounded-2xl bg-emerald-600 py-3 font-bold text-white shadow-sm active:scale-95">立即更新</button>
                    </div>
                }
            >
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">v{log.version}</span>
                        <span className="text-[10px] text-slate-400">{log.date}</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-700">{log.title}</h4>
                    <ul className="space-y-2">
                        {log.changes.slice(0, 6).map((change, index) => <li key={index} className="flex gap-2 text-xs leading-relaxed text-slate-600"><span className="shrink-0 text-emerald-500">•</span><span>{change}</span></li>)}
                    </ul>
                    <p className="text-[10px] leading-relaxed text-slate-400">更新不会删除世界存档、聊天记录或 API 配置。</p>
                </div>
            </Modal>
        );
    }

    if (phase === 'updating') {
        return (
            <Modal isOpen title="正在更新游戏" onClose={() => {}}>
                <div className="flex flex-col items-center gap-4 py-8">
                    <div className="h-14 w-14 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />
                    <p className="text-sm font-bold text-slate-700">正在检查并拉取最新资源…</p>
                    <p className="text-[10px] text-slate-400">完成后页面会自动重新加载</p>
                </div>
            </Modal>
        );
    }

    if (phase === 'failed') {
        return (
            <Modal isOpen title="更新失败" onClose={() => setPhase('idle')} footer={<button type="button" onClick={() => setPhase('idle')} className="w-full rounded-2xl bg-slate-100 py-3 font-bold text-slate-600">关闭</button>}>
                <p className="py-5 text-center text-xs leading-relaxed text-slate-500">{error || '更新失败，游戏没有重载，本地数据未修改。'}</p>
            </Modal>
        );
    }

    return (
        <Modal isOpen title="🎉 游戏已更新" onClose={closeSuccess} footer={<button type="button" onClick={closeSuccess} className="w-full rounded-2xl bg-emerald-600 py-3 font-bold text-white">知道了</button>}>
            {log && <div className="space-y-3"><div className="flex items-center gap-2"><span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">v{log.version}</span><span className="text-[10px] text-slate-400">{log.date}</span></div><h4 className="text-sm font-bold text-slate-700">{log.title}</h4><ul className="space-y-2">{log.changes.map((change, index) => <li key={index} className="flex gap-2 text-xs leading-relaxed text-slate-600"><span className="shrink-0 text-emerald-500">•</span><span>{change}</span></li>)}</ul></div>}
        </Modal>
    );
};

export default UpdateCenter;
