export const ECHOES_CROSSOVER_SCHEMA_VERSION = 1 as const;

export type EchoesNovelSourceKind = 'uploaded' | 'named' | 'described' | 'unknown';
export type EchoesCrossoverKind = 'inspired' | 'crossover';
export type EchoesCrossoverRole = 'original_character' | 'replace_character' | 'observer';
export type EchoesCanonPolicy = 'free' | 'guided' | 'fixed';
export type EchoesSpoilerMode = 'none' | 'hints' | 'full';
export type EchoesCanonEventStatus = 'upcoming' | 'reached' | 'altered' | 'skipped';
export type EchoesDeviationImpact = 'minor' | 'moderate' | 'major' | 'critical';

/** 只保存原著元数据和定位信息，不把整本小说正文复制进世界配置。 */
export interface EchoesNovelSourceRef {
    id: string;
    title: string;
    author?: string;
    fileName?: string;
    kind: EchoesNovelSourceKind;
    format?: 'txt' | 'epub';
    parserVersion?: string;
    chapterCount?: number;
    normalizedCharCount?: number;
}

export interface EchoesEntryPoint {
    chapterId?: string;
    chapterIndex?: number;
    label: string;
    description?: string;
    source: 'user' | 'novel' | 'ai' | 'unknown';
}

export interface EchoesCanonKnowledge {
    knowsFuturePlot: boolean;
    spoilerMode: EchoesSpoilerMode;
    knownEventIds: string[];
    notes: string[];
}

/** 创建穿书/参考原著世界时的可确认配置。 */
export interface EchoesCrossoverConfig {
    schemaVersion: 1;
    status: 'draft' | 'confirmed';
    kind: EchoesCrossoverKind;
    source: EchoesNovelSourceRef;
    role: EchoesCrossoverRole;
    replacementCharacter?: string;
    entryPoint: EchoesEntryPoint;
    playerName?: string;
    playerIdentity: string;
    playerGoal: string;
    canonPolicy: EchoesCanonPolicy;
    canonKnowledge: EchoesCanonKnowledge;
    createdAt: number;
    updatedAt: number;
}

export interface EchoesCanonEvent {
    id: string;
    title: string;
    summary: string;
    chapterId?: string;
    chapterIndex?: number;
    status: EchoesCanonEventStatus;
    source: 'novel' | 'user' | 'ai';
    confidence: number;
}

export interface EchoesDeviationRecord {
    id: string;
    eventId?: string;
    summary: string;
    impact: EchoesDeviationImpact;
    amount: number;
    createdAt: number;
}

export interface EchoesPlotDeviationState {
    level: number;
    majorChanges: string[];
    records: EchoesDeviationRecord[];
    alteredEventIds: string[];
    canReturnToCanon: boolean;
    updatedAt: number;
}

export interface EchoesCrossoverTimelineState {
    currentEventId?: string;
    reachedChapterIndex: number;
    events: EchoesCanonEvent[];
    deviation: EchoesPlotDeviationState;
}

export interface EchoesCrossoverValidation {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface EchoesDeviationChange {
    eventId?: string;
    summary: string;
    impact?: EchoesDeviationImpact;
    amount?: number;
}
