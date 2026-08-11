import React, { useMemo, useState } from 'react';
import { CaretDown, Check, CircleNotch, LockKey, Sparkle, WarningCircle } from '@phosphor-icons/react';
import type { EchoesMechanicActionRequest } from '../../utils/echoesMechanicActionsTypes';
import { getMechanicDefinition } from '../../utils/echoesMechanics';
import type {
    EchoesCastCharacterData,
    EchoesCountdownData,
    EchoesDanmakuItem,
    EchoesEvidenceEntry,
    EchoesGenericPanelData,
    EchoesInventoryItem,
    EchoesLeaderboardEntry,
    EchoesLiveRoomData,
    EchoesLoreEntryData,
    EchoesMechanicAction,
    EchoesMechanicInstance,
    EchoesRelationshipEntry,
    EchoesResourceEntry,
    EchoesRuleEntry,
    EchoesScenarioOption,
    EchoesScheduleEntry,
    EchoesScriptPreviewData,
    EchoesTaskEntry,
    EchoesTrendingEntry,
} from '../../utils/echoesMechanicsTypes';

type EchoesMechanicPalette = {
    panel: string;
    text: string;
    muted: string;
    border: string;
};

type EchoesMechanicRendererProps = {
    mechanic: EchoesMechanicInstance;
    accent: string;
    palette: EchoesMechanicPalette;
    busy?: boolean;
    visualVariant?: string;
    onAction: (request: EchoesMechanicActionRequest) => void;
};

const statusLabel: Record<string, string> = {
    available: '可回应',
    active: '进行中',
    completed: '已完成',
    failed: '已失败',
    locked: '未解锁',
    selected: '已选择',
};

const statusColor = (status: string, accent: string): string => {
    if (status === 'completed' || status === 'selected') return '#15803d';
    if (status === 'failed') return '#b91c1c';
    if (status === 'locked') return '#78716c';
    return accent;
};

const ActionButton: React.FC<{
    action: EchoesMechanicAction;
    mechanicId: string;
    accent: string;
    border: string;
    busy: boolean;
    onAction: (request: EchoesMechanicActionRequest) => void;
}> = ({ action, mechanicId, accent, border, busy, onAction }) => {
    const disabled = busy || action.disabled;
    return <button
        type="button"
        disabled={disabled}
        onClick={() => onAction({ mechanicId, actionId: action.id })}
        className="flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-[11px] transition disabled:cursor-not-allowed disabled:opacity-45 hover:bg-black/[.04]"
        style={{ borderColor: disabled ? border : `${accent}55`, background: disabled ? 'transparent' : `${accent}08` }}
    >
        <span className="min-w-0 leading-relaxed">{action.label}{action.disabled && action.disabledReason && <span className="mt-0.5 block text-[9px] opacity-60">{action.disabledReason}</span>}</span>
        {action.disabled ? <LockKey size={13} className="shrink-0 opacity-55" /> : <Sparkle size={13} className="shrink-0" style={{ color: accent }} />}
    </button>;
};

const ActionList: React.FC<{
    actions: EchoesMechanicAction[];
    mechanicId: string;
    accent: string;
    border: string;
    busy: boolean;
    onAction: (request: EchoesMechanicActionRequest) => void;
}> = ({ actions, mechanicId, accent, border, busy, onAction }) => {
    const visible = actions.slice(0, 6);
    if (!visible.length) return null;
    return <div className="mt-3 space-y-1.5">
        {visible.map(action => <ActionButton key={action.id} action={action} mechanicId={mechanicId} accent={accent} border={border} busy={busy} onAction={onAction} />)}
    </div>;
};

const TaskRow: React.FC<{ task: EchoesTaskEntry; accent: string; muted: string }> = ({ task, accent, muted }) => {
    const color = statusColor(task.status, accent);
    return <div className="py-2.5">
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <p className="text-[13px] font-bold tracking-tight">{task.title}</p>
                {task.description && <p className="mt-1 text-[11px] leading-relaxed opacity-60" style={{ color: muted }}>{task.description}</p>}
            </div>
            <span className="shrink-0 rounded-lg px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ color, background: `${color}12` }}>{statusLabel[task.status] || task.status}</span>
        </div>
        <div className="mt-2.5 flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.round(task.progress * 100)}%`, background: color }} />
            </div>
            <span className="shrink-0 text-[10px] font-mono opacity-40 tabular-nums">{Math.round(task.progress * 100)}%</span>
        </div>
    </div>;
};

const RuleRow: React.FC<{ rule: EchoesRuleEntry; accent: string; muted: string }> = ({ rule, accent, muted }) => {
    const color = rule.category === 'must_not' ? '#ef4444' : rule.category === 'must' ? accent : muted;
    return <div className="flex items-start gap-3 py-2">
        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
        <p className="text-[12.5px] leading-relaxed opacity-85" style={{ color: muted }}>{rule.text}</p>
    </div>;
};

const ScenarioRow: React.FC<{ option: EchoesScenarioOption; accent: string; muted: string }> = ({ option, accent, muted }) => {
    const locked = option.status === 'locked';
    const color = statusColor(option.status, accent);
    return <div className="flex items-start gap-3 py-2 opacity-85" style={{ opacity: locked ? .45 : 1 }}>
        <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-black/5" style={{ color, background: `${color}12` }}>
            {locked ? <LockKey size={10} /> : option.selected ? <Check size={10} weight="bold" /> : <span className="h-1 w-1 rounded-full" style={{ background: color }} />}
        </div>
        <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold leading-normal">{option.title}</p>
            {option.description && <p className="mt-0.5 text-[11px] leading-relaxed opacity-60" style={{ color: muted }}>{option.description}</p>}
            {locked && option.lockedReason && <p className="mt-0.5 text-[9.5px] italic opacity-40">{option.lockedReason}</p>}
        </div>
        {option.danger && !locked && <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-500">{option.danger}</span>}
    </div>;
};

const toneColor = (tone: EchoesDanmakuItem['tone']): string => {
    if (tone === 'critical' || tone === 'hostile') return '#b91c1c';
    if (tone === 'supportive' || tone === 'shipping') return '#15803d';
    if (tone === 'rumor') return '#b45309';
    return 'currentColor';
};

const DanmakuStream: React.FC<{ items: EchoesDanmakuItem[]; accent: string; muted: string }> = ({ items, accent, muted }) => {
    const visible = items.filter(item => item.visible).slice(0, 10);
    if (!visible.length) return <p className="text-[11px] leading-relaxed" style={{ color: muted }}>暂无弹幕。</p>;
    return <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
        {visible.map(item => <div key={item.id} className="flex items-baseline gap-2 rounded-lg px-2 py-1 text-[10.5px]" style={{ background: `${accent}05` }}>
            {item.author && <span className="shrink-0 opacity-55">{item.author}</span>}
            <span className="min-w-0 leading-relaxed" style={{ color: toneColor(item.tone) }}>{item.text}</span>
        </div>)}
    </div>;
};

const rankChangeLabel = (change: EchoesTrendingEntry['rankChange'] | EchoesLeaderboardEntry['trend']): string => {
    if (change === 'new') return 'NEW';
    if (change === 'same' || change === 0) return '—';
    return change > 0 ? `↑${change}` : `↓${Math.abs(change)}`;
};

const TrendingBoard: React.FC<{ entries: EchoesTrendingEntry[]; accent: string; muted: string }> = ({ entries, accent, muted }) => <div className="space-y-1.5">
    {entries.slice(0, 10).map(entry => <div key={entry.id} className="flex items-center gap-2.5 rounded-xl border px-3 py-2" style={{ borderColor: entry.relatedToPlayer ? `${accent}45` : `${accent}18`, background: entry.relatedToPlayer ? `${accent}0a` : `${accent}03` }}>
        <span className="w-5 shrink-0 text-center text-[11px] font-bold" style={{ color: entry.rank <= 3 ? accent : muted }}>{entry.rank}</span>
        <div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold">{entry.topic}</p>{entry.summary && <p className="mt-0.5 truncate text-[10px]" style={{ color: muted }}>{entry.summary}</p>}</div>
        <span className="shrink-0 text-[9px] tabular-nums" style={{ color: muted }}>{rankChangeLabel(entry.rankChange)}</span>
    </div>)}
</div>;

const LiveRoom: React.FC<{ data: EchoesLiveRoomData; accent: string; muted: string }> = ({ data, accent, muted }) => <div className="py-2.5">
    <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full animate-pulse" style={{ background: data.online ? '#15803d' : muted }} />
        <span className="text-[12px] font-semibold">{data.roomTitle}</span>
        <span className="ml-auto shrink-0 text-[10px] tabular-nums" style={{ color: muted }}>{data.viewerCount.toLocaleString()} 观看</span>
    </div>
    {data.hostName && <p className="mt-1.5 text-[10.5px]" style={{ color: muted }}>主播：{data.hostName}</p>}
    {!!data.gifts?.length && <div className="mt-2 flex flex-wrap gap-1.5">{data.gifts.slice(0, 8).map(gift => <span key={gift.id} className="rounded-full px-2 py-0.5 text-[9.5px]" style={{ background: `${accent}12`, color: accent }}>{gift.name} ×{gift.count}</span>)}</div>}
</div>;

const CountdownPanel: React.FC<{ data: EchoesCountdownData; accent: string; muted: string }> = ({ data, accent, muted }) => {
    const ratio = typeof data.current === 'number' && typeof data.total === 'number' && data.total > 0 ? Math.max(0, Math.min(1, data.current / data.total)) : undefined;
    const color = data.urgent ? '#b91c1c' : accent;
    return <div className="py-2.5">
        <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-semibold">{data.label}</span>
            <span className="text-[13px] font-bold tabular-nums" style={{ color }}>{typeof data.current === 'number' ? `${data.current}${data.unit}` : '—'}</span>
        </div>
        {ratio !== undefined && <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/5" style={{ background: 'rgba(255,255,255,0.03)' }}><div className="h-full rounded-full transition-all" style={{ width: `${ratio * 100}%`, background: color }} /></div>}
    </div>;
};

const InventoryGrid: React.FC<{ items: EchoesInventoryItem[]; accent: string; muted: string }> = ({ items, accent, muted }) => {
    if (!items.length) return <p className="py-8 text-center text-[11px] opacity-35" style={{ color: muted }}>暂无物品。</p>;
    return <div className="grid grid-cols-2 gap-2.5">
        {items.slice(0, 12).map(item => <div key={item.id} className="rounded-xl border px-3 py-2.5 transition-colors" style={{ borderColor: item.equipped ? `${accent}40` : 'rgba(255,255,255,0.06)', background: item.equipped ? `${accent}08` : 'rgba(0,0,0,0.03)' }}>
            <div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-[12.5px] font-bold">{item.name}</span><span className="shrink-0 font-mono text-[10px] opacity-40 tabular-nums">×{item.quantity}</span></div>
            {item.equipped && <div className="mt-1.5 flex items-center gap-1"><span className="h-1 w-1 rounded-full animate-pulse" style={{ background: accent }} /><span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: accent }}>Equipped</span></div>}
        </div>)}
    </div>;
};

const LeaderboardPanel: React.FC<{ entries: EchoesLeaderboardEntry[]; accent: string; muted: string }> = ({ entries, accent, muted }) => <div className="space-y-1">
    {entries.slice(0, 10).map(entry => <div key={entry.id} className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors" style={{ background: entry.isPlayer ? `${accent}08` : 'transparent' }}>
        <span className="w-5 shrink-0 text-center text-[12px] font-black opacity-30 italic" style={{ color: entry.rank <= 3 ? accent : undefined, opacity: entry.rank <= 3 ? 0.8 : 0.3 }}>{entry.rank}</span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{entry.name}{entry.isPlayer && <span className="ml-1.5 text-[9px] font-bold uppercase opacity-40">Me</span>}</span>
        <span className="shrink-0 font-mono text-[12px] font-bold" style={{ color: accent }}>{entry.score}</span>
        <span className="w-8 shrink-0 text-right text-[9px] font-bold tabular-nums opacity-40" style={{ color: typeof entry.trend === 'number' && entry.trend > 0 ? '#22c55e' : typeof entry.trend === 'number' && entry.trend < 0 ? '#ef4444' : undefined }}>{rankChangeLabel(entry.trend)}</span>
    </div>)}
</div>;

const RelationshipMatrix: React.FC<{ entries: EchoesRelationshipEntry[]; accent: string; muted: string }> = ({ entries, accent, muted }) => <div className="space-y-3">
    {entries.slice(0, 10).map(entry => <div key={entry.id} className="rounded-xl bg-black/5 px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-[13px] font-bold tracking-tight">{entry.name}</span><span className="text-[10px] font-bold uppercase tracking-widest opacity-40" style={{ color: accent }}>{entry.status}</span></div>
        <div className="mt-2.5 flex items-center gap-4 text-[10px] font-bold">
            <span className="flex flex-1 items-center gap-2">信任<div className="h-0.5 flex-1 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, entry.trust))}%`, background: accent }} /></div></span>
            <span className="flex flex-1 items-center gap-2">好感<div className="h-0.5 flex-1 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, entry.affection))}%`, background: '#ef4444' }} /></div></span>
        </div>
        {!!entry.tags.length && <div className="mt-2.5 flex flex-wrap gap-1.5">{entry.tags.slice(0, 4).map((tag, i) => <span key={`${tag}-${i}`} className="rounded bg-black/5 px-1.5 py-0.5 text-[9px] opacity-60" style={{ color: accent }}>{tag}</span>)}</div>}
    </div>)}
</div>;

const scheduleStatusColor = (status: EchoesScheduleEntry['status'], accent: string, muted: string): string => {
    if (status === 'done') return '#15803d';
    if (status === 'cancelled') return muted;
    if (status === 'active') return accent;
    return 'currentColor';
};

const ScheduleBoard: React.FC<{ entries: EchoesScheduleEntry[]; accent: string; muted: string }> = ({ entries, accent, muted }) => <div className="space-y-1.5">
    {entries.slice(0, 10).map(entry => { const color = scheduleStatusColor(entry.status, accent, muted); return <div key={entry.id} className="flex items-start gap-2.5 rounded-xl border px-3 py-2" style={{ borderColor: `${color}28`, background: `${color}06`, opacity: entry.status === 'cancelled' ? .55 : 1 }}>
        <span className="mt-0.5 shrink-0 text-[10px] font-semibold tabular-nums" style={{ color }}>{entry.time}</span>
        <div className="min-w-0 flex-1"><p className="text-[12px] font-semibold leading-relaxed">{entry.title}</p>{entry.location && <p className="mt-0.5 text-[10px]" style={{ color: muted }}>{entry.location}</p>}</div>
    </div>; })}
</div>;

const ScriptPreview: React.FC<{ data: EchoesScriptPreviewData; accent: string; muted: string }> = ({ data, accent, muted }) => <div className="rounded-xl border px-3 py-3" style={{ borderColor: `${accent}20`, background: `${accent}05` }}>
    {data.scene && <p className="mb-2 text-[10px] uppercase tracking-wide" style={{ color: accent }}>{data.scene}</p>}
    <div className="space-y-1.5">{data.lines.slice(0, 10).map((line, i) => <p key={i} className="text-[11px] leading-relaxed" style={{ color: muted }}>{line}</p>)}</div>
    {!!data.notes.length && <div className="mt-2 border-t pt-2" style={{ borderColor: `${accent}18` }}>{data.notes.slice(0, 4).map((note, i) => <p key={i} className="text-[9.5px] italic opacity-60">{note}</p>)}</div>}
</div>;

const importanceDots = (importance: number, accent: string): React.ReactNode => <span className="inline-flex gap-0.5">{Array.from({ length: 3 }, (_, i) => <span key={i} className="h-1 w-1 rounded-full" style={{ background: i < Math.round(importance * 3) ? accent : `${accent}22` }} />)}</span>;

const EvidenceBoard: React.FC<{ entries: EchoesEvidenceEntry[]; accent: string; muted: string }> = ({ entries, accent, muted }) => <div className="space-y-2">
    {entries.slice(0, 10).map(entry => <div key={entry.id} className="rounded-xl border px-3 py-2.5" style={{ borderColor: `${accent}20`, background: `${accent}05` }}>
        <div className="flex items-center justify-between gap-2"><span className="text-[12px] font-semibold">{entry.title}</span>{importanceDots(entry.importance, accent)}</div>
        <p className="mt-1 text-[10.5px] leading-relaxed" style={{ color: muted }}>{entry.description}</p>
    </div>)}
</div>;

const ResourcePanel: React.FC<{ entries: EchoesResourceEntry[]; accent: string; muted: string }> = ({ entries, accent, muted }) => <div className="space-y-2">
    {entries.slice(0, 8).map(entry => { const max = entry.max ?? Math.max(entry.amount, 1); const ratio = Math.max(0, Math.min(1, entry.amount / max)); const warn = typeof entry.warningAt === 'number' && entry.amount <= entry.warningAt; return <div key={entry.id}>
        <div className="flex items-center justify-between text-[11px]"><span className="font-semibold">{entry.name}</span><span className="tabular-nums" style={{ color: warn ? '#b91c1c' : muted }}>{entry.amount}{entry.max ? `/${entry.max}` : ''}{entry.unit ? ` ${entry.unit}` : ''}</span></div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: `${accent}16` }}><div className="h-full rounded-full transition-all" style={{ width: `${ratio * 100}%`, background: warn ? '#b91c1c' : accent }} /></div>
    </div>; })}
</div>;

const GenericPanel: React.FC<{ data: EchoesGenericPanelData; accent: string; muted: string }> = ({ data, accent, muted }) => <div className="grid grid-cols-2 gap-2">
    {data.fields.slice(0, 12).map(field => <div key={field.id} className="rounded-xl border px-2.5 py-2" style={{ borderColor: `${accent}18`, background: `${accent}03` }}>
        <p className="text-[9.5px]" style={{ color: muted }}>{field.label}</p>
        <p className="mt-0.5 text-[12px] font-semibold">{field.display === 'boolean' ? (field.value ? '是' : '否') : field.display === 'tag' ? <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: `${accent}12`, color: accent }}>{String(field.value)}</span> : String(field.value)}</p>
    </div>)}
</div>;

export const EchoesMechanicRenderer: React.FC<EchoesMechanicRendererProps> = ({ mechanic, accent, palette, busy = false, visualVariant, onAction }) => {
    const [expanded, setExpanded] = useState(true);
    const data = mechanic.data;
    const renderedActions = useMemo(() => {
        const candidates = data.kind === 'event_card' ? [...mechanic.actions, ...data.data.choices] : mechanic.actions;
        const seen = new Set<string>();
        return candidates.filter(action => {
            if (seen.has(action.id)) return false;
            seen.add(action.id);
            return true;
        }).slice(0, 8);
    }, [data, mechanic.actions]);
    const actionCount = useMemo(() => renderedActions.filter(action => !action.disabled).length, [renderedActions]);
    if (mechanic.status === 'hidden' || mechanic.status === 'disabled') return null;

    const kindLabelMap: Partial<Record<EchoesMechanicInstance['kind'], string>> = {
        task_panel: '当前任务', scenario_picker: '下一处去向', event_card: '此刻发生', rules_panel: '已知规则',
        danmaku_stream: '弹幕', trending_board: '热搜/榜单', live_room: '直播间', countdown: '倒计时',
        inventory_grid: '物品栏', leaderboard: '排行榜', relationship_matrix: '关系', schedule_board: '日程',
        script_preview: '剧本/台本', evidence_board: '证据板', resource_panel: '资源',
    };
    const kindLabel = kindLabelMap[mechanic.kind] || '世界节点';
    const isEvent = mechanic.kind === 'event_card' && data.kind === 'event_card';
    const isRegisteredInteractive = getMechanicDefinition(mechanic.kind)?.interactive === true;
    const isInteractive = isRegisteredInteractive && actionCount > 0;
    const isWanxiangTerminal = visualVariant === 'wanxiang_terminal' || visualVariant === 'terminal';

    return <section className="echoes-mechanic-node my-4 overflow-hidden rounded-2xl border transition-all duration-300" style={{ 
        borderColor: isWanxiangTerminal ? `${accent}30` : `${palette.border}`, 
        background: isWanxiangTerminal 
            ? `linear-gradient(165deg, ${accent}08, #000 85%)` 
            : `rgba(255,255,255,0.02)`,
        boxShadow: isWanxiangTerminal ? `0 4px 20px rgba(0,0,0,0.4)` : '0 2px 10px rgba(0,0,0,0.02)',
        backdropFilter: isWanxiangTerminal ? 'none' : 'blur(12px)'
    }}>
        <button type="button" onClick={() => setExpanded(value => !value)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left" aria-expanded={expanded}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl" style={{ 
                color: isWanxiangTerminal ? accent : accent, 
                background: isWanxiangTerminal ? `${accent}15` : `${accent}08`,
            }}>{isEvent ? <WarningCircle size={16} /> : <Sparkle size={16} weight="fill" />}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-[8.5px] font-bold uppercase tracking-[.2em] opacity-40" style={{ color: accent }}>{kindLabel}</span>
                <span className="mt-0.5 block truncate text-[13.5px] font-bold tracking-tight" style={{ 
                    color: isWanxiangTerminal ? accent : 'inherit',
                }}>{mechanic.title}</span>
            </span>
            {busy && <CircleNotch size={14} className="shrink-0 animate-spin opacity-50" style={{ color: accent }} />}
            <CaretDown size={14} className="shrink-0 transition-transform opacity-30" style={{ color: isWanxiangTerminal ? accent : palette.muted, transform: expanded ? 'rotate(180deg)' : undefined }} />
        </button>
        {expanded && <div className="px-4 pb-4 pt-1">
            {mechanic.description && <p className="mb-4 text-[11px] leading-relaxed opacity-50 italic" style={{ color: palette.text }}>{mechanic.description}</p>}
            {data.kind === 'task_panel' && <div className="space-y-2">{data.tasks.slice(0, 8).map(task => <TaskRow key={task.id} task={task} accent={accent} muted={palette.muted} />)}</div>}
            {data.kind === 'rules_panel' && (data.rules.some(rule => rule.known)
                ? <div className="space-y-2">{data.rules.filter(rule => rule.known).slice(0, 12).map(rule => <RuleRow key={rule.id} rule={rule} accent={accent} muted={palette.muted} />)}</div>
                : <p className="text-[11px] leading-relaxed" style={{ color: palette.muted }}>当前还没有可公开确认的规则。</p>)}
            {data.kind === 'scenario_picker' && <div className="space-y-2">{data.options.slice(0, 8).map(option => <ScenarioRow key={option.id} option={option} accent={accent} muted={palette.muted} />)}</div>}
            {data.kind === 'event_card' && <div className="rounded-xl border px-3 py-3 text-[11px] leading-relaxed" style={{ borderColor: `${accent}22`, background: `${accent}06` }}>{data.data.body}</div>}
            {data.kind === 'danmaku_stream' && <DanmakuStream items={data.items} accent={accent} muted={palette.muted} />}
            {data.kind === 'trending_board' && <TrendingBoard entries={data.entries} accent={accent} muted={palette.muted} />}
            {data.kind === 'live_room' && <LiveRoom data={data.data} accent={accent} muted={palette.muted} />}
            {data.kind === 'countdown' && <CountdownPanel data={data.data} accent={accent} muted={palette.muted} />}
            {data.kind === 'inventory_grid' && <InventoryGrid items={data.items} accent={accent} muted={palette.muted} />}
            {data.kind === 'leaderboard' && <LeaderboardPanel entries={data.entries} accent={accent} muted={palette.muted} />}
            {data.kind === 'relationship_matrix' && <RelationshipMatrix entries={data.entries} accent={accent} muted={palette.muted} />}
            {data.kind === 'schedule_board' && <ScheduleBoard entries={data.entries} accent={accent} muted={palette.muted} />}
            {data.kind === 'script_preview' && <ScriptPreview data={data.data} accent={accent} muted={palette.muted} />}
            {data.kind === 'evidence_board' && <EvidenceBoard entries={data.entries} accent={accent} muted={palette.muted} />}
            {data.kind === 'resource_panel' && <ResourcePanel entries={data.entries} accent={accent} muted={palette.muted} />}
            {data.kind === 'generic_panel' && <GenericPanel data={data.data} accent={accent} muted={palette.muted} />}
            {/* cast_roster / lore_codex 正常由"人物"/"世界志"两个独立 tab 渲染，不会内联到这里；此处仅作兜底，避免万一遗漏过滤时留白。 */}
            {data.kind === 'cast_roster' && <p className="text-[11px] leading-relaxed" style={{ color: palette.muted }}>{data.character.name} · 详见"{'人物'}"页</p>}
            {data.kind === 'lore_codex' && <p className="text-[11px] leading-relaxed" style={{ color: palette.muted }}>{data.entry.term} · 详见"世界志"页</p>}
            {data.kind === 'unsupported' && <p className="text-[11px] leading-relaxed" style={{ color: palette.muted }}>{data.data.summary || '这是一个可展开的世界节点。'}</p>}
            {isRegisteredInteractive && <ActionList actions={renderedActions} mechanicId={mechanic.id} accent={accent} border={palette.border} busy={busy} onAction={onAction} />}
        </div>}
        {!expanded && isInteractive && <div className="border-t px-4 py-2 text-[10px]" style={{ borderColor: `${accent}20`, color: palette.muted }}>展开以回应这个节点</div>}
    </section>;
};

export default EchoesMechanicRenderer;
