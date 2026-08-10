import {
    ECHOES_MECHANICS_SCHEMA_VERSION,
    type EchoesCountdownData,
    type EchoesDanmakuItem,
    type EchoesEventCardData,
    type EchoesEvidenceEntry,
    type EchoesGenericPanelData,
    type EchoesCastCharacter,
    type EchoesInventoryItem,
    type EchoesLeaderboardEntry,
    type EchoesLiveRoomData,
    type EchoesLoreEntry,
    type EchoesMechanicAction,
    type EchoesMechanicActionEffect,
    type EchoesMechanicData,
    type EchoesMechanicInstance,
    type EchoesMechanicKind,
    type EchoesMechanicNormalizationResult,
    type EchoesMechanicPatch,
    type EchoesMechanicSource,
    type EchoesMechanicStatus,
    type EchoesMechanicTrigger,
    type EchoesRelationshipEntry,
    type EchoesResourceEntry,
    type EchoesRuleEntry,
    type EchoesScenarioOption,
    type EchoesScheduleEntry,
    type EchoesScriptPreviewData,
    type EchoesTaskEntry,
    type EchoesTaskStatus,
    type EchoesTrendingEntry,
} from './echoesMechanicsTypes';

export interface EchoesMechanicDefinition {
    kind: EchoesMechanicKind;
    label: string;
    purpose: string;
    allowedTriggers: EchoesMechanicTrigger[];
    interactive: boolean;
}

export const ECHOES_MECHANIC_CATALOG: readonly EchoesMechanicDefinition[] = [
    { kind: 'danmaku_stream', label: '弹幕流', purpose: '直播、节目播出或全民围观时的实时评论流', allowedTriggers: ['scene', 'event', 'manual'], interactive: false },
    { kind: 'trending_board', label: '热搜/榜单', purpose: '热搜、悬赏榜、天骄榜等可配置排行榜', allowedTriggers: ['scene', 'chapter_end', 'event', 'manual'], interactive: true },
    { kind: 'live_room', label: '直播间', purpose: '直播状态、观众人数、主播和礼物信息', allowedTriggers: ['scene', 'event', 'manual'], interactive: true },
    { kind: 'scenario_picker', label: '副本选择', purpose: '副本、关卡、任务地点或路线选择', allowedTriggers: ['chapter_end', 'choice', 'manual'], interactive: true },
    { kind: 'rules_panel', label: '规则面板', purpose: '规则怪谈、副本须知和已知/未知规则', allowedTriggers: ['chapter_start', 'scene', 'event', 'manual'], interactive: false },
    { kind: 'task_panel', label: '任务面板', purpose: '任务目标、进度、奖励和失败状态', allowedTriggers: ['scene', 'choice', 'event', 'manual'], interactive: true },
    { kind: 'countdown', label: '倒计时', purpose: '副本、比赛、危机或限时事件的剩余时间', allowedTriggers: ['scene', 'event', 'always'], interactive: false },
    { kind: 'inventory_grid', label: '物品栏', purpose: '道具、装备、消耗品和可带出物品', allowedTriggers: ['scene', 'choice', 'event', 'manual'], interactive: true },
    { kind: 'leaderboard', label: '排行榜', purpose: '积分、排名、战绩或声望榜', allowedTriggers: ['chapter_end', 'event', 'manual'], interactive: false },
    { kind: 'relationship_matrix', label: '关系矩阵', purpose: '信任、好感、敌意和队伍关系', allowedTriggers: ['scene', 'event', 'manual'], interactive: false },
    { kind: 'schedule_board', label: '日程表', purpose: '通告、行程、拍摄、比赛或约会安排', allowedTriggers: ['chapter_start', 'scene', 'event', 'manual'], interactive: true },
    { kind: 'script_preview', label: '剧本/台本', purpose: '拍戏、排练、任务剧本或角色台词预览', allowedTriggers: ['scene', 'choice', 'manual'], interactive: false },
    { kind: 'evidence_board', label: '证据板', purpose: '线索、证词、文件和证据关联', allowedTriggers: ['scene', 'event', 'manual'], interactive: true },
    { kind: 'resource_panel', label: '资源面板', purpose: '生存资源、材料、货币或可消耗数值', allowedTriggers: ['scene', 'event', 'manual'], interactive: false },
    { kind: 'event_card', label: '突发事件', purpose: '需要玩家回应的事件通知或临时危机', allowedTriggers: ['scene', 'choice', 'event'], interactive: true },
    { kind: 'generic_panel', label: '自定义面板', purpose: '已注册组件无法精确表达时的安全结构化面板', allowedTriggers: ['scene', 'event', 'manual'], interactive: false },
    { kind: 'cast_roster', label: '人物档案', purpose: '"人物"tab 的单个角色结构化档案，AI 用稳定 id 精确增删', allowedTriggers: ['always'], interactive: false },
    { kind: 'lore_codex', label: '世界志条目', purpose: '"世界志"tab 的单条地点/势力/纪年事件/名词/道具条目', allowedTriggers: ['always'], interactive: false },
];

const CATALOG = new Map(ECHOES_MECHANIC_CATALOG.map(item => [item.kind, item]));
const KINDS = new Set<EchoesMechanicKind>(ECHOES_MECHANIC_CATALOG.map(item => item.kind));

/**
 * cast_roster / lore_codex 是"人物"/"世界志"两个核心导航 tab 的数据来源，
 * 属于每个世界都必须具备的通用能力，不是世界包按需选配的玩法机制（如
 * task_panel、danmaku_stream）。因此它们始终允许使用，不受
 * EchoesNovelProfile.enabledMechanicKinds 白名单约束——该白名单只用于
 * 控制"是否启用某种可选玩法机制"，不应该关闭基础导航。
 */
export const ALWAYS_ENABLED_MECHANIC_KINDS: ReadonlySet<EchoesMechanicKind> = new Set(['cast_roster', 'lore_codex']);
const STATUSES = new Set<EchoesMechanicStatus>(['active', 'hidden', 'completed', 'failed', 'disabled']);
const TRIGGERS = new Set<EchoesMechanicTrigger>(['manual', 'scene', 'chapter_start', 'chapter_end', 'choice', 'event', 'always']);
const SOURCES = new Set<EchoesMechanicSource>(['user', 'ai', 'system']);
const text = (value: unknown, max = 2000): string => typeof value === 'string' ? value.trim().slice(0, max) : '';
const stableHash = (value: string): string => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
};
const finite = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const integer = (value: unknown, fallback = 0): number => Math.floor(finite(value, fallback));
const range = (value: unknown, min: number, max: number, fallback = min): number => Math.max(min, Math.min(max, finite(value, fallback)));
const bool = (value: unknown, fallback = false): boolean => typeof value === 'boolean' ? value : fallback;
const array = (value: unknown, max = 100): unknown[] => Array.isArray(value) ? value.slice(0, max) : [];
const stringArray = (value: unknown, max = 100, itemMax = 500): string[] => array(value, max).map(item => text(item, itemMax)).filter(Boolean);

const singleLine = (value: unknown, max = 2000): string => text(value, max).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
const safeActionTargetId = (value: unknown): string => singleLine(value, 160);

const normalizeActionEffect = (value: unknown): EchoesMechanicActionEffect | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const raw = value as Record<string, unknown>;
    const type = singleLine(raw.type, 40);
    const targetMechanicId = safeActionTargetId(raw.targetMechanicId);
    if (type === 'set_status' && ['active', 'hidden', 'completed', 'failed'].includes(raw.status as string)) {
        return {
            type,
            status: raw.status as Exclude<EchoesMechanicStatus, 'disabled'>,
            ...(targetMechanicId ? { targetMechanicId } : {}),
        };
    }
    if (type === 'scenario_select' && singleLine(raw.optionId, 120)) return {
        type,
        optionId: singleLine(raw.optionId, 120),
        ...(targetMechanicId ? { targetMechanicId } : {}),
    };
    if (type === 'task_update' && singleLine(raw.taskId, 120)) {
        return {
            type,
            taskId: singleLine(raw.taskId, 120),
            ...(targetMechanicId ? { targetMechanicId } : {}),
            ...(typeof raw.status === 'string' && ['available', 'active', 'completed', 'failed', 'locked'].includes(raw.status) ? { status: raw.status as EchoesTaskStatus } : {}),
            ...(typeof raw.progress === 'number' && Number.isFinite(raw.progress) ? { progress: Math.max(0, Math.min(1, raw.progress)) } : {}),
        };
    }
    if (type === 'inventory_update' && singleLine(raw.itemId, 120)) {
        return {
            type,
            itemId: singleLine(raw.itemId, 120),
            ...(targetMechanicId ? { targetMechanicId } : {}),
            ...(typeof raw.quantity === 'number' && Number.isFinite(raw.quantity) ? { quantity: Math.max(0, Math.min(9999, Math.floor(raw.quantity))) } : {}),
            ...(typeof raw.equipped === 'boolean' ? { equipped: raw.equipped } : {}),
        };
    }
    return undefined;
};

const normalizeAction = (value: unknown): EchoesMechanicAction | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    const id = singleLine(raw.id, 120);
    const label = singleLine(raw.label, 200);
    if (!id || !label) return null;
    const payload: Record<string, string | number | boolean | null> = {};
    if (raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload)) {
        Object.entries(raw.payload as Record<string, unknown>).slice(0, 20).forEach(([key, item]) => {
            const safeKey = singleLine(key, 100);
            if (!safeKey) return;
            if (typeof item === 'string') payload[safeKey] = singleLine(item, 500);
            else if (typeof item === 'number' || typeof item === 'boolean' || item === null) payload[safeKey] = item;
        });
    }
    const effect = normalizeActionEffect(raw.effect);
    return {
        id,
        label,
        disabled: bool(raw.disabled),
        ...(singleLine(raw.disabledReason, 300) ? { disabledReason: singleLine(raw.disabledReason, 300) } : {}),
        ...(Object.keys(payload).length ? { payload } : {}),
        ...(effect ? { effect } : {}),
    };
};

const actions = (value: unknown): EchoesMechanicAction[] => array(value, 20).map(normalizeAction).filter((item): item is EchoesMechanicAction => !!item);

const normalizeData = (kind: EchoesMechanicKind, rawData: unknown): EchoesMechanicData => {
    const raw = rawData && typeof rawData === 'object' && !Array.isArray(rawData) ? rawData as Record<string, unknown> : {};
    switch (kind) {
        case 'danmaku_stream': {
            const items: EchoesDanmakuItem[] = array(raw.items, 100).map((item, index) => {
                const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                return {
                    id: text(value.id, 120) || `danmaku-${index + 1}`,
                    text: text(value.text ?? value.content, 500),
                    tone: ['supportive', 'critical', 'neutral', 'shipping', 'hostile', 'rumor', 'unknown'].includes(value.tone as string) ? value.tone as EchoesDanmakuItem['tone'] : 'unknown',
                    ...(text(value.author, 100) ? { author: text(value.author, 100) } : {}),
                    intensity: range(value.intensity, 0, 1, .5),
                    visible: value.visible !== false,
                };
            }).filter(item => item.text);
            return { kind, items };
        }
        case 'trending_board': {
            const entries: EchoesTrendingEntry[] = array(raw.entries, 50).map((item, index) => {
                const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                const rankChange = typeof value.rankChange === 'number' && Number.isFinite(value.rankChange)
                    ? integer(value.rankChange) : (value.rankChange === 'new' || value.rankChange === 'same' ? value.rankChange : 'same');
                return {
                    id: text(value.id, 120) || `trend-${index + 1}`,
                    topic: text(value.topic ?? value.title, 300),
                    rank: Math.max(1, integer(value.rank, index + 1)),
                    rankChange,
                    heat: range(value.heat, 0, 100, 0),
                    ...(text(value.summary, 800) ? { summary: text(value.summary, 800) } : {}),
                    relatedToPlayer: bool(value.relatedToPlayer),
                };
            }).filter(item => item.topic);
            return { kind, entries: entries.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id)) };
        }
        case 'live_room': {
            const data: EchoesLiveRoomData = {
                roomTitle: text(raw.roomTitle ?? raw.title, 300),
                viewerCount: Math.max(0, integer(raw.viewerCount)),
                online: raw.online !== false,
                ...(text(raw.hostName, 200) ? { hostName: text(raw.hostName, 200) } : {}),
                gifts: array(raw.gifts, 30).map(item => {
                    const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                    return { id: text(value.id, 100), name: text(value.name, 200), count: Math.max(0, integer(value.count)) };
                }).filter(item => item.id && item.name),
            };
            return { kind, data };
        }
        case 'scenario_picker': {
            const options: EchoesScenarioOption[] = array(raw.options, 30).map((item, index) => {
                const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                const status = ['available', 'selected', 'locked', 'completed', 'failed'].includes(value.status as string) ? value.status as EchoesScenarioOption['status'] : 'available';
                return {
                    id: text(value.id, 120) || `scenario-${index + 1}`,
                    title: text(value.title ?? value.name, 300),
                    description: text(value.description, 1200),
                    ...(text(value.hint, 500) ? { hint: text(value.hint, 500) } : {}),
                    ...(text(value.danger, 100) ? { danger: text(value.danger, 100) } : {}),
                    status,
                    ...(text(value.lockedReason, 300) ? { lockedReason: text(value.lockedReason, 300) } : {}),
                    selected: bool(value.selected) || status === 'selected',
                };
            }).filter(item => item.title);
            return { kind, options, allowAutoSelect: bool(raw.allowAutoSelect) };
        }
        case 'rules_panel': {
            const rules: EchoesRuleEntry[] = array(raw.rules, 100).map((item, index) => {
                const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                return {
                    id: text(value.id, 120) || `rule-${index + 1}`,
                    text: text(value.text ?? value.rule, 1000),
                    category: ['must', 'must_not', 'conditional', 'unknown'].includes(value.category as string) ? value.category as EchoesRuleEntry['category'] : 'unknown',
                    known: bool(value.known),
                    severity: range(value.severity, 0, 1, .5),
                };
            }).filter(item => item.text);
            return { kind, rules };
        }
        case 'task_panel': {
            const tasks: EchoesTaskEntry[] = array(raw.tasks, 50).map((item, index) => {
                const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                const status = ['available', 'active', 'completed', 'failed', 'locked'].includes(value.status as string) ? value.status as EchoesTaskEntry['status'] : 'available';
                return {
                    id: text(value.id, 120) || `task-${index + 1}`,
                    title: text(value.title, 300),
                    description: text(value.description, 1200),
                    status,
                    progress: range(value.progress, 0, 1, 0),
                    ...(text(value.objective, 500) ? { objective: text(value.objective, 500) } : {}),
                    ...(text(value.reward, 500) ? { reward: text(value.reward, 500) } : {}),
                };
            }).filter(item => item.title);
            return { kind, tasks };
        }
        case 'countdown': {
            const data: EchoesCountdownData = {
                label: text(raw.label ?? raw.title, 300),
                ...(typeof raw.current === 'number' ? { current: Math.max(0, raw.current) } : {}),
                ...(typeof raw.total === 'number' ? { total: Math.max(0, raw.total) } : {}),
                ...(typeof raw.endsAt === 'number' ? { endsAt: Math.max(0, raw.endsAt) } : {}),
                unit: text(raw.unit, 50) || '秒',
                urgent: bool(raw.urgent),
            };
            return { kind, data };
        }
        case 'inventory_grid': {
            const items: EchoesInventoryItem[] = array(raw.items, 100).map((item, index) => {
                const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                return {
                    id: text(value.id, 120) || `item-${index + 1}`,
                    name: text(value.name, 300),
                    ...(text(value.description, 800) ? { description: text(value.description, 800) } : {}),
                    quantity: Math.max(0, integer(value.quantity, 1)),
                    equipped: bool(value.equipped),
                    tags: stringArray(value.tags, 10, 100),
                };
            }).filter(item => item.name);
            return { kind, items };
        }
        case 'leaderboard': {
            const entries: EchoesLeaderboardEntry[] = array(raw.entries, 100).map((item, index) => {
                const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                const trend = typeof value.trend === 'number' && Number.isFinite(value.trend) ? integer(value.trend) : (value.trend === 'new' || value.trend === 'same' ? value.trend : 'same');
                return { id: text(value.id, 120) || `leader-${index + 1}`, name: text(value.name, 300), score: finite(value.score), rank: Math.max(1, integer(value.rank, index + 1)), isPlayer: bool(value.isPlayer), trend };
            }).filter(item => item.name).sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
            return { kind, entries };
        }
        case 'relationship_matrix': {
            const entries: EchoesRelationshipEntry[] = array(raw.entries, 100).map((item, index) => {
                const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                return { id: text(value.id, 120) || `relation-${index + 1}`, name: text(value.name, 300), status: text(value.status, 200), trust: range(value.trust, -1, 1, 0), affection: range(value.affection, -1, 1, 0), tags: stringArray(value.tags, 10, 100) };
            }).filter(item => item.name);
            return { kind, entries };
        }
        case 'schedule_board': {
            const entries: EchoesScheduleEntry[] = array(raw.entries, 100).map((item, index) => {
                const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                const status = ['upcoming', 'active', 'done', 'cancelled'].includes(value.status as string) ? value.status as EchoesScheduleEntry['status'] : 'upcoming';
                return { id: text(value.id, 120) || `schedule-${index + 1}`, title: text(value.title, 300), time: text(value.time, 100), ...(text(value.location, 200) ? { location: text(value.location, 200) } : {}), status, importance: range(value.importance, 0, 1, .5) };
            }).filter(item => item.title);
            return { kind, entries };
        }
        case 'script_preview': {
            const data: EchoesScriptPreviewData = { title: text(raw.title, 300), ...(text(raw.role, 200) ? { role: text(raw.role, 200) } : {}), ...(text(raw.scene, 500) ? { scene: text(raw.scene, 500) } : {}), lines: stringArray(raw.lines, 100, 1000), notes: stringArray(raw.notes, 50, 600) };
            return { kind, data };
        }
        case 'evidence_board': {
            const entries: EchoesEvidenceEntry[] = array(raw.entries, 100).map((item, index) => {
                const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                const category = ['evidence', 'testimony', 'document', 'object', 'unknown'].includes(value.category as string) ? value.category as EchoesEvidenceEntry['category'] : 'unknown';
                return { id: text(value.id, 120) || `evidence-${index + 1}`, title: text(value.title, 300), description: text(value.description, 1000), category, importance: range(value.importance, 0, 1, .5), connectedIds: stringArray(value.connectedIds, 30, 120) };
            }).filter(item => item.title);
            return { kind, entries };
        }
        case 'resource_panel': {
            const entries: EchoesResourceEntry[] = array(raw.entries, 100).map((item, index) => {
                const value = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                return { id: text(value.id, 120) || `resource-${index + 1}`, name: text(value.name, 300), amount: finite(value.amount), ...(typeof value.max === 'number' ? { max: Math.max(0, value.max) } : {}), ...(text(value.unit, 50) ? { unit: text(value.unit, 50) } : {}), ...(typeof value.warningAt === 'number' ? { warningAt: value.warningAt } : {}) };
            }).filter(item => item.name);
            return { kind, entries };
        }
        case 'event_card': {
            const value = raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data as Record<string, unknown> : raw;
            const severity = ['info', 'notice', 'warning', 'critical'].includes(value.severity as string) ? value.severity as EchoesEventCardData['severity'] : 'info';
            return { kind, data: { title: text(value.title, 300), body: text(value.body ?? value.description, 2000), severity, choices: actions(value.choices) } };
        }
        case 'generic_panel': {
            const value = raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data as Record<string, unknown> : raw;
            const fields = array(value.fields, 100).map((item, index) => {
                const field = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                const display = ['text', 'number', 'boolean', 'tag'].includes(field.display as string) ? field.display as EchoesGenericPanelData['fields'][number]['display'] : 'text';
                const rawValue = field.value;
                const safeValue = typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean' || rawValue === null ? rawValue : text(rawValue);
                return { id: text(field.id, 120) || `field-${index + 1}`, label: text(field.label, 200), value: safeValue, display };
            }).filter(field => field.label);
            return { kind, data: { fields } };
        }
        case 'cast_roster': {
            // AI 有时会按 { character: {...} } 嵌套，有时会把字段直接平铺在 data 里；两种形状都接受。
            const value = raw.character && typeof raw.character === 'object' ? raw.character as Record<string, unknown> : raw;
            const fields = array(value.fields, 40).map((item) => {
                const field = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                return { label: text(field.label, 100), value: text(field.value, 600) };
            }).filter(field => field.label);
            const sections = array(value.sections, 20).map((item) => {
                const section = item && typeof item === 'object' ? item as Record<string, unknown> : {};
                return { heading: text(section.heading, 100), body: text(section.body, 4000) };
            }).filter(section => section.heading && section.body);
            const character = {
                name: text(value.name, 100),
                ...(text(value.aliasTitle, 100) ? { aliasTitle: text(value.aliasTitle, 100) } : {}),
                ...(text(value.role, 300) ? { role: text(value.role, 300) } : {}),
                isPlayer: value.isPlayer === true,
                fields,
                sections,
                tags: stringArray(value.tags, 12, 50),
            };
            return { kind, character };
        }
        case 'lore_codex': {
            const value = raw.entry && typeof raw.entry === 'object' ? raw.entry as Record<string, unknown> : raw;
            const category = ['place', 'faction', 'timeline', 'concept', 'item', 'other'].includes(value.category as string) ? value.category as EchoesLoreEntry['category'] : 'other';
            const entry = {
                term: text(value.term, 150),
                category,
                summary: text(value.summary, 500),
                ...(text(value.details, 4000) ? { details: text(value.details, 4000) } : {}),
                tags: stringArray(value.tags, 12, 50),
            };
            return { kind, entry };
        }
        case 'unsupported':
            return { kind, data: { requestedKind: text(raw.requestedKind, 120), reason: text(raw.reason, 800), summary: text(raw.summary, 1200) } };
    }
};

const normalizeKind = (value: unknown): EchoesMechanicKind => KINDS.has(value as EchoesMechanicKind) ? value as EchoesMechanicKind : 'unsupported';
const normalizeTrigger = (value: unknown, kind: EchoesMechanicKind): EchoesMechanicTrigger => {
    if (TRIGGERS.has(value as EchoesMechanicTrigger)) return value as EchoesMechanicTrigger;
    return getMechanicDefinition(kind)?.allowedTriggers[0] || 'scene';
};
const normalizeStatus = (value: unknown): EchoesMechanicStatus => STATUSES.has(value as EchoesMechanicStatus) ? value as EchoesMechanicStatus : 'active';
const normalizeSource = (value: unknown): EchoesMechanicSource => SOURCES.has(value as EchoesMechanicSource) ? value as EchoesMechanicSource : 'ai';

export const getMechanicDefinition = (kind: string): EchoesMechanicDefinition | undefined => CATALOG.get(kind as EchoesMechanicKind);
export const isRegisteredMechanicKind = (kind: unknown): kind is EchoesMechanicKind => KINDS.has(kind as EchoesMechanicKind);

export const getMechanicCatalogForPrompt = (): string => ECHOES_MECHANIC_CATALOG
    .map(item => `- ${item.kind}: ${item.label}；用途：${item.purpose}；触发：${item.allowedTriggers.join('、')}；可交互：${item.interactive ? '是' : '否'}`)
    .join('\n');

/** 把 AI 返回的任意组件对象约束为注册组件或安全 unsupported 组件。 */
export const normalizeMechanic = (raw: unknown, now = Date.now()): EchoesMechanicInstance => {
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const requestedKind = text(value.kind, 100);
    const kind = normalizeKind(requestedKind);
    const id = text(value.id, 160) || `mechanic-${stableHash(`${requestedKind}|${text(value.title ?? value.label, 300)}|${JSON.stringify(value.data ?? value)}`)}`;
    const data = kind === 'unsupported'
        ? { kind: 'unsupported' as const, data: { requestedKind, reason: '组件类型未注册，已降级为只读说明', summary: text(value.description ?? value.title, 1200) } }
        : normalizeData(kind, value.data ?? value);
    return {
        schemaVersion: ECHOES_MECHANICS_SCHEMA_VERSION,
        id,
        kind,
        title: text(value.title ?? value.label, 300) || (kind === 'unsupported' ? requestedKind || '未注册组件' : getMechanicDefinition(kind)?.label || kind),
        ...(text(value.description, 1200) ? { description: text(value.description, 1200) } : {}),
        trigger: normalizeTrigger(value.trigger, kind),
        status: normalizeStatus(value.status),
        source: normalizeSource(value.source),
        data,
        actions: actions(value.actions),
        updatedAt: now,
    };
};

export const normalizeMechanics = (raw: unknown, now = Date.now()): EchoesMechanicNormalizationResult => {
    const mechanics = array(raw, 50).map(item => normalizeMechanic(item, now));
    return {
        mechanics,
        unsupported: mechanics.filter(item => item.kind === 'unsupported'),
    };
};

export const applyMechanicPatches = (current: EchoesMechanicInstance[], rawPatches: unknown, now = Date.now()): EchoesMechanicInstance[] => {
    let next = current.map(item => normalizeMechanic(item, now));
    for (const raw of array(rawPatches, 80)) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const patch = raw as Record<string, unknown>;
        const op = patch.op === 'remove' || patch.op === 'clear' || patch.op === 'upsert' ? patch.op : 'upsert';
        if (op === 'clear') {
            next = [];
            continue;
        }
        const id = text(patch.id ?? (patch.mechanic && typeof patch.mechanic === 'object' ? (patch.mechanic as Record<string, unknown>).id : ''), 160);
        if (op === 'remove') {
            if (id) next = next.filter(item => item.id !== id);
            continue;
        }
        if (!patch.mechanic || typeof patch.mechanic !== 'object' || Array.isArray(patch.mechanic)) continue;
        const incoming = normalizeMechanic(patch.mechanic, now);
        const index = next.findIndex(item => item.id === incoming.id);
        if (index < 0) next.push(incoming);
        else next[index] = incoming;
    }
    return next.slice(-50);
};

export const selectMechanicsForTrigger = (mechanics: EchoesMechanicInstance[], trigger: EchoesMechanicTrigger): EchoesMechanicInstance[] => mechanics
    .map(item => normalizeMechanic(item))
    .filter(item => item.status === 'active' && (item.trigger === trigger || item.trigger === 'always'));

export const __testing = { normalizeData, normalizeKind };
