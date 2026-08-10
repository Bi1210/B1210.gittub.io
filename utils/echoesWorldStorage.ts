import { applyMechanicPatches } from './echoesMechanics';
import type { EchoesMechanicInstance } from './echoesMechanicsTypes';
import { applyEchoesMechanicAction, normalizeEchoesMechanicActionRequest } from './echoesMechanicActions';
import {
    filterNovelHardFactsToLock,
    filterNovelMechanicPatches,
    getNovelRuntimeProfileState,
    sanitizeNovelMechanicSnapshot,
} from './echoesNovelRuntimeGuards';
import { createEchoesNovelProfile, normalizeEchoesNovelProfile, validateEchoesNovelProfile } from './echoesNovelProfile';
import type { EchoesNovelProfile } from './echoesNovelProfileTypes';
import type { EchoesWorld } from '../types';

const FORBIDDEN_WORLD_KEYS = new Set([
    'parsednovel', 'normalizedtext', 'rawtext', 'rawresponse', 'fulltext',
    'noveldocument', 'novelrawtext', 'normalizednoveltext', 'sourcefulltext',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stripForbiddenWorldValue(value: unknown, depth = 0, budget = { left: 100_000 }, seen = new Set<object>()): unknown {
    if (value === null || value === undefined || typeof value !== 'object') return value;
    if (depth > 12 || budget.left <= 0) return undefined;
    if (seen.has(value as object)) return undefined;
    seen.add(value as object);
    budget.left -= 1;
    let result: unknown;
    if (Array.isArray(value)) {
        result = value.map(item => stripForbiddenWorldValue(item, depth + 1, budget, seen)).filter(item => item !== undefined);
    } else {
        result = Object.fromEntries(Object.entries(value as Record<string, unknown>)
            .filter(([key]) => !FORBIDDEN_WORLD_KEYS.has(key.toLowerCase()))
            .map(([key, item]) => [key, stripForbiddenWorldValue(item, depth + 1, budget, seen)])
            .filter(([, item]) => item !== undefined));
    }
    // Track only the current recursion path, not every object ever visited.
    // Shared references (e.g. world.mechanics and initialMechanics pointing
    // at the same immutable snapshot) are valid and must not be stripped as
    // if they were cycles; actual ancestor cycles are still fail-closed.
    seen.delete(value as object);
    return result;
}

function stripForbiddenWorldKeys(value: Record<string, unknown>): Record<string, unknown> {
    return (stripForbiddenWorldValue(value) as Record<string, unknown>) || {};
}

function hasRequiredProfileShape(value: unknown): value is Record<string, unknown> {
    if (!isRecord(value)) return false;
    return value.schemaVersion === 1
        && isRecord(value.source)
        && isRecord(value.analysis)
        && isRecord(value.entryPoint)
        && Array.isArray(value.acceptedFactIds)
        && Array.isArray(value.enabledMechanicKinds)
        && typeof value.createdAt === 'number'
        && Number.isSafeInteger(value.createdAt)
        && typeof value.updatedAt === 'number'
        && Number.isSafeInteger(value.updatedAt);
}

function quarantinedProfile(now = Date.now()): EchoesNovelProfile {
    return {
        ...createEchoesNovelProfile({}, { now }).profile,
        trustStatus: 'quarantined',
    };
}

function boundedFactList(
    raw: unknown,
    profile: EchoesNovelProfile | null | undefined,
    allowUnattributedFacts: boolean,
): string[] {
    return filterNovelHardFactsToLock(raw, profile, { allowUnattributedFacts }).facts;
}

function boundedMechanicList(
    raw: unknown,
    profile: EchoesNovelProfile | null | undefined,
    fallback: readonly EchoesMechanicInstance[] = [],
    now = Date.now(),
): EchoesMechanicInstance[] {
    return sanitizeNovelMechanicSnapshot(raw, profile, fallback, now);
}

/**
 * Rebuild the persisted ledgers through the same gate used by runtime replay.
 * This is deliberately done before every DB/backup write so raw imported
 * snapshots cannot survive in storage and later become trusted state.
 */
function sanitizeEchoesLedgers(
    world: Record<string, unknown>,
    profile: EchoesNovelProfile | null | undefined,
): Record<string, unknown> {
    const state = getNovelRuntimeProfileState(profile);
    const allowUnattributedFacts = state === 'none';
    const rawTurns = Array.isArray(world.turns) ? world.turns.slice(-500) : [];
    const firstRawTurn = isRecord(rawTurns[0]) ? rawTurns[0] : undefined;
    const hasHardFactLedger = rawTurns.some(turn => isRecord(turn)
        && (turn.hardFactsRecorded === true || Array.isArray(turn.hardFactsToLock) || Array.isArray(turn.afterHardFacts)));
    const hasMechanicLedger = rawTurns.some(turn => isRecord(turn) && Array.isArray(turn.mechanicPatches));
    const preserveLegacyFacts = state === 'none' && !hasHardFactLedger;
    const preserveLegacyMechanics = state === 'none' && !hasMechanicLedger;
    const rawInitialFacts = Array.isArray(world.initialHardFacts)
        ? world.initialHardFacts
        : (Array.isArray(firstRawTurn?.beforeHardFacts) && !preserveLegacyFacts
            ? firstRawTurn.beforeHardFacts
            : (preserveLegacyFacts || !rawTurns.length ? (Array.isArray(world.hardFacts) ? world.hardFacts : []) : []));
    const initialHardFacts = boundedFactList(rawInitialFacts, profile, allowUnattributedFacts);
    const rawInitialMechanics = Array.isArray(world.initialMechanics)
        ? world.initialMechanics
        : (Array.isArray(firstRawTurn?.beforeMechanics) && !preserveLegacyMechanics
            ? firstRawTurn.beforeMechanics
            : (preserveLegacyMechanics || !rawTurns.length ? (Array.isArray(world.mechanics) ? world.mechanics : []) : []));
    const initialMechanics = state === 'invalid'
        ? []
        : boundedMechanicList(undefined, profile, rawInitialMechanics as EchoesMechanicInstance[]);

    let cursorFacts = initialHardFacts;
    let cursorMechanics = initialMechanics;
    const sanitizedTurns = rawTurns.map((raw, index) => {
        const source = isRecord(raw) ? (stripForbiddenWorldValue(raw) as Record<string, unknown>) : {};
        const {
            action: rawAction,
            playerAction: rawPlayerAction,
            mechanicAction: rawMechanicAction,
            ...sourceWithoutActionFields
        } = source;
        const normalizedMechanicAction = normalizeEchoesMechanicActionRequest(rawMechanicAction);
        const safeAction = typeof rawAction === 'string' ? rawAction.trim().slice(0, 2_000) : '';
        const safePlayerAction = typeof rawPlayerAction === 'string' ? rawPlayerAction.trim().slice(0, 2_000) : '';
        const createdAt = typeof source.createdAt === 'number' ? source.createdAt : Date.now() + index;
        const beforeFactsInput = state === 'none' && Array.isArray(source.beforeHardFacts)
            ? source.beforeHardFacts
            : cursorFacts;
        const beforeHardFacts = boundedFactList(beforeFactsInput, profile, allowUnattributedFacts);
        const gatedFacts = boundedFactList(source.hardFactsToLock, profile, allowUnattributedFacts);
        const rawAfterFacts = Array.isArray(source.afterHardFacts) ? source.afterHardFacts : undefined;
        const afterHardFacts = state === 'none' && rawAfterFacts
            ? boundedFactList(rawAfterFacts, profile, true)
            : Array.from(new Set([...beforeHardFacts, ...gatedFacts])).slice(-200);

        const beforeMechanicsInput = state === 'none' && Array.isArray(source.beforeMechanics)
            ? source.beforeMechanics
            : cursorMechanics;
        const beforeMechanics = state === 'invalid'
            ? []
            : boundedMechanicList(beforeMechanicsInput, profile, cursorMechanics, createdAt);
        const mechanicActionResult = normalizedMechanicAction
            ? applyEchoesMechanicAction(beforeMechanics, normalizedMechanicAction, { profile, now: createdAt })
            : undefined;
        const localPatch = mechanicActionResult?.accepted && mechanicActionResult.patch
            ? [mechanicActionResult.patch]
            : [];
        const localBaseMechanics = applyMechanicPatches(beforeMechanics, localPatch, createdAt);
        // Gate AI patches against the local post-click cursor, then replay the
        // local patch last so storage matches EchoesApp and the player's action
        // cannot be undone by an AI upsert.
        const patchGate = filterNovelMechanicPatches(source.mechanicPatches, profile, localBaseMechanics);
        const afterAiMechanics = applyMechanicPatches(localBaseMechanics, patchGate.patches, createdAt);
        const computedAfterMechanics = applyMechanicPatches(afterAiMechanics, localPatch, createdAt);
        const rawAfterMechanics = Array.isArray(source.afterMechanics) ? source.afterMechanics : undefined;
        const afterMechanics = normalizedMechanicAction
            ? computedAfterMechanics
            : (state === 'none' && rawAfterMechanics
                ? boundedMechanicList(rawAfterMechanics, profile, computedAfterMechanics, createdAt)
                : computedAfterMechanics);
        const mechanicActionMatchesAfter = !!mechanicActionResult?.accepted && (
            !mechanicActionResult.changed
            || (!!mechanicActionResult.mechanic && afterMechanics.some(item => {
                if (item.id !== mechanicActionResult.mechanic?.id) return false;
                const actual = { ...item, updatedAt: 0 };
                const expected = { ...mechanicActionResult.mechanic, updatedAt: 0 };
                return JSON.stringify(actual) === JSON.stringify(expected);
            }))
        );

        const sanitizedTurn = {
            ...sourceWithoutActionFields,
            ...(safeAction ? { action: safeAction } : {}),
            ...(safePlayerAction ? { playerAction: safePlayerAction } : {}),
            ...(mechanicActionMatchesAfter && normalizedMechanicAction ? { mechanicAction: normalizedMechanicAction } : {}),
            beforeHardFacts,
            hardFactsToLock: gatedFacts,
            hardFactsRecorded: true as const,
            afterHardFacts,
            mechanicPatches: patchGate.patches,
            beforeMechanics,
            afterMechanics,
            createdAt,
        };
        cursorFacts = afterHardFacts;
        cursorMechanics = afterMechanics;
        return sanitizedTurn;
    });

    return {
        ...world,
        initialHardFacts,
        hardFacts: sanitizedTurns.length ? cursorFacts : boundedFactList(world.hardFacts, profile, allowUnattributedFacts),
        initialMechanics,
        mechanics: sanitizedTurns.length ? cursorMechanics : (state === 'invalid' ? [] : boundedMechanicList(world.mechanics, profile, initialMechanics)),
        turns: sanitizedTurns,
    };
}

/**
 * Removes raw novel material from an Echoes world. Missing novelProfile keeps
 * old saves compatible; an explicitly malformed profile is retained only as a
 * quarantined, fail-closed marker so it cannot silently become legacy mode.
 */
export function sanitizeEchoesWorldForStorage<T>(raw: T): T {
    if (!isRecord(raw)) return raw;
    const { novelProfile: rawProfile, ...withoutProfile } = raw;
    const safeWorld = stripForbiddenWorldKeys(withoutProfile);
    if (rawProfile === undefined) {
        return sanitizeEchoesLedgers(safeWorld, undefined) as T;
    }
    if (rawProfile === null) {
        const profile = quarantinedProfile();
        return { ...sanitizeEchoesLedgers(safeWorld, profile), novelProfile: profile } as T;
    }
    try {
        const rawValidation = validateEchoesNovelProfile(rawProfile);
        const onlyForbiddenFieldError = rawValidation.errors.length > 0
            && rawValidation.errors.every(error => error.includes('不能包含 normalizedText'));
        if (!hasRequiredProfileShape(rawProfile)
            || (!rawValidation.valid && !onlyForbiddenFieldError)) {
            const profile = quarantinedProfile();
            return { ...sanitizeEchoesLedgers(safeWorld, profile), novelProfile: profile } as T;
        }
        const normalized = normalizeEchoesNovelProfile(rawProfile as any);
        const profile = rawProfile.trustStatus === 'quarantined'
            ? { ...normalized.profile, trustStatus: 'quarantined' as const }
            : normalized.profile;
        if (!validateEchoesNovelProfile(profile).valid) {
            const quarantined = quarantinedProfile();
            return { ...sanitizeEchoesLedgers(safeWorld, quarantined), novelProfile: quarantined } as T;
        }
        return { ...sanitizeEchoesLedgers(safeWorld, profile), novelProfile: profile } as T;
    } catch {
        const profile = quarantinedProfile();
        return { ...sanitizeEchoesLedgers(safeWorld, profile), novelProfile: profile } as T;
    }
}

export function sanitizeEchoesWorldListForStorage<T>(raw: unknown): T[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((world) => sanitizeEchoesWorldForStorage(world) as T);
}

export function getStoredNovelProfile(raw: unknown): EchoesNovelProfile | undefined {
    if (!isRecord(raw) || !isRecord(raw.novelProfile)) return undefined;
    const sanitized = sanitizeEchoesWorldForStorage(raw);
    if (!isRecord(sanitized) || !isRecord(sanitized.novelProfile)) return undefined;
    return sanitized.novelProfile as EchoesNovelProfile;
}
