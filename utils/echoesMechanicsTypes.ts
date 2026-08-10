export const ECHOES_MECHANICS_SCHEMA_VERSION = 1 as const;

export type EchoesMechanicSource = 'user' | 'ai' | 'system';
export type EchoesMechanicTrigger = 'manual' | 'scene' | 'chapter_start' | 'chapter_end' | 'choice' | 'event' | 'always';
export type EchoesMechanicStatus = 'active' | 'hidden' | 'completed' | 'failed' | 'disabled';

/**
 * 组件库的 ID 是稳定协议，不绑定某一种世界观。
 * 例如 trending_board 可以叫热搜榜、悬赏榜、天骄榜，具体标题由世界配置决定。
 */
export type EchoesMechanicKind =
    | 'danmaku_stream'
    | 'trending_board'
    | 'live_room'
    | 'scenario_picker'
    | 'rules_panel'
    | 'task_panel'
    | 'countdown'
    | 'inventory_grid'
    | 'leaderboard'
    | 'relationship_matrix'
    | 'schedule_board'
    | 'script_preview'
    | 'evidence_board'
    | 'resource_panel'
    | 'event_card'
    | 'generic_panel'
    | 'cast_roster'
    | 'lore_codex'
    | 'unsupported';

export type EchoesDanmakuTone = 'supportive' | 'critical' | 'neutral' | 'shipping' | 'hostile' | 'rumor' | 'unknown';
export type EchoesRankChange = number | 'new' | 'same';
export type EchoesScenarioStatus = 'available' | 'selected' | 'locked' | 'completed' | 'failed';
export type EchoesTaskStatus = 'available' | 'active' | 'completed' | 'failed' | 'locked';
export type EchoesRuleCategory = 'must' | 'must_not' | 'conditional' | 'unknown';

export type EchoesMechanicActionEffect =
    | { type: 'set_status'; status: Exclude<EchoesMechanicStatus, 'disabled'>; targetMechanicId?: string }
    | { type: 'scenario_select'; optionId: string; targetMechanicId?: string }
    | { type: 'task_update'; taskId: string; status?: EchoesTaskStatus; progress?: number; targetMechanicId?: string }
    | { type: 'inventory_update'; itemId: string; quantity?: number; equipped?: boolean; targetMechanicId?: string };

export interface EchoesMechanicAction {
    id: string;
    label: string;
    disabled?: boolean;
    disabledReason?: string;
    /** 只允许 JSON 原始值，不能携带函数、HTML 或任意代码。 */
    payload?: Record<string, string | number | boolean | null>;
    /** 可选的、白名单化的本地状态效果；未声明效果的动作交给 AI 叙事处理。 */
    effect?: EchoesMechanicActionEffect;
}

export interface EchoesDanmakuItem {
    id: string;
    text: string;
    tone: EchoesDanmakuTone;
    author?: string;
    intensity: number;
    visible: boolean;
}

export interface EchoesTrendingEntry {
    id: string;
    topic: string;
    rank: number;
    rankChange: EchoesRankChange;
    heat: number;
    summary?: string;
    relatedToPlayer: boolean;
}

export interface EchoesScenarioOption {
    id: string;
    title: string;
    description: string;
    hint?: string;
    danger?: string;
    status: EchoesScenarioStatus;
    lockedReason?: string;
    selected: boolean;
}

export interface EchoesRuleEntry {
    id: string;
    text: string;
    category: EchoesRuleCategory;
    known: boolean;
    severity: number;
}

export interface EchoesTaskEntry {
    id: string;
    title: string;
    description: string;
    status: EchoesTaskStatus;
    progress: number;
    objective?: string;
    reward?: string;
}

export interface EchoesCountdownData {
    label: string;
    current?: number;
    total?: number;
    endsAt?: number;
    unit: string;
    urgent: boolean;
}

export interface EchoesLiveRoomData {
    roomTitle: string;
    viewerCount: number;
    online: boolean;
    hostName?: string;
    gifts?: Array<{ id: string; name: string; count: number }>;
}

export interface EchoesInventoryItem {
    id: string;
    name: string;
    description?: string;
    quantity: number;
    equipped: boolean;
    tags: string[];
}

export interface EchoesLeaderboardEntry {
    id: string;
    name: string;
    score: number;
    rank: number;
    isPlayer: boolean;
    trend: EchoesRankChange;
}

export interface EchoesRelationshipEntry {
    id: string;
    name: string;
    status: string;
    trust: number;
    affection: number;
    tags: string[];
}

export interface EchoesScheduleEntry {
    id: string;
    title: string;
    time: string;
    location?: string;
    status: 'upcoming' | 'active' | 'done' | 'cancelled';
    importance: number;
}

export interface EchoesScriptPreviewData {
    title: string;
    role?: string;
    scene?: string;
    lines: string[];
    notes: string[];
}

export interface EchoesEvidenceEntry {
    id: string;
    title: string;
    description: string;
    category: 'evidence' | 'testimony' | 'document' | 'object' | 'unknown';
    importance: number;
    connectedIds: string[];
}

export interface EchoesResourceEntry {
    id: string;
    name: string;
    amount: number;
    max?: number;
    unit?: string;
    warningAt?: number;
}

export interface EchoesEventCardData {
    title: string;
    body: string;
    severity: 'info' | 'notice' | 'warning' | 'critical';
    choices: EchoesMechanicAction[];
}

export interface EchoesGenericPanelData {
    fields: Array<{ id: string; label: string; value: string | number | boolean | null; display: 'text' | 'number' | 'boolean' | 'tag' }>;
}

export interface EchoesUnsupportedMechanicData {
    requestedKind: string;
    reason: string;
    summary: string;
}

/**
 * 人物档案是"一个角色一个 mechanic 实例"，AI 通过 upsert/remove patch 精确增删单个角色，
 * 不再靠正则猜测自由文本段落边界。label/value、heading/body 均由 AI 自由命名，
 * 不预设任何具体世界观的字段名（如"错误值"），保持世界观无关。
 */
export interface EchoesCastFieldEntry {
    /** 简短属性标签，例如"年龄""身份""阵营"；由 AI 按该世界的档案习惯自行命名。 */
    label: string;
    value: string;
}

export interface EchoesCastSection {
    /** 较长的小传/分段标题，例如"背景""进入前""进入后"；不预设固定分段集合。 */
    heading: string;
    body: string;
}

export interface EchoesCastCharacterData {
    name: string;
    /** 称号/别名，可选。 */
    aliasTitle?: string;
    /** 一句话身份定位。 */
    role?: string;
    isPlayer: boolean;
    fields: EchoesCastFieldEntry[];
    sections: EchoesCastSection[];
    tags: string[];
}

export type EchoesLoreCategory = 'place' | 'faction' | 'timeline' | 'concept' | 'item' | 'other';

/**
 * 世界志条目同样是"一条一个 mechanic 实例"；category 由 AI 自行判断，
 * 不用关键词规则猜测分类。
 */
export interface EchoesLoreEntryData {
    term: string;
    category: EchoesLoreCategory;
    summary: string;
    details?: string;
    tags: string[];
}

export type EchoesMechanicData =
    | { kind: 'danmaku_stream'; items: EchoesDanmakuItem[] }
    | { kind: 'trending_board'; entries: EchoesTrendingEntry[] }
    | { kind: 'live_room'; data: EchoesLiveRoomData }
    | { kind: 'scenario_picker'; options: EchoesScenarioOption[]; allowAutoSelect: boolean }
    | { kind: 'rules_panel'; rules: EchoesRuleEntry[] }
    | { kind: 'task_panel'; tasks: EchoesTaskEntry[] }
    | { kind: 'countdown'; data: EchoesCountdownData }
    | { kind: 'inventory_grid'; items: EchoesInventoryItem[] }
    | { kind: 'leaderboard'; entries: EchoesLeaderboardEntry[] }
    | { kind: 'relationship_matrix'; entries: EchoesRelationshipEntry[] }
    | { kind: 'schedule_board'; entries: EchoesScheduleEntry[] }
    | { kind: 'script_preview'; data: EchoesScriptPreviewData }
    | { kind: 'evidence_board'; entries: EchoesEvidenceEntry[] }
    | { kind: 'resource_panel'; entries: EchoesResourceEntry[] }
    | { kind: 'cast_roster'; character: EchoesCastCharacterData }
    | { kind: 'lore_codex'; entry: EchoesLoreEntryData }
    | { kind: 'event_card'; data: EchoesEventCardData }
    | { kind: 'generic_panel'; data: EchoesGenericPanelData }
    | { kind: 'unsupported'; data: EchoesUnsupportedMechanicData };

export interface EchoesMechanicInstance {
    schemaVersion: 1;
    id: string;
    kind: EchoesMechanicKind;
    /** AI 提供的世界内名称，例如“娱乐热搜”“本周悬赏榜”。 */
    title: string;
    description?: string;
    trigger: EchoesMechanicTrigger;
    status: EchoesMechanicStatus;
    source: EchoesMechanicSource;
    data: EchoesMechanicData;
    actions: EchoesMechanicAction[];
    updatedAt: number;
}

export interface EchoesMechanicPatch {
    op: 'upsert' | 'remove' | 'clear';
    id?: string;
    mechanic?: Partial<EchoesMechanicInstance> & { id: string; kind: string };
}

export interface EchoesMechanicNormalizationResult {
    mechanics: EchoesMechanicInstance[];
    unsupported: EchoesMechanicInstance[];
}
