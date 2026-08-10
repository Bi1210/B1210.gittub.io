import type {
    EchoesMechanicKind,
    EchoesMechanicTrigger,
} from './echoesMechanicsTypes';

export const ECHOES_NOVEL_ANALYSIS_SCHEMA_VERSION = 1 as const;
export type EchoesNovelAnalysisSchemaVersion = typeof ECHOES_NOVEL_ANALYSIS_SCHEMA_VERSION;

/** `unsupported` is a runtime fallback mechanic, not an analysis hint. */
export type RegisteredEchoesMechanicKind = Exclude<EchoesMechanicKind, 'unsupported'>;
export type NovelEvidenceBasis = 'source' | 'inference' | 'unknown';

export interface NovelEvidence {
    /** Short quote only. Never store a full chapter here. */
    quote: string;
    chapterId?: string;
    chapterIndex?: number;
    chapterTitle?: string;
    startOffset?: number;
    endOffset?: number;
    /** This is provenance, not user confirmation. */
    basis: NovelEvidenceBasis;
}

export interface NovelProtagonist {
    name: string;
    identity: string;
    personality: string[];
    goals: string[];
    abilities: string[];
    evidence: NovelEvidence[];
    confidence: number;
}

export interface NovelCharacter {
    id: string;
    name: string;
    identity: string;
    personality: string[];
    goals: string[];
    relationshipToProtagonist: string;
    isProtagonist: boolean;
    evidence: NovelEvidence[];
    confidence: number;
}

export interface NovelWorldRule {
    id: string;
    text: string;
    category: string;
    evidence: NovelEvidence[];
    confidence: number;
}

export interface NovelGameplaySignal {
    id: string;
    name: string;
    description: string;
    evidence: NovelEvidence[];
    confidence: number;
}

export interface NovelMechanicHint {
    kind: RegisteredEchoesMechanicKind;
    title: string;
    reason: string;
    trigger: EchoesMechanicTrigger;
    confidence: number;
}

export interface NovelUnsupportedMechanic {
    requestedKind: string;
    title: string;
    reason: string;
    confidence: number;
}

export interface NovelPlotPoint {
    id: string;
    chapterId?: string;
    chapterIndex?: number;
    chapterHint: string;
    title: string;
    summary: string;
    suitableForEntry: boolean;
    confidence: number;
    evidence: NovelEvidence[];
}

export interface NovelRecommendedEntryPoint {
    label: string;
    chapterId?: string;
    chapterIndex?: number;
    reason: string;
    suitableForCrossover: boolean;
    confidence: number;
}

export interface NovelAnalysis {
    schemaVersion: EchoesNovelAnalysisSchemaVersion;
    title: string;
    author: string;
    sourceKind: string;
    sourceTitle: string;
    sourceFileName: string;
    sourceChapterIds: string[];
    sourceChapterTitles: string[];
    /** Optional short note only; never a full novel excerpt. */
    sourceExcerpt: string;
    worldSummary: string;
    era: string;
    locations: string[];
    specificGenres: string[];
    themes: string[];
    tone: string;
    writingStyle: string;
    language: string;
    protagonist: NovelProtagonist | null;
    mainCharacters: NovelCharacter[];
    worldRules: NovelWorldRule[];
    gameplaySignals: NovelGameplaySignal[];
    mechanicHints: NovelMechanicHint[];
    unsupportedMechanics: NovelUnsupportedMechanic[];
    plotPoints: NovelPlotPoint[];
    recommendedEntryPoints: NovelRecommendedEntryPoint[];
    contentWarnings: string[];
    missingInformation: string[];
    analysisWarnings: string[];
    /** Deterministic unless supplied by the caller or source JSON. */
    createdAt: string;
}

export interface NovelAnalysisSourceOptions {
    sourceKind?: string;
    sourceTitle?: string;
    sourceFileName?: string;
    sourceChapterIds?: readonly string[];
    sourceChapterTitles?: readonly string[];
    title?: string;
    author?: string;
    createdAt?: string;
    /** A short source note only; it is capped and never stores full context. */
    sourceExcerpt?: string;
}

export interface NovelAnalysisPromptOptions extends NovelAnalysisSourceOptions {
    language?: string;
}

export interface NovelAnalysisFallbackOptions extends NovelAnalysisSourceOptions {
    warning?: string;
    missingInformation?: readonly string[];
}

export interface NovelAnalysisParseOptions extends NovelAnalysisFallbackOptions {
    /** Retained raw AI response limit; this is not novel source text. */
    rawTextMaxChars?: number;
}

export interface NovelAnalysisValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface NovelAnalysisParseResult {
    analysis: NovelAnalysis;
    /** Extracted response text, bounded by rawTextMaxChars. */
    rawText: string;
    /** True when JSON extraction failed or no usable object was supplied. */
    fallback: boolean;
    validation: NovelAnalysisValidationResult;
}

export type Protagonist = NovelProtagonist;
export type WorldRule = NovelWorldRule;
export type GameplaySignal = NovelGameplaySignal;
export type MechanicHint = NovelMechanicHint;
export type PlotPoint = NovelPlotPoint;
export type RecommendedEntryPoint = NovelRecommendedEntryPoint;
