import type { EchoesMechanicAction, EchoesMechanicInstance, EchoesMechanicPatch } from './echoesMechanicsTypes';
import type { EchoesNovelProfile } from './echoesNovelProfileTypes';

export const ECHOES_MECHANIC_ACTIONS_VERSION = 'echoes-mechanic-actions/1' as const;

/** UI sends only stable IDs; the effect is always read from the normalized action. */
export interface EchoesMechanicActionRequest {
    mechanicId: string;
    actionId: string;
}

export interface EchoesMechanicActionOptions {
    profile?: EchoesNovelProfile | null;
    now?: number;
}

export interface EchoesMechanicActionResult {
    version: typeof ECHOES_MECHANIC_ACTIONS_VERSION;
    accepted: boolean;
    changed: boolean;
    mechanics: EchoesMechanicInstance[];
    /** Deterministic local patch for replay/storage; never an arbitrary state patch. */
    patch?: EchoesMechanicPatch;
    request: EchoesMechanicActionRequest;
    mechanic?: EchoesMechanicInstance;
    action?: EchoesMechanicAction;
    /** Safe player-action text that can be sent to the normal Echoes turn loop. */
    actionText?: string;
    reason?: string;
}

/**
 * Canonical pre-turn result used by the future renderer and by EchoesApp.
 * It keeps local component effects separate from AI-produced patches so the
 * caller can decide how to render/replay the subsequent narrative turn.
 */
export interface EchoesMechanicActionPreparation {
    accepted: boolean;
    hadRequest: boolean;
    beforeMechanics: EchoesMechanicInstance[];
    mechanics: EchoesMechanicInstance[];
    localPatches: EchoesMechanicPatch[];
    request?: EchoesMechanicActionRequest;
    result?: EchoesMechanicActionResult;
    actionText?: string;
    reason?: string;
}
