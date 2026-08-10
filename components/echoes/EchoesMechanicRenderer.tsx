import React, { useMemo, useState } from 'react';
import { CaretDown, Check, CircleNotch, LockKey, Sparkle, WarningCircle } from '@phosphor-icons/react';
import type { EchoesMechanicActionRequest } from '../../utils/echoesMechanicActionsTypes';
import { getMechanicDefinition } from '../../utils/echoesMechanics';
import type {
    EchoesCountdownData,
    EchoesDanmakuItem,
    EchoesEvidenceEntry,
    EchoesGenericPanelData,
    EchoesInventoryItem,
    EchoesLeaderboardEntry,
    EchoesLiveRoomData,
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
    return <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: `${accent}20`, background: `${accent}05` }}>
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <p className="text-[12px] font-semibold leading-relaxed">{task.title}</p>
                {task.description && <p className="mt-1 text-[10px] leading-relaxed" style={{ color: muted }}>{task.description}</p>}
            </div>
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold" style={{ color, background: `${color}16` }}>{statusLabel[task.status] || task.status}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: `${accent}16` }}><div className="h-full rounded-full transition-all" style={{ width: `${Math.round(task.progress * 100)}%`, background: color }} /></div>
            <span className="shrink-0 text-[9px] tabular-nums" style={{ color: muted }}>{Math.round(task.progress * 100)}%</span>
        </div>
    </div>;
};

const RuleRow: React.FC<{ rule: EchoesRuleEntry; accent: string; muted: string }> = ({ rule, accent, muted }) => {
    // Unknown rules are intentionally never passed to this renderer by the
    // visible branch below; this is a second UI-side guard for blind play.
    const color = rule.category === 'must_not' ? '#b91c1c' : rule.category === 'must' ? accent : muted;
    return <div className="flex items-start gap-2.5 rounded-xl border px-3 py-2.5" style={{ borderColor: `${color}28`, background: `${color}06` }}>
        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <p className="text-[11px] leading-relaxed" style={{ color: muted }}>{rule.text}</p>
    </div>;
};

const ScenarioRow: React.FC<{ option: EchoesScenarioOption; accent: string; muted: string }> = ({ option, accent, muted }) => {
    const locked = option.status === 'locked';
    const color = statusColor(option.status, accent);
    return <div className="flex items-start gap-2.5 rounded-xl border px-3 py-2.5" style={{ borderColor: `${accent}20`, background: `${accent}05`, opacity: locked ? .62 : 1 }}>
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ color, background: `${color}16` }}>{locked ? <LockKey size={11} /> : option.selected ? <Check size={12} weight="bold" /> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}</div>
        <div className="min-w-0 flex-1"><p className="text-[12px] font-semibold leading-relaxed">{option.title}</p>{option.description && <p className="mt-1 text-[10px] leading-relaxed" style={{ color: muted }}>{option.description}</p>}{locked && option.lockedReason && <p className="mt-1 text-[9px]" style={{ color: muted }}>{option.lockedReason}</p>}</div>
        {option.danger && !locked && <span className="shrink-0 text-[9px]" style={{ color: '#b45309' }}>{option.danger}</span>}
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

const LiveRoom: React.FC<{ data: EchoesLiveRoomData; accent: string; muted: string }> = ({ data, accent, muted }) => <div className="rounded-xl border px-3 py-3" style={{ borderColor: `${accent}22`, background: `${accent}06` }}>
    <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: data.online ? '#15803d' : muted }} />
        <span className="text-[12px] font-semibold">{data.roomTitle}</span>
        <span className="ml-auto shrink-0 text-[10px] tabular-nums" style={{ color: muted }}>{data.viewerCount.toLocaleString()} 观看</span>
    </div>
    {data.hostName && <p className="mt-1.5 text-[10.5px]" style={{ color: muted }}>主播：{data.hostName}</p>}
    {!!data.gifts?.length && <div className="mt-2 flex flex-wrap gap-1.5">{data.gifts.slice(0, 8).map(gift => <span key={gift.id} className="rounded-full px-2 py-0.5 text-[9.5px]" style={{ background: `${accent}12`, color: accent }}>{gift.name} ×{gift.count}</span>)}</div>}
</div>;

const CountdownPanel: React.FC<{ data: EchoesCountdownData; accent: string; muted: string }> = ({ data, accent, muted }) => {
    const ratio = typeof data.current === 'number' && typeof data.total === 'number' && data.total > 0 ? Math.max(0, Math.min(1, data.current / data.total)) : undefined;
    const color = data.urgent ? '#b91c1c' : accent;
    return <div className="rounded-xl border px-3 py-3" style={{ borderColor: `${color}28`, background: `${color}08` }}>
        <div className="flex items-center justify-between"><span className="text-[11.5px] font-semibold">{data.label}</span><span className="text-[13px] font-bold tabular-nums" style={{ color }}>{typeof data.current === 'number' ? `${data.current}${data.unit}` : '—'}</span></div>
        {ratio !== undefined && <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: `${color}18` }}><div className="h-full rounded-full transition-all" style={{ width: `${ratio * 100}%`, background: color }} /></div>}
    </div>;
};

const InventoryGrid: React.FC<{ items: EchoesInventoryItem[]; accent: string; muted: string }> = ({ items, accent, muted }) => {
    if (!items.length) return <p className="text-[11px] leading-relaxed" style={{ color: muted }}>暂无物品。</p>;
    return <div className="grid grid-cols-2 gap-2">
        {items.slice(0, 12).map(item => <div key={item.id} className="rounded-xl border px-2.5 py-2" style={{ borderColor: item.equipped ? `${accent}45` : `${accent}18`, background: item.equipped ? `${accent}0a` : `${accent}03` }}>
            <div className="flex items-center justify-between gap-1"><span className="min-w-0 truncate text-[11px] font-semibold">{item.name}</span><span className="shrink-0 text-[10px] tabular-nums" style={{ color: muted }}>×{item.quantity}</span></div>
            {item.equipped && <span className="mt-1 inline-block rounded-full px-1.5 py-0.5 text-[8.5px]" style={{ background: `${accent}16`, color: accent }}>已装备</span>}
        </div>)}
    </div>;
};

const LeaderboardPanel: React.FC<{ entries: EchoesLeaderboardEntry[]; accent: string; muted: string }> = ({ entries, accent, muted }) => <div className="space-y-1.5">
    {entries.slice(0, 10).map(entry => <div key={entry.id} className="flex items-center gap-2.5 rounded-xl border px-3 py-2" style={{ borderColor: entry.isPlayer ? `${accent}45` : `${accent}18`, background: entry.isPlayer ? `${accent}0a` : `${accent}03` }}>
        <span className="w-5 shrink-0 text-center text-[11px] font-bold" style={{ color: entry.rank <= 3 ? accent : muted }}>{entry.rank}</span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{entry.name}{entry.isPlayer && <span className="ml-1.5 opacity-60">（我）</span>}</span>
        <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color: accent }}>{entry.score}</span>
        <span className="shrink-0 text-[9px] tabular-nums" style={{ color: muted }}>{rankChangeLabel(entry.trend)}</span>
    </div>)}
</div>;

const RelationshipMatrix: React.FC<{ entries: EchoesRelationshipEntry[]; accent: string; muted: string }> = ({ entries, accent, muted }) => <div className="space-y-2">
    {entries.slice(0, 10).map(entry => <div key={entry.id} className="rounded-xl border px-3 py-2.5" style={{ borderColor: `${accent}18`, background: `${accent}03` }}>
        <div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-[12px] font-semibold">{entry.name}</span><span className="shrink-0 text-[10px]" style={{ color: muted }}>{entry.status}</span></div>
        <div className="mt-1.5 flex items-center gap-3 text-[9.5px]" style={{ color: muted }}>
            <span className="flex items-center gap-1">信任<span className="inline-block h-1 w-10 overflow-hidden rounded-full" style={{ background: `${accent}16` }}><span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, entry.trust))}%`, background: accent }} /></span></span>
            <span className="flex items-center gap-1">好感<span className="inline-block h-1 w-10 overflow-hidden rounded-full" style={{ background: `${accent}16` }}><span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, entry.affection))}%`, background: accent }} /></span></span>
        </div>
        {!!entry.tags.length && <div className="mt-1.5 flex flex-wrap gap-1">{entry.tags.slice(0, 4).map((tag, i) => <span key={`${tag}-${i}`} className="rounded-full px-1.5 py-0.5 text-[8.5px]" style={{ background: `${accent}12`, color: accent }}>{tag}</span>)}</div>}
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

export const EchoesMechanicRenderer: React.FC<EchoesMechanicRendererProps> = ({ mechanic, accent, palette, busy = false, onAction }) => {
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
    return <section className="echoes-mechanic-node my-5 overflow-hidden rounded-2xl border" style={{ borderColor: `${accent}38`, background: `linear-gradient(145deg, ${accent}0d, ${palette.panel}d9)` }}>
        <button type="button" onClick={() => setExpanded(value => !value)} className="flex w-full items-center gap-2 px-4 py-3 text-left" aria-expanded={expanded}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ color: accent, background: `${accent}18` }}>{isEvent ? <WarningCircle size={14} /> : <Sparkle size={14} weight="fill" />}</span>
            <span className="min-w-0 flex-1"><span className="block text-[9px] uppercase tracking-[.16em]" style={{ color: accent }}>{kindLabel}</span><span className="mt-0.5 block truncate text-[13px] font-semibold">{mechanic.title}</span></span>
            {busy && <CircleNotch size={13} className="shrink-0 animate-spin" style={{ color: accent }} />}
            <CaretDown size={15} className="shrink-0 transition-transform" style={{ color: palette.muted, transform: expanded ? 'rotate(180deg)' : undefined }} />
        </button>
        {expanded && <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: `${accent}20` }}>
            {mechanic.description && <p className="mb-3 text-[10.5px] leading-relaxed" style={{ color: palette.muted }}>{mechanic.description}</p>}
            {data.kind === 'task_panel' && <div className="space-y-2">{data.tasks.slice(0, 8).map(task => <TaskRow key={task.id} task={task} accent={accent} muted={palette.muted} />)}</div>}
            {data.kind === 'rules_panel' && (data.rules.some(rule => rule.known)
                ? <div className="space-y-2">{data.rules.filter(rule => rule.known).slice(0, 12).map(rule => <RuleRow key={rule.id} rule={rule} accent={accent} muted={palette.muted} />)}</div>
                : <p className="text-[11px] leading-relaxed" style={{ color: palette.muted }}>当前还没有可公开确认的规则。</p>)}
            {data.kind === 'scenario_picker' && <div className="space-y-2">{data.options.slice(0, 8).map(option => <ScenarioRow key={option.id} option={option} accent={accent} muted={palette.muted} />)}</div>}
            {data.kind === 'event_card' && <div className="rounded-xl border px-3 py-3 text-[11px] leading-relaxed" style={{ borderColor: `${accent}22`, background: `${accent}06` }}>{data.data.body}</div>}
            {data.kind === 'danmaku_stream' && <DanmakuList items={data.items} accent={accent} muted={palette.muted} />}
            {data.kind === 'trending_board' && <div className="space-y-1.5">{data.entries.slice(0, 10).map(entry => <TrendingRow key={entry.id} entry={entry} accent={accent} muted={palette.muted} />)}</div>}
            {data.kind === 'live_room' && <LiveRoomCard data={data.data} accent={accent} muted={palette.muted} />}
            {data.kind === 'countdown' && <CountdownCard data={data.data} accent={accent} muted={palette.muted} />}
            {data.kind === 'inventory_grid' && <div className="grid grid-cols-2 gap-2">{data.items.slice(0, 12).map(item => <InventoryCell key={item.id} item={item} accent={accent} muted={palette.muted} border={palette.border} />)}</div>}
            {data.kind === 'leaderboard' && <div className="space-y-1.5">{data.entries.slice(0, 10).map(entry => <LeaderboardRow key={entry.id} entry={entry} accent={accent} muted={palette.muted} />)}</div>}
            {data.kind === 'relationship_matrix' && <div className="space-y-2">{data.entries.slice(0, 10).map(entry => <RelationshipRow key={entry.id} entry={entry} accent={accent} muted={palette.muted} />)}</div>}
            {data.kind === 'schedule_board' && <div className="space-y-1.5">{data.entries.slice(0, 10).map(entry => <ScheduleRow key={entry.id} entry={entry} accent={accent} muted={palette.muted} />)}</div>}
            {data.kind === 'script_preview' && <ScriptPreviewCard data={data.data} accent={accent} muted={palette.muted} />}
            {data.kind === 'evidence_board' && <div className="space-y-2">{data.entries.slice(0, 10).map(entry => <EvidenceRow key={entry.id} entry={entry} accent={accent} muted={palette.muted} />)}</div>}
            {data.kind === 'resource_panel' && <div className="grid grid-cols-2 gap-2">{data.entries.slice(0, 8).map(entry => <ResourceCell key={entry.id} entry={entry} accent={accent} muted={palette.muted} />)}</div>}
            {data.kind === 'generic_panel' && <GenericPanelCard data={data.data} accent={accent} muted={palette.muted} />}
            {data.kind === 'unsupported' && <p className="text-[11px] leading-relaxed" style={{ color: palette.muted }}>{data.data.summary || '这是一个可展开的世界节点。'}</p>}
            {isRegisteredInteractive && <ActionList actions={renderedActions} mechanicId={mechanic.id} accent={accent} border={palette.border} busy={busy} onAction={onAction} />}
        </div>}
        {!expanded && isInteractive && <div className="border-t px-4 py-2 text-[10px]" style={{ borderColor: `${accent}20`, color: palette.muted }}>展开以回应这个节点</div>}
    </section>;
};

export default EchoesMechanicRenderer;
