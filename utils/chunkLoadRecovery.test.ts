import { describe, it, expect, vi, afterEach } from 'vitest';
import { isChunkLoadError, tryAutoReloadForChunkError } from './chunkLoadRecovery';

// 锁住 "Importing a module script failed." 自愈链路:
// iOS Safari standalone PWA 下动态 import 失败会被缓存进模块表, 本页内重试必失败,
// 只有整页 reload 能恢复 — AppErrorBoundary 靠这两个函数识别 + 自动刷新 (带防循环冷却)。

describe('isChunkLoadError', () => {
    it('识别各浏览器的 chunk 加载失败指纹', () => {
        // iOS / macOS Safari (用户报错原文)
        expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
        // Chrome
        expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x.dev/assets/Chat-Ck2f.js'))).toBe(true);
        // Firefox
        expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
        // Vite CSS 依赖预载失败
        expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/Chat-D3xq.css'))).toBe(true);
        // 字符串形态也接受
        expect(isChunkLoadError('Importing a module script failed.')).toBe(true);
    });

    it('普通运行时错误不误判', () => {
        expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
        expect(isChunkLoadError(new Error('Network request failed'))).toBe(false);
        expect(isChunkLoadError(null)).toBe(false);
        expect(isChunkLoadError(undefined)).toBe(false);
        expect(isChunkLoadError(42)).toBe(false);
    });
});

describe('tryAutoReloadForChunkError', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    // 实际恢复链路是 fire-and-forget 的异步 IIFE（先清缓存再 location.replace，失败才落回
    // location.reload），tryAutoReloadForChunkError 本身同步返回 true/false 不等它跑完。
    // 测出结果前得让内部的 await 链有机会推进完 —— 多 flush 几轮 microtask/宏任务。
    const flushAsync = async () => {
        for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    };

    const stubEnv = () => {
        const store = new Map<string, string>();
        const reload = vi.fn();
        const replace = vi.fn();
        vi.stubGlobal('sessionStorage', {
            getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
            setItem: (k: string, v: string) => { store.set(k, String(v)); },
        });
        // href 是真实浏览器里必然存在的字段 —— tryAutoReloadForChunkError 内部
        // `new URL(window.location.href)` 拼加缓存清除标记，缺了 href 会直接抛出
        // "Invalid URL"（Node 环境不像浏览器那样兜底），链路走不到 replace/reload。
        vi.stubGlobal('window', { location: { href: 'https://sully.example/app', reload, replace } });
        return { reload, replace };
    };

    it('首次触发: 记录时间戳，清缓存后用 location.replace 带上恢复标记刷新', async () => {
        const { reload, replace } = stubEnv();
        expect(tryAutoReloadForChunkError()).toBe(true);
        await flushAsync();
        expect(replace).toHaveBeenCalledTimes(1);
        expect(String(replace.mock.calls[0][0])).toContain('__sully_chunk_recovery');
        expect(reload).not.toHaveBeenCalled();
    });

    it('冷却期内再触发: 不再自动刷新 (防循环), 留给手动按钮', async () => {
        const { reload, replace } = stubEnv();
        expect(tryAutoReloadForChunkError()).toBe(true);
        await flushAsync();
        expect(tryAutoReloadForChunkError()).toBe(false);
        await flushAsync();
        expect(replace).toHaveBeenCalledTimes(1);
        expect(reload).not.toHaveBeenCalled();
    });

    it('location.replace 失败时落回 location.reload', async () => {
        const { reload, replace } = stubEnv();
        replace.mockImplementation(() => { throw new Error('replace unsupported'); });
        expect(tryAutoReloadForChunkError()).toBe(true);
        await flushAsync();
        expect(replace).toHaveBeenCalledTimes(1);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('sessionStorage 不可用时不自动刷新 (没法防循环)', () => {
        const reload = vi.fn();
        const replace = vi.fn();
        vi.stubGlobal('window', { location: { href: 'https://sully.example/app', reload, replace } });
        // 不 stub sessionStorage → 访问抛 ReferenceError → 内部 catch → 不自刷
        expect(tryAutoReloadForChunkError()).toBe(false);
        expect(reload).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
    });
});
