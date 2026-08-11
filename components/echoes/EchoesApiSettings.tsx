import React, { useEffect, useState } from 'react';
import { ApiPreset, APIConfig, EchoesApiConfig, EchoesApiCallLogEntry } from '../../types';
import { DB } from '../../utils/db';
import { safeResponseJson } from '../../utils/safeApi';

/**
 * Echoes 独立 API 设置。
 *
 * 仿照彼方（VRWorldApp）的 VRApiSettings 做法：Echoes 每轮会话可以单独指定一份 API
 * （和「设置」里保存的预设共用同一批），不设则跟随聊天默认 apiConfig。
 * 数据存在 utils/db.ts 的 echoes_settings 单例 store 里（id='api' / id='apilog'）。
 */
const EchoesApiSettings: React.FC<{ apiPresets: ApiPreset[]; chatApi: APIConfig; addToast?: (m: string, t?: any) => void }> = ({ apiPresets, chatApi, addToast }) => {
    const [echoesApi, setEchoesApi] = useState<EchoesApiConfig | null>(null);
    const [log, setLog] = useState<EchoesApiCallLogEntry[]>([]);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);
    const [presetsOpen, setPresetsOpen] = useState(false);
    const [customBaseUrl, setCustomBaseUrl] = useState('');
    const [customApiKey, setCustomApiKey] = useState('');
    const [customModel, setCustomModel] = useState('');
    const [customMaxTokens, setCustomMaxTokens] = useState<number | ''>(8000);
    const [savingCustom, setSavingCustom] = useState(false);

    useEffect(() => {
        void DB.getEchoesApiConfig().then(config => {
            setEchoesApi(config);
            setCustomBaseUrl(config?.baseUrl || '');
            setCustomApiKey(config?.apiKey || '');
            setCustomModel(config?.model || '');
            setCustomMaxTokens(config?.maxTokens || 8000);
        });
        void DB.getEchoesApiLog().then(setLog);
    }, []);

    const follow = !echoesApi?.baseUrl;
    const effective = follow ? chatApi : echoesApi!;
    const sameAs = (c: APIConfig) => !follow && echoesApi!.baseUrl === c.baseUrl && echoesApi!.model === c.model && echoesApi!.apiKey === c.apiKey && echoesApi!.maxTokens === c.maxTokens;
    const host = (u?: string) => { try { return u ? new URL(u).host : '—'; } catch { return u || '—'; } };

    const choose = (cfg: EchoesApiConfig | null) => {
        void DB.saveEchoesApiConfig(cfg);
        setEchoesApi(cfg);
        setCustomBaseUrl(cfg?.baseUrl || '');
        setCustomApiKey(cfg?.apiKey || '');
        setCustomModel(cfg?.model || '');
        setCustomMaxTokens(cfg?.maxTokens || 8000);
        setTestResult(null);
        addToast?.(cfg ? '已切换 Echoes API' : 'Echoes 改为跟随聊天默认', 'success');
    };

    const saveCustom = async () => {
        const baseUrl = customBaseUrl.trim();
        const apiKey = customApiKey.trim();
        const model = customModel.trim();
        if (!baseUrl || !model) {
            addToast?.('请填写中转地址和模型名', 'error');
            return;
        }
        setSavingCustom(true);
        try {
            const cfg: EchoesApiConfig = {
                baseUrl,
                apiKey,
                model,
                stream: false,
                temperature: 0.86,
                maxTokens: Number(customMaxTokens) || 8000,
            };
            await DB.saveEchoesApiConfig(cfg);
            setEchoesApi(cfg);
            setTestResult(null);
            addToast?.('Echoes 独立 API 已保存', 'success');
        } catch (error: any) {
            addToast?.(`Echoes API 保存失败：${error?.message || '未知错误'}`, 'error');
        } finally {
            setSavingCustom(false);
        }
    };

    const test = async () => {
        const cfg = effective;
        if (!cfg?.baseUrl) { setTestResult('当前没有可用的 API'); return; }
        setTesting(true); setTestResult(null);
        const startedAt = Date.now();
        try {
            const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey || 'sk-none'}` },
                body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5, stream: false }),
            });
            const ms = Date.now() - startedAt;
            if (res.ok) {
                const d = await safeResponseJson(res);
                const r = d.choices?.[0]?.message?.content || '';
                setTestResult(`连接成功 — 模型回复:"${r.slice(0, 24)}"`);
                await DB.appendEchoesApiLog({ ts: Date.now(), ok: true, ms });
                setLog(await DB.getEchoesApiLog());
            } else {
                const t = await res.text().catch(() => '');
                setTestResult(`HTTP ${res.status}: ${t.slice(0, 80)}`);
                await DB.appendEchoesApiLog({ ts: Date.now(), ok: false, ms, errorMessage: `HTTP ${res.status}` });
                setLog(await DB.getEchoesApiLog());
            }
        } catch (e: any) {
            const ms = Date.now() - startedAt;
            setTestResult(`连接失败: ${e.message}`);
            await DB.appendEchoesApiLog({ ts: Date.now(), ok: false, ms, errorMessage: e.message });
            setLog(await DB.getEchoesApiLog());
        } finally {
            setTesting(false);
        }
    };

    const okCount = log.filter(l => l.ok).length;

    return (
        <div className="space-y-3">
            <p className="text-[11px] leading-relaxed opacity-60">
                Echoes 每轮会把世界观、历史回合和写作协议一起发给模型，比普通聊天更费 API。你可以在这里给 Echoes<b> 单独指定一份 API</b>（和「设置」里保存的预设共用同一批），不设则跟随聊天默认。
            </p>

            {/* 当前生效 */}
            <div className="rounded-2xl p-3.5 border" style={{ background: 'rgba(255,255,255,0.045)', borderColor: 'rgba(255,255,255,0.1)' }}>
                <div className="text-[10px] tracking-[0.15em] opacity-50 mb-1.5">当前生效</div>
                <div className="text-[12.5px] font-semibold">{effective?.model || '未配置'}</div>
                <div className="text-[10px] opacity-40 mt-0.5">{host(effective?.baseUrl)} · {follow ? '跟随聊天默认' : 'Echoes 独立'}</div>
                <button onClick={test} disabled={testing} className="mt-2.5 text-[11px] px-3 py-1.5 rounded-full font-semibold disabled:opacity-50"
                    style={{ background: 'rgba(139,92,246,.16)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,.3)' }}>
                    {testing ? '测试中…' : '测试连接'}
                </button>
                {testResult && <div className={`mt-2 text-[10.5px] px-2.5 py-1.5 rounded-lg leading-snug ${testResult.startsWith('连接成功') ? 'text-emerald-500' : 'text-rose-500'}`} style={{ background: 'rgba(0,0,0,.06)' }}>{testResult}</div>}
            </div>

            {/* 选择 API */}
            <div>
                <div className="text-[10px] tracking-[0.15em] opacity-50 mb-1.5 px-0.5">选择 Echoes API</div>
                <button onClick={() => choose(null)}
                    className="w-full flex items-center gap-2 rounded-xl p-3 mb-1.5 text-left active:scale-[0.99] transition-transform border"
                    style={{ background: follow ? 'rgba(139,92,246,.12)' : 'rgba(0,0,0,.03)', borderColor: follow ? 'rgba(139,92,246,.4)' : 'rgba(255,255,255,.08)' }}>
                    <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold">跟随聊天默认</div>
                        <div className="text-[10px] opacity-45 truncate">{chatApi?.model || '未配置'} · {host(chatApi?.baseUrl)}</div>
                    </div>
                    {follow && <span className="text-[10px] text-violet-400 font-bold shrink-0">✓ 使用中</span>}
                </button>
                {apiPresets.length === 0 ? (
                    <p className="text-[10.5px] opacity-40 px-1 py-1.5">「设置」里还没有保存的 API 预设。去设置里保存几个模型，这里就能选。</p>
                ) : (() => {
                    const activePreset = apiPresets.find(p => sameAs(p.config));
                    const shown = presetsOpen ? apiPresets : (activePreset ? [activePreset] : []);
                    return (
                        <>
                            <button onClick={() => setPresetsOpen(o => !o)}
                                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 mb-1.5 text-left border"
                                style={{ borderColor: 'rgba(255,255,255,.08)' }}>
                                <span className="text-[10.5px] opacity-60">保存的预设</span>
                                <span className="text-[9.5px] opacity-40 rounded-full px-1.5 leading-tight" style={{ background: 'rgba(0,0,0,.06)' }}>{apiPresets.length}</span>
                                {!presetsOpen && activePreset && <span className="text-[9.5px] text-violet-400/80 truncate">当前 · {activePreset.name}</span>}
                                <span className="ml-auto text-[10px] opacity-40">{presetsOpen ? '收起' : '展开'}</span>
                            </button>
                            {shown.map(p => {
                                const on = sameAs(p.config);
                                return (
                                    <button key={p.id} onClick={() => choose(p.config)}
                                        className="w-full flex items-center gap-2 rounded-xl p-3 mb-1.5 text-left active:scale-[0.99] transition-transform border"
                                        style={{ background: on ? 'rgba(139,92,246,.12)' : 'rgba(0,0,0,.03)', borderColor: on ? 'rgba(139,92,246,.4)' : 'rgba(255,255,255,.08)' }}>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[12px] font-semibold truncate">{p.name}</div>
                                            <div className="text-[10px] opacity-45 truncate">{p.config.model} · {host(p.config.baseUrl)}</div>
                                        </div>
                                        {on && <span className="text-[10px] text-violet-400 font-bold shrink-0">✓ 使用中</span>}
                                    </button>
                                );
                            })}
                        </>
                    );
                })()}
            </div>

            {/* 手动配置 */}
            <div className="rounded-2xl p-3.5 border" style={{ background: 'rgba(139,92,246,.06)', borderColor: 'rgba(139,92,246,.22)' }}>
                <div className="text-[10px] tracking-[0.15em] opacity-60 mb-2">手动配置独立 API</div>
                <div className="space-y-2">
                    <label className="block">
                        <span className="mb-1 block text-[10px] opacity-55">中转地址</span>
                        <input value={customBaseUrl} onChange={e => setCustomBaseUrl(e.target.value)} placeholder="https://your-relay.example/v1" className="w-full rounded-lg border bg-transparent px-2.5 py-2 text-[11px] outline-none" style={{ borderColor: 'rgba(255,255,255,.12)' }} />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-[10px] opacity-55">API Key</span>
                        <input type="password" value={customApiKey} onChange={e => setCustomApiKey(e.target.value)} placeholder="留空则不发送 Authorization" className="w-full rounded-lg border bg-transparent px-2.5 py-2 text-[11px] outline-none" style={{ borderColor: 'rgba(255,255,255,.12)' }} autoComplete="off" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-[10px] opacity-55">模型名</span>
                        <input value={customModel} onChange={e => setCustomModel(e.target.value)} placeholder="例如 claude-sonnet-4-5" className="w-full rounded-lg border bg-transparent px-2.5 py-2 text-[11px] outline-none" style={{ borderColor: 'rgba(255,255,255,.12)' }} />
                    </label>
                    <label className="block">
                        <span className="mb-0.5 block text-[10px] opacity-55">单回合 Token 上限</span>
                        <input type="number" value={customMaxTokens} onChange={e => setCustomMaxTokens(e.target.value === '' ? '' : Number(e.target.value))} placeholder="单次生成最大 tokens 长度限制（建议 6000-12000，保障长文生成）" className="w-full rounded-lg border bg-transparent px-2.5 py-2 text-[11px] outline-none" style={{ borderColor: 'rgba(255,255,255,.12)' }} />
                        <span className="mt-1 block text-[9px] opacity-35 leading-normal">
                            建议设置较大值（如 10000+）以支持小说正文的高字数生成，防止故事未写完被中途截断。
                        </span>
                    </label>
                    <button onClick={() => void saveCustom()} disabled={savingCustom} className="w-full rounded-lg px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50" style={{ background: '#7c3aed' }}>
                        {savingCustom ? '保存中…' : '保存并使用独立 API'}
                    </button>
                </div>
            </div>

            {/* 调用记录 */}
            <div className="rounded-2xl p-3 border" style={{ background: 'rgba(0,0,0,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[10px] tracking-[0.15em] opacity-50">调用记录</span>
                    <span className="text-[9.5px] opacity-40 rounded-full px-1.5 leading-tight" style={{ background: 'rgba(0,0,0,.06)' }}>{log.length}{log.length ? ` · 成功${okCount}` : ''}</span>
                    {log.length > 0 && <button onClick={() => { void DB.clearEchoesApiLog(); setLog([]); }} className="ml-auto text-[10px] opacity-45 hover:text-rose-400">清空</button>}
                </div>
                {log.length === 0 ? (
                    <p className="text-[10.5px] opacity-40 py-2 text-center">还没有调用记录。每轮 Echoes 触发的模型调用都会记在这里，方便你对账。</p>
                ) : (
                    <div className="space-y-1">
                        {log.slice(0, 60).map((l, i) => (
                            <div key={i} className="flex items-center gap-2 text-[10.5px] py-1 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,.06)' }}>
                                <span className={`shrink-0 ${l.ok ? 'text-emerald-500' : 'text-rose-500'}`}>{l.ok ? '●' : '○'}</span>
                                <span className="opacity-75 truncate">{l.worldTitle || '—'}</span>
                                <span className="ml-auto opacity-35 shrink-0 tabular-nums">{(l.ms / 1000).toFixed(1)}s</span>
                                <span className="opacity-35 shrink-0 tabular-nums w-[68px] text-right">{new Date(l.ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default EchoesApiSettings;
