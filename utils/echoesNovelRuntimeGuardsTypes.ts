import type {
    EchoesMechanicInstance,
    EchoesMechanicPatch,
} from './echoesMechanicsTypes';
import type { EchoesNovelProfile } from './echoesNovelProfileTypes';

export const ECHOES_NOVEL_RUNTIME_GUARDS_VERSION = 'echoes-novel-runtime-guards/1' as const;

export interface NovelHardFactRestriction {
    fact: string;
    ruleId?: string;
    reason: string;
}

export interface NovelHardFactGateResult {
    facts: string[];
    warnings: string[];
    restrictedFacts: NovelHardFactRestriction[];
    truncated: boolean;
}

export interface NovelMechanicPatchRestriction {
    operation: string;
    id?: string;
    kind?: string;
    reason: string;
}

export interface NovelMechanicPatchGateResult {
    patches: EchoesMechanicPatch[];
    warnings: string[];
    rejectedPatches: NovelMechanicPatchRestriction[];
    truncated: boolean;
}

export interface NovelRuntimeGateOptions {
    maxFacts?: number;
    maxFactChars?: number;
    maxPatches?: number;
    maxPatchIdChars?: number;
    maxWarnings?: number;
    maxWarningChars?: number;
    /** When false, only accepted analyzed rules may enter the result. */
    allowUnattributedFacts?: boolean;
}

export interface NovelRuntimeGuardProfileView {
    profile: EchoesNovelProfile | null | undefined;
    currentMechanics?: readonly EchoesMechanicInstance[] | null;
}
