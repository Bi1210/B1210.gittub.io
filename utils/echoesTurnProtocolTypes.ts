import type { EchoesContentBlock, EchoesDirectorState, EchoesFormat, EchoesState } from '../types';
import type { EchoesMechanicPatch } from './echoesMechanicsTypes';

export type EchoesEndingType = 'BE' | 'NE' | 'HE' | 'TE' | 'SE';
export type EchoesChapterStatus = 'current' | 'completed' | 'locked';

export interface EchoesChoice {
    id: string;
    label: string;
    description?: string;
    preview?: string;
    disabled: boolean;
    disabledReason?: string;
}

export interface EchoesChapterUpdate {
    id?: string;
    title: string;
    summary?: string;
    status: EchoesChapterStatus;
}

export interface EchoesEndingTrigger {
    id?: string;
    title: string;
    type: EchoesEndingType;
    epilogue?: string;
    achievements: string[];
}

export interface EchoesTurnOutput {
    chapter: string;
    mood?: string;
    blocks: EchoesContentBlock[];
    choices: EchoesChoice[];
    suggestions: string[];
    statePatch: Partial<EchoesState>;
    directorPatch: Partial<EchoesDirectorState>;
    newKnownFacts: string[];
    hardFactsToLock: string[];
    continuitySummary: string;
    mechanicPatches: EchoesMechanicPatch[];
    chapterUpdate?: EchoesChapterUpdate;
    endingTriggered?: EchoesEndingTrigger;
}

export interface EchoesTurnParseResult {
    output: EchoesTurnOutput;
    validJson: boolean;
    usedFallback: boolean;
    warnings: string[];
    rawText: string;
}

export interface EchoesTurnParserOptions {
    allowedFormats?: readonly EchoesFormat[];
    fallbackText?: string;
    maxBlocks?: number;
    maxChoices?: number;
    maxFacts?: number;
    maxMechanicPatches?: number;
}
