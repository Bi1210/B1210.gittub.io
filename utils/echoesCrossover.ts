import {
    ECHOES_CROSSOVER_SCHEMA_VERSION,
    type EchoesCanonEvent,
    type EchoesCanonEventStatus,
    type EchoesCanonKnowledge,
    type EchoesCrossoverConfig,
    type EchoesCrossoverKind,
    type EchoesCrossoverRole,
    type EchoesCrossoverTimelineState,
    type EchoesDeviationChange,
    type EchoesDeviationImpact,
    type EchoesEntryPoint,
    type EchoesNovelSourceRef,
    type EchoesPlotDeviationState,
    type EchoesSpoilerMode,
    type EchoesCanonPolicy,
    type EchoesCrossoverValidation,
} from './echoesCrossoverTypes';

const ROLES: EchoesCrossoverRole[] = ['original_character', 'replace_character', 'observer'];
const KINDS: EchoesCrossoverKind[] = ['inspired', 'crossover'];
const POLICIES: EchoesCanonPolicy[] = ['free', 'guided', 'fixed'];
const SPOILER_MODES: EchoesSpoilerMode[] = ['none', 'hints', 'full'];
const IMPACTS: EchoesDeviationImpact[] = ['minor', 'moderate', 'major', 'critical'];
const EVENT_STATUSES: EchoesCanonEventStatus[] = ['upcoming', 'reached', 'altered', 'skipped'];

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const clean = (value: unknown, max = 4000): string => typeof value === 'string' ? value.trim().slice(0, max) : '';
const stringList = (value: unknown, maxItems = 100, maxLength = 500): string[] => {
    if (!Array.isArray(value)) return [];
    return value.map(item => clean(item, maxLength)).filter(Boolean).slice(0, maxItems);
};
const validEnum = <T extends string>(value: unknown, values: readonly T[], fallback: T): T => values.includes(value as T) ? value as T : fallback;

const defaultSource = (): EchoesNovelSourceRef => ({
    id: '',
    title: '',
    kind: 'unknown',
});

const defaultEntryPoint = (): EchoesEntryPoint => ({
    label: '原著开头',
    source: 'unknown',
});

const defaultKnowledge = (): EchoesCanonKnowledge => ({
    knowsFuturePlot: false,
    spoilerMode: 'none',
    knownEventIds: [],
    notes: [],
});

export interface EchoesCrossoverDraftInput {
    kind?: EchoesCrossoverKind;
    source?: Partial<EchoesNovelSourceRef>;
    role?: EchoesCrossoverRole;
    replacementCharacter?: string;
    entryPoint?: Partial<EchoesEntryPoint>;
    playerName?: string;
    playerIdentity?: string;
    playerGoal?: string;
    canonPolicy?: EchoesCanonPolicy;
    canonKnowledge?: Partial<EchoesCanonKnowledge>;
}

export interface EchoesCrossoverTimelineOptions {
    reachedChapterIndex?: number;
    currentEventId?: string;
    deviation?: Partial<EchoesPlotDeviationState>;
}

export interface EchoesCanonEventUpdate {
    status: EchoesCanonEventStatus;
    eventId: string;
}

export const normalizeNovelSourceRef = (value?: Partial<EchoesNovelSourceRef>): EchoesNovelSourceRef => {
    const raw = value || {};
    return {
        id: clean(raw.id, 200),
        title: clean(raw.title, 300),
        ...(clean(raw.author, 200) ? { author: clean(raw.author, 200) } : {}),
        ...(clean(raw.fileName, 300) ? { fileName: clean(raw.fileName, 300) } : {}),
        kind: validEnum(raw.kind, ['uploaded', 'named', 'described', 'unknown'] as const, 'unknown'),
        ...(raw.format === 'txt' || raw.format === 'epub' ? { format: raw.format } : {}),
        ...(clean(raw.parserVersion, 100) ? { parserVersion: clean(raw.parserVersion, 100) } : {}),
        ...(typeof raw.chapterCount === 'number' && Number.isFinite(raw.chapterCount) ? { chapterCount: Math.max(0, Math.floor(raw.chapterCount)) } : {}),
        ...(typeof raw.normalizedCharCount === 'number' && Number.isFinite(raw.normalizedCharCount) ? { normalizedCharCount: Math.max(0, Math.floor(raw.normalizedCharCount)) } : {}),
    };
};

export const createCrossoverConfigDraft = (input: EchoesCrossoverDraftInput = {}): EchoesCrossoverConfig => {
    const now = Date.now();
    const source = normalizeNovelSourceRef(input.source);
    const entryRaw = input.entryPoint || {};
    const knowledgeRaw = input.canonKnowledge || {};
    const role = validEnum(input.role, ROLES, 'original_character');
    return {
        schemaVersion: ECHOES_CROSSOVER_SCHEMA_VERSION,
        status: 'draft',
        kind: validEnum(input.kind, KINDS, 'crossover'),
        source,
        role,
        ...(clean(input.replacementCharacter, 200) ? { replacementCharacter: clean(input.replacementCharacter, 200) } : {}),
        entryPoint: {
            ...(clean(entryRaw.chapterId, 200) ? { chapterId: clean(entryRaw.chapterId, 200) } : {}),
            ...(typeof entryRaw.chapterIndex === 'number' && Number.isFinite(entryRaw.chapterIndex) ? { chapterIndex: Math.max(0, Math.floor(entryRaw.chapterIndex)) } : {}),
            label: clean(entryRaw.label, 300) || defaultEntryPoint().label,
            ...(clean(entryRaw.description, 1500) ? { description: clean(entryRaw.description, 1500) } : {}),
            source: validEnum(entryRaw.source, ['user', 'novel', 'ai', 'unknown'] as const, 'unknown'),
        },
        ...(clean(input.playerName, 200) ? { playerName: clean(input.playerName, 200) } : {}),
        playerIdentity: clean(input.playerIdentity, 4000),
        playerGoal: clean(input.playerGoal, 3000),
        canonPolicy: validEnum(input.canonPolicy, POLICIES, 'free'),
        canonKnowledge: {
            knowsFuturePlot: knowledgeRaw.knowsFuturePlot === true,
            spoilerMode: validEnum(knowledgeRaw.spoilerMode, SPOILER_MODES, 'none'),
            knownEventIds: stringList(knowledgeRaw.knownEventIds, 200, 200),
            notes: stringList(knowledgeRaw.notes, 50, 1000),
        },
        createdAt: now,
        updatedAt: now,
    };
};

export const validateCrossoverConfig = (config: unknown): EchoesCrossoverValidation => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!config || typeof config !== 'object' || Array.isArray(config)) return { valid: false, errors: ['穿书配置必须是对象'], warnings };
    const value = config as Partial<EchoesCrossoverConfig>;
    if (value.schemaVersion !== ECHOES_CROSSOVER_SCHEMA_VERSION) errors.push('不支持的穿书配置版本');
    if (!value.source || typeof value.source !== 'object' || !clean(value.source.title)) errors.push('缺少原著标题');
    if (!value.entryPoint || typeof value.entryPoint !== 'object' || !clean(value.entryPoint.label)) errors.push('缺少进入时间点');
    if (!value.playerIdentity || !clean(value.playerIdentity)) warnings.push('尚未填写玩家身份，进入世界后可能需要补充');
    if (!value.playerGoal || !clean(value.playerGoal)) warnings.push('尚未填写玩家目标，剧情会采用开放目标');
    if (!value.kind || !KINDS.includes(value.kind)) errors.push('无效的创建方式');
    if (!value.role || !ROLES.includes(value.role)) errors.push('无效的穿越身份');
    if (value.role === 'replace_character' && !clean(value.replacementCharacter)) errors.push('替换角色模式必须指定被替换角色');
    if (!value.canonPolicy || !POLICIES.includes(value.canonPolicy)) errors.push('无效的原著主线策略');
    if (!value.canonKnowledge || !SPOILER_MODES.includes(value.canonKnowledge.spoilerMode)) errors.push('无效的剧透设置');
    if (value.kind === 'inspired') warnings.push('这是参考原著创作模式，不会默认使用原著角色和原著事件');
    return { valid: errors.length === 0, errors, warnings };
};

export const createPlotDeviationState = (_events: EchoesCanonEvent[] = [], options: EchoesCrossoverTimelineOptions = {}): EchoesPlotDeviationState => ({
    level: typeof options.deviation?.level === 'number' ? clamp(options.deviation.level, 0, 100) : 0,
    majorChanges: stringList(options.deviation?.majorChanges, 100, 1000),
    records: Array.isArray(options.deviation?.records) ? options.deviation!.records.slice(-100) : [],
    alteredEventIds: stringList(options.deviation?.alteredEventIds, 100, 200),
    canReturnToCanon: options.deviation?.canReturnToCanon !== false,
    updatedAt: Date.now(),
});

export const createCrossoverTimelineState = (events: EchoesCanonEvent[] = [], options: EchoesCrossoverTimelineOptions = {}): EchoesCrossoverTimelineState => {
    const normalizedEvents = events.map(normalizeCanonEvent).sort((a, b) => {
        const ai = a.chapterIndex ?? Number.MAX_SAFE_INTEGER;
        const bi = b.chapterIndex ?? Number.MAX_SAFE_INTEGER;
        return ai - bi || a.id.localeCompare(b.id);
    });
    const reachedChapterIndex = typeof options.reachedChapterIndex === 'number' && Number.isFinite(options.reachedChapterIndex)
        ? Math.max(-1, Math.floor(options.reachedChapterIndex))
        : -1;
    return {
        currentEventId: clean(options.currentEventId, 200) || undefined,
        reachedChapterIndex,
        events: normalizedEvents,
        deviation: createPlotDeviationState(normalizedEvents, options),
    };
};

export const normalizeCanonEvent = (event: EchoesCanonEvent): EchoesCanonEvent => ({
    id: clean(event?.id, 200),
    title: clean(event?.title, 300),
    summary: clean(event?.summary, 3000),
    ...(typeof event?.chapterId === 'string' && clean(event.chapterId, 200) ? { chapterId: clean(event.chapterId, 200) } : {}),
    ...(typeof event?.chapterIndex === 'number' && Number.isFinite(event.chapterIndex) ? { chapterIndex: Math.max(0, Math.floor(event.chapterIndex)) } : {}),
    status: validEnum(event?.status, EVENT_STATUSES, 'upcoming'),
    source: event?.source === 'user' || event?.source === 'ai' ? event.source : 'novel',
    confidence: typeof event?.confidence === 'number' && Number.isFinite(event.confidence) ? clamp(event.confidence, 0, 1) : 0.5,
});

export const updateCanonEvent = (events: EchoesCanonEvent[], update: EchoesCanonEventUpdate): EchoesCanonEvent[] => {
    const status = validEnum(update.status, EVENT_STATUSES, 'upcoming');
    return events.map(event => event.id === update.eventId ? { ...normalizeCanonEvent(event), status } : normalizeCanonEvent(event));
};

export const getUpcomingCanonEvents = (events: EchoesCanonEvent[], limit = 5): EchoesCanonEvent[] => {
    const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 5;
    return events
        .map(normalizeCanonEvent)
        .filter(event => event.status === 'upcoming')
        .sort((a, b) => (a.chapterIndex ?? Number.MAX_SAFE_INTEGER) - (b.chapterIndex ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id))
        .slice(0, safeLimit);
};

const impactDefault: Record<EchoesDeviationImpact, number> = { minor: 5, moderate: 15, major: 30, critical: 50 };

export const applyDeviationChange = (state: EchoesPlotDeviationState, change: EchoesDeviationChange): EchoesPlotDeviationState => {
    const impact = change.impact && IMPACTS.includes(change.impact) ? change.impact : 'moderate';
    const amount = typeof change.amount === 'number' && Number.isFinite(change.amount) ? Math.abs(change.amount) : impactDefault[impact];
    const record: EchoesPlotDeviationState['records'][number] = {
        id: `deviation-${Date.now()}-${state.records.length + 1}`,
        ...(clean(change.eventId, 200) ? { eventId: clean(change.eventId, 200) } : {}),
        summary: clean(change.summary, 1500) || '剧情发生变化',
        impact,
        amount: clamp(amount, 0, 100),
        createdAt: Date.now(),
    };
    const alteredEventIds = change.eventId && !state.alteredEventIds.includes(change.eventId)
        ? [...state.alteredEventIds, change.eventId].slice(-100)
        : [...state.alteredEventIds];
    const majorChanges = impact === 'major' || impact === 'critical'
        ? [...state.majorChanges, record.summary].slice(-100)
        : [...state.majorChanges];
    const level = clamp(state.level + record.amount, 0, 100);
    return {
        ...state,
        level,
        majorChanges,
        alteredEventIds,
        records: [...state.records, record].slice(-100),
        canReturnToCanon: state.canReturnToCanon && level < 70,
        updatedAt: Date.now(),
    };
};

export const setCrossoverConfigConfirmed = (config: EchoesCrossoverConfig): EchoesCrossoverConfig => ({
    ...config,
    status: 'confirmed',
    updatedAt: Date.now(),
});

export const defaultCrossoverEntryPoint = defaultEntryPoint;
export const defaultCrossoverKnowledge = defaultKnowledge;
