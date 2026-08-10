import React, { useMemo, useState } from 'react';
import { CaretDown, Check, CircleNotch, LockKey, Sparkle, WarningCircle } from '@phosphor-icons/react';
import type { EchoesMechanicActionRequest } from '../../utils/echoesMechanicActionsTypes';
import { getMechanicDefinition } from '../../utils/echoesMechanics';
import type {
    EchoesMechanicAction,
    EchoesMechanicInstance,
    EchoesRuleEntry,
    EchoesScenarioOption,
    EchoesTaskEntry,
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

    const kindLabel = mechanic.kind === 'task_panel' ? '当前任务' : mechanic.kind === 'scenario_picker' ? '下一处去向' : mechanic.kind === 'event_card' ? '此刻发生' : mechanic.kind === 'rules_panel' ? '已知规则' : '世界节点';
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
            {data.kind !== 'task_panel' && data.kind !== 'rules_panel' && data.kind !== 'scenario_picker' && data.kind !== 'event_card' && <p className="text-[11px] leading-relaxed" style={{ color: palette.muted }}>这是一个可展开的世界节点。{mechanic.description || '继续阅读以了解它如何影响当前场景。'}</p>}
            {isRegisteredInteractive && <ActionList actions={renderedActions} mechanicId={mechanic.id} accent={accent} border={palette.border} busy={busy} onAction={onAction} />}
        </div>}
        {!expanded && isInteractive && <div className="border-t px-4 py-2 text-[10px]" style={{ borderColor: `${accent}20`, color: palette.muted }}>展开以回应这个节点</div>}
    </section>;
};

export default EchoesMechanicRenderer;
