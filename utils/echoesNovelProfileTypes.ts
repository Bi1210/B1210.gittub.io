import type { EchoesEntryPoint, EchoesNovelSourceRef } from './echoesCrossoverTypes';
import type {
    NovelAnalysis,
    NovelAnalysisParseResult,
    RegisteredEchoesMechanicKind,
} from './echoesNovelAnalysisTypes';

export const ECHOES_NOVEL_PROFILE_SCHEMA_VERSION = 1 as const;
export type EchoesNovelProfileSchemaVersion = typeof ECHOES_NOVEL_PROFILE_SCHEMA_VERSION;

/** Parser metadata that is safe to retain without retaining the source body. */
export interface EchoesNovelProfileDocumentRef {
    fileName?: string;
    format?: 'txt' | 'epub';
    parserVersion?: string;
    chapterCount?: number;
    normalizedCharCount?: number;
}

export interface EchoesNovelProfileOptions {
    source?: Partial<EchoesNovelSourceRef>;
    document?: EchoesNovelProfileDocumentRef;
    entryPoint?: Partial<EchoesEntryPoint>;
    acceptedFactIds?: readonly string[];
    /** Empty by default: analysis hints never activate mechanics automatically. */
    enabledMechanicKinds?: readonly string[];
    now?: number;
}

/** Structured novel metadata and analysis only; never contains normalizedText. */
export interface EchoesNovelProfile {
    /** Present only when imported profile data failed validation and is quarantined. */
    trustStatus?: 'quarantined';
    schemaVersion: EchoesNovelProfileSchemaVersion;
    source: EchoesNovelSourceRef;
    analysis: NovelAnalysis;
    entryPoint: EchoesEntryPoint;
    acceptedFactIds: string[];
    enabledMechanicKinds: RegisteredEchoesMechanicKind[];
    createdAt: number;
    updatedAt: number;
}

export interface EchoesNovelProfileValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface EchoesNovelProfileNormalizationResult {
    profile: EchoesNovelProfile;
    analysisParseResult: NovelAnalysisParseResult;
    warnings: string[];
}

export type EchoesNovelProfileInput = Partial<EchoesNovelProfile> & {
    analysis?: unknown;
    source?: Partial<EchoesNovelSourceRef>;
    entryPoint?: Partial<EchoesEntryPoint>;
};
