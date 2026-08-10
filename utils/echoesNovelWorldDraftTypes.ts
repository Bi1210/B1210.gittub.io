import type { EchoesWritingGuide } from '../types';
import type { EchoesEntryPoint, EchoesNovelSourceRef } from './echoesCrossoverTypes';
import type {
    NovelAnalysis,
    NovelEvidenceBasis,
    NovelMechanicHint,
} from './echoesNovelAnalysisTypes';

export const ECHOES_NOVEL_WORLD_DRAFT_VERSION = 'echoes-novel-world-draft/1' as const;

export interface EchoesNovelFactSuggestion {
    id: string;
    text: string;
    confidence: number;
    basis: NovelEvidenceBasis;
    chapterId?: string;
    chapterIndex?: number;
    /** Analysis suggestions are never safe to lock without user confirmation. */
    requiresConfirmation: true;
}

export interface EchoesNovelWorldDraft {
    workflowVersion: typeof ECHOES_NOVEL_WORLD_DRAFT_VERSION;
    title: string;
    worldSetting: string;
    /** Deliberately empty until the player chooses an identity. */
    playerIdentity: string;
    /** Deliberately empty until the player chooses a goal. */
    playerGoal: string;
    cast: string;
    writingGuide: EchoesWritingGuide;
    formattingPreference: 'adaptive' | 'novel' | 'records' | 'technical';
    entryPoints: EchoesEntryPoint[];
    defaultEntryPoint: EchoesEntryPoint;
    source: EchoesNovelSourceRef;
    suggestedHardFacts: EchoesNovelFactSuggestion[];
    suggestedKnownFacts: EchoesNovelFactSuggestion[];
    mechanicHints: NovelMechanicHint[];
    contentWarnings: string[];
    analysisWarnings: string[];
}

export interface EchoesNovelWorldDraftOptions {
    source?: Partial<EchoesNovelSourceRef>;
    title?: string;
    maxCharacters?: number;
    maxFacts?: number;
    maxMechanics?: number;
    includeAnalysisWarnings?: boolean;
}

export type NovelWorldDraftAnalysis = Pick<
    NovelAnalysis,
    | 'title'
    | 'author'
    | 'sourceTitle'
    | 'sourceFileName'
    | 'sourceKind'
    | 'worldSummary'
    | 'era'
    | 'locations'
    | 'specificGenres'
    | 'themes'
    | 'tone'
    | 'writingStyle'
    | 'protagonist'
    | 'mainCharacters'
    | 'worldRules'
    | 'gameplaySignals'
    | 'mechanicHints'
    | 'plotPoints'
    | 'recommendedEntryPoints'
    | 'contentWarnings'
    | 'analysisWarnings'
>;
