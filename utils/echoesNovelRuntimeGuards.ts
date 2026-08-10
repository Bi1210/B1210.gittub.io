import { ALWAYS_ENABLED_MECHANIC_KINDS, getMechanicDefinition, isRegisteredMechanicKind, normalizeMechanic } from './echoesMechanics';
import type {
    EchoesMechanicInstance,
    EchoesMechanicPatch,
} from './echoesMechanicsTypes';
import type {
    NovelAnalysis,
    NovelWorldRule,
} from './echoesNovelAnalysisTypes';
import { validateEchoesNovelProfile } from './echoesNovelProfile';
import type { EchoesNovelProfile } from './echoesNovelProfileTypes';
import {
    type NovelHardFactGateResult,
    type NovelHardFactRestriction,
    type NovelMechanicPatchGateResult,
    type NovelMechanicPatchRestriction,
    type NovelRuntimeGateOptions,
} from './echoesNovelRuntimeGuardsTypes';

const DEFAULT_MAX_FACTS = 200;
const DEFAULT_MAX_FACT_CHARS = 1_000;
const DEFAULT_MAX_PATCHES = 20;
const DEFAULT_MAX_PATCH_ID_CHARS = 160;
const DEFAULT_MAX_WARNINGS = 100;
const DEFAULT_MAX_WARNING_CHARS = 500;
const MAX_PATCH_PAYLOAD_CHARS = 20_000;
const FORBIDDEN_KEY_PATTERN = /(?:normalizedText|rawText|rawResponse|fullText)/i;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, maxChars: number): string {
    return typeof value === 'string' ? value.trim().slice(0, maxChars) : '';
}

function safeNonNegativeInteger(value: number | undefined, fallback: number, maximum: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(maximum, Math.floor(value)));
}

function cleanWarnings(values: readonly string[], options: Required<NovelRuntimeGateOptions>): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        const item = text(value, options.maxWarningChars);
        if (!item || seen.has(item)) continue;
        seen.add(item);
        result.push(item);
        if (result.length >= options.maxWarnings) break;
    }
    return result;
}

function gateOptions(options: NovelRuntimeGateOptions = {}): Required<NovelRuntimeGateOptions> {
    return {
        maxFacts: safeNonNegativeInteger(options.maxFacts, DEFAULT_MAX_FACTS, DEFAULT_MAX_FACTS),
        maxFactChars: safeNonNegativeInteger(options.maxFactChars, DEFAULT_MAX_FACT_CHARS, DEFAULT_MAX_FACT_CHARS),
        maxPatches: safeNonNegativeInteger(options.maxPatches, DEFAULT_MAX_PATCHES, DEFAULT_MAX_PATCHES),
        maxPatchIdChars: safeNonNegativeInteger(options.maxPatchIdChars, DEFAULT_MAX_PATCH_ID_CHARS, DEFAULT_MAX_PATCH_ID_CHARS),
        maxWarnings: safeNonNegativeInteger(options.maxWarnings, DEFAULT_MAX_WARNINGS, DEFAULT_MAX_WARNINGS),
        maxWarningChars: safeNonNegativeInteger(options.maxWarningChars, DEFAULT_MAX_WARNING_CHARS, DEFAULT_MAX_WARNING_CHARS),
        allowUnattributedFacts: options.allowUnattributedFacts !== false,
    };
}

function hasForbiddenKey(value: unknown, depth = 0, budget = { left: 600 }, seen = new Set<object>()): boolean {
    if (budget.left <= 0 || depth > 6 || value === null || value === undefined) return false;
    if (typeof value === 'string') return FORBIDDEN_KEY_PATTERN.test(value);
    if (typeof value !== 'object') return false;
    if (seen.has(value as object)) return false;
    seen.add(value as object);
    budget.left -= 1;
    if (Array.isArray(value)) return value.some((item) => hasForbiddenKey(item, depth + 1, budget, seen));
    return Object.entries(value as UnknownRecord).some(([key, entryValue]) =>
        FORBIDDEN_KEY_PATTERN.test(key) || hasForbiddenKey(entryValue, depth + 1, budget, seen),
    );
}

export type NovelRuntimeProfileState = 'none' | 'valid' | 'invalid';

function profileState(profile: EchoesNovelProfile | null | undefined): NovelRuntimeProfileState {
    if (profile === undefined) return 'none';
    if (profile === null || profile.trustStatus === 'quarantined') return 'invalid';
    try {
        return validateEchoesNovelProfile(profile).valid ? 'valid' : 'invalid';
    } catch {
        return 'invalid';
    }
}

export const getNovelRuntimeProfileState = profileState;

function analysisOf(profile: EchoesNovelProfile): NovelAnalysis | null {
    return isRecord(profile.analysis) ? profile.analysis as NovelAnalysis : null;
}

function ruleIds(profile: EchoesNovelProfile): Set<string> {
    const ids = new Set<string>();
    for (const id of profile.acceptedFactIds) {
        const value = text(id, DEFAULT_MAX_PATCH_ID_CHARS);
        if (value) ids.add(value);
    }
    const analysis = analysisOf(profile);
    for (const rule of analysis?.worldRules ?? []) {
        const id = text(rule.id, DEFAULT_MAX_PATCH_ID_CHARS);
        if (id && profile.acceptedFactIds.some((accepted) => accepted === id || accepted === `world-rule-${id}`)) {
            ids.add(id);
            ids.add(`world-rule-${id}`);
        }
    }
    return ids;
}

function findRulesForFact(profile: EchoesNovelProfile, fact: string): NovelWorldRule[] {
    const analysis = analysisOf(profile);
    if (!analysis) return [];
    const normalizedFact = fact.trim();
    return analysis.worldRules.filter((rule) => {
        const ruleText = text(rule.text, DEFAULT_MAX_FACT_CHARS);
        // Exact match is safest. A longer generated sentence may wrap one
        // complete rule, but a short fragment must not claim canon status.
        return Boolean(
            ruleText
            && (normalizedFact === ruleText
                || (normalizedFact.length >= ruleText.length
                    && normalizedFact.includes(ruleText))),
        );
    });
}

function acceptedRule(rule: NovelWorldRule, acceptedIds: Set<string>): boolean {
    const id = text(rule.id, DEFAULT_MAX_PATCH_ID_CHARS);
    return Boolean(id && (acceptedIds.has(id) || acceptedIds.has(`world-rule-${id}`)));
}

function parseJsonLike(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
}

function rawFactEntries(rawFacts: unknown): unknown[] {
    if (Array.isArray(rawFacts)) return rawFacts;
    if (isRecord(rawFacts) && Array.isArray(rawFacts.facts)) return rawFacts.facts;
    return [];
}

function factValue(raw: unknown, maxChars: number): { fact: string; ruleId?: string; forbidden: boolean } {
    if (typeof raw === 'string') {
        return { fact: text(raw, maxChars), forbidden: FORBIDDEN_KEY_PATTERN.test(raw) };
    }
    if (!isRecord(raw)) return { fact: '', forbidden: false };
    const ruleId = text(raw.ruleId ?? raw.id ?? raw.factId, DEFAULT_MAX_PATCH_ID_CHARS);
    const rawFact = raw.text ?? raw.fact ?? raw.value ?? raw.description;
    const fact = text(rawFact, maxChars);
    return {
        fact,
        ...(ruleId ? { ruleId } : {}),
        forbidden: hasForbiddenKey(raw),
    };
}

/**
 * Filters the turn protocol's hardFactsToLock field. Without a valid profile,
 * this preserves legacy behavior while still applying bounded type cleaning.
 */
export function filterNovelHardFactsToLock(
    rawFacts: unknown,
    profile: EchoesNovelProfile | null | undefined,
    options: NovelRuntimeGateOptions = {},
): NovelHardFactGateResult {
    const limits = gateOptions(options);
    const parsedFacts = parseJsonLike(rawFacts);
    const entries = rawFactEntries(parsedFacts);
    const warnings: string[] = [];
    const restrictedFacts: NovelHardFactRestriction[] = [];
    const facts: string[] = [];
    const state = profileState(profile);
    const hasProfile = state === 'valid';
    const acceptedIds = hasProfile ? ruleIds(profile!) : new Set<string>();
    if (state === 'invalid') warnings.push('小说资料无效或已隔离，本轮禁止新增任何硬事实。');
    const truncated = entries.length > limits.maxFacts;
    if (parsedFacts === undefined || (!Array.isArray(parsedFacts) && !isRecord(parsedFacts))) warnings.push('hardFactsToLock 不是数组，已按空列表处理。');
    if (truncated) warnings.push('hardFactsToLock 超过数量上限，已截断。');

    entries.slice(0, limits.maxFacts).forEach((raw) => {
        const normalized = factValue(raw, limits.maxFactChars);
        if (!normalized.fact || normalized.forbidden) {
            if (normalized.forbidden) warnings.push('hardFactsToLock 含有禁止字段或全文内容，已丢弃。');
            return;
        }
        if (state === 'none') {
            if (!facts.includes(normalized.fact)) facts.push(normalized.fact);
            return;
        }
        if (state === 'invalid') {
            restrictedFacts.push({
                fact: normalized.fact,
                ...(normalized.ruleId ? { ruleId: normalized.ruleId } : {}),
                reason: '小说资料无效或已隔离，不能把 AI 输出直接升级为硬事实。',
            });
            return;
        }

        // Text attribution is authoritative. A supplied ruleId is only a
        // hint; an incorrect ID must never turn a known canon rule into a
        // seemingly new scene fact or bypass acceptedFactIds.
        const matchingRules = findRulesForFact(profile!, normalized.fact);
        const hintedRule = normalized.ruleId
            ? matchingRules.find((candidate) => {
                const id = text(candidate.id, limits.maxPatchIdChars);
                return normalized.ruleId === id || normalized.ruleId === `world-rule-${id}`;
            })
            : undefined;
        if (matchingRules.length > 1) {
            restrictedFacts.push({ fact: normalized.fact, ...(normalized.ruleId ? { ruleId: normalized.ruleId } : {}), reason: '事实同时匹配多个原著规则，必须由用户明确确认后才能锁定。' });
            return;
        }
        const rule = matchingRules[0];
        if (normalized.ruleId && !hintedRule) {
            restrictedFacts.push({ fact: normalized.fact, ruleId: normalized.ruleId, reason: '事实携带的 ruleId 与文本规则不匹配，已拒绝。' });
            return;
        }
        if (rule) {
            if (acceptedRule(rule, acceptedIds)) {
                if (!facts.includes(normalized.fact)) facts.push(normalized.fact);
            } else {
                restrictedFacts.push({
                    fact: normalized.fact,
                    ...(normalized.ruleId ? { ruleId: normalized.ruleId } : { ruleId: text(rule.id, limits.maxPatchIdChars) }),
                    reason: '原著世界规则尚未出现在 profile.acceptedFactIds 中，不能直接锁定。',
                });
            }
            return;
        }

        if (!limits.allowUnattributedFacts) {
            restrictedFacts.push({ fact: normalized.fact, ...(normalized.ruleId ? { ruleId: normalized.ruleId } : {}), reason: '事实无法归因到已分析规则，严格历史回放模式拒绝自动锁定。' });
            return;
        }
        // A fact not attributable to an analyzed novel rule may be a current
        // scene fact. This compatibility path is explicit and disabled for
        // imported historical snapshots.
        if (!facts.includes(normalized.fact)) facts.push(normalized.fact);
        warnings.push(`事实未匹配已分析原著规则，按当前剧情事实保留：${normalized.fact.slice(0, 80)}`);
    });

    return {
        facts,
        warnings: cleanWarnings(warnings, limits),
        restrictedFacts,
        truncated,
    };
}

function rawPatchEntries(rawPatches: unknown): unknown[] {
    if (Array.isArray(rawPatches)) return rawPatches;
    if (isRecord(rawPatches) && Array.isArray(rawPatches.patches)) return rawPatches.patches;
    return [];
}

function patchOperation(raw: UnknownRecord): 'upsert' | 'remove' | 'clear' | 'unknown' {
    const op = text(raw.op, 30);
    return op === 'upsert' || op === 'remove' || op === 'clear' ? op : op ? 'unknown' : 'upsert';
}

function patchMechanic(raw: UnknownRecord): UnknownRecord | null {
    return isRecord(raw.mechanic) ? raw.mechanic : null;
}

function patchId(raw: UnknownRecord, maxChars: number): string {
    const mechanic = patchMechanic(raw);
    return text(raw.id ?? mechanic?.id, maxChars);
}

function patchKind(raw: UnknownRecord, maxChars: number): string {
    const mechanic = patchMechanic(raw);
    return text(mechanic?.kind ?? raw.kind, maxChars);
}

function restrictedPatch(
    raw: UnknownRecord,
    reason: string,
    limits: Required<NovelRuntimeGateOptions>,
): NovelMechanicPatchRestriction {
    const operation = patchOperation(raw);
    const id = patchId(raw, limits.maxPatchIdChars);
    const kind = patchKind(raw, limits.maxPatchIdChars);
    return {
        operation,
        ...(id ? { id } : {}),
        ...(kind ? { kind } : {}),
        reason,
    };
}

function patchWithinBudget(raw: unknown): boolean {
    try {
        return JSON.stringify(raw).length <= MAX_PATCH_PAYLOAD_CHARS;
    } catch {
        return false;
    }
}

function safePatch(raw: UnknownRecord, limits: Required<NovelRuntimeGateOptions>): EchoesMechanicPatch | null {
    try {
        const operation = patchOperation(raw);
        if (operation === 'clear') return { op: 'clear' };
        const id = patchId(raw, limits.maxPatchIdChars);
        if (operation === 'remove') return id ? { op: 'remove', id } : null;
        const mechanic = patchMechanic(raw);
        if (!mechanic || hasForbiddenKey(mechanic) || !patchWithinBudget(mechanic)) return null;
        const normalized = normalizeMechanic(mechanic, 0);
        if (id && normalized.id !== id) normalized.id = id;
        return { op: 'upsert', mechanic: normalized };
    } catch {
        return null;
    }
}

function canonicalCurrentMechanics(
    currentMechanics: readonly EchoesMechanicInstance[] | null | undefined,
): EchoesMechanicInstance[] {
    return (currentMechanics ?? []).map(raw => {
        try { return normalizeMechanic(raw, 0); } catch { return null; }
    }).filter((item): item is EchoesMechanicInstance => !!item);
}

function currentEnabledMechanicIds(
    currentMechanics: readonly EchoesMechanicInstance[] | null | undefined,
    enabledKinds: Set<string>,
): Set<string> {
    const ids = new Set<string>();
    for (const mechanic of canonicalCurrentMechanics(currentMechanics)) {
        if (enabledKinds.has(mechanic.kind) && mechanic.status !== 'disabled') ids.add(mechanic.id);
    }
    return ids;
}

function currentDisabledMechanicIds(
    currentMechanics: readonly EchoesMechanicInstance[] | null | undefined,
    enabledKinds: Set<string>,
): Set<string> {
    const ids = new Set<string>();
    for (const mechanic of canonicalCurrentMechanics(currentMechanics)) {
        if (enabledKinds.has(mechanic.kind) && mechanic.status === 'disabled') ids.add(mechanic.id);
    }
    return ids;
}

/** Normalize a historical mechanic snapshot without trusting its raw shape. */
export function sanitizeNovelMechanicSnapshot(
    rawSnapshot: unknown,
    profile: EchoesNovelProfile | null | undefined,
    fallback: readonly EchoesMechanicInstance[] = [],
    now = Date.now(),
): EchoesMechanicInstance[] {
    const state = profileState(profile);
    const source = Array.isArray(rawSnapshot) ? rawSnapshot : fallback;
    const normalizeSafe = (item: unknown): EchoesMechanicInstance | null => {
        try {
            // Do not let normalizeMechanic's safe default turn an explicitly
            // invalid trigger into an allowed one for a valid Profile.
            if (state === 'valid' && isRecord(item) && item.trigger !== undefined) {
                const kind = typeof item.kind === 'string' ? item.kind : '';
                const definition = getMechanicDefinition(kind);
                if (!definition || typeof item.trigger !== 'string' || !definition.allowedTriggers.includes(item.trigger as any)) return null;
            }
            return normalizeMechanic(item, now);
        } catch {
            return null;
        }
    };
    const normalized = source.slice(0, 50).map(normalizeSafe).filter((item): item is EchoesMechanicInstance => !!item);
    const deduplicate = (items: readonly EchoesMechanicInstance[]): EchoesMechanicInstance[] => {
        const byId = new Map<string, EchoesMechanicInstance>();
        for (const item of items) {
            // Last snapshot entry wins, matching applyMechanicPatches upsert
            // semantics while eliminating ambiguous duplicate IDs.
            byId.delete(item.id);
            byId.set(item.id, item);
        }
        return Array.from(byId.values()).slice(-50);
    };
    if (state === 'none') return deduplicate(normalized);
    if (state === 'invalid') {
        // An invalid/quarantined profile makes imported mechanic state
        // untrustworthy. Do not turn its fallback into a trusted cursor.
        return [];
    }
    // cast_roster / lore_codex 是基础导航能力，始终允许，不受世界包白名单约束。
    const enabledKinds = new Set([...profile!.enabledMechanicKinds, ...ALWAYS_ENABLED_MECHANIC_KINDS]);
    // The caller supplies either the trusted initial baseline or the already
    // reconstructed cursor. New IDs created by an accepted patch are valid
    // and must survive into the next cursor; the profile kind allowlist is the
    // authority, not the previous ID set.
    return normalized
        .filter(item => item.kind !== 'unsupported' && enabledKinds.has(item.kind))
        .filter(item => {
            const definition = getMechanicDefinition(item.kind);
            return !!definition && definition.allowedTriggers.includes(item.trigger);
        })
        .reduce((items, item) => {
            const existingIndex = items.findIndex(entry => entry.id === item.id);
            if (existingIndex >= 0) items.splice(existingIndex, 1);
            items.push(item);
            return items;
        }, [] as EchoesMechanicInstance[])
        .slice(-50);
}

/**
 * Filters mechanic patches before the existing applyMechanicPatches function.
 * A valid profile turns its explicit enabledMechanicKinds into the allowlist;
 * no profile keeps the legacy bounded-normalization behavior.
 */
export function filterNovelMechanicPatches(
    rawPatches: unknown,
    profile: EchoesNovelProfile | null | undefined,
    currentMechanics: readonly EchoesMechanicInstance[] | null | undefined = [],
    options: NovelRuntimeGateOptions = {},
): NovelMechanicPatchGateResult {
    const limits = gateOptions(options);
    const parsedPatches = parseJsonLike(rawPatches);
    const entries = rawPatchEntries(parsedPatches);
    const warnings: string[] = [];
    const rejectedPatches: NovelMechanicPatchRestriction[] = [];
    const patches: EchoesMechanicPatch[] = [];
    const state = profileState(profile);
    const hasProfile = state === 'valid';
    // cast_roster / lore_codex 是基础导航能力，始终允许，不受世界包白名单约束。
    const enabledKinds = new Set<string>(hasProfile ? [...profile!.enabledMechanicKinds, ...ALWAYS_ENABLED_MECHANIC_KINDS] : [...ALWAYS_ENABLED_MECHANIC_KINDS]);
    const activeIds = currentEnabledMechanicIds(currentMechanics, enabledKinds);
    const disabledIds = currentDisabledMechanicIds(currentMechanics, enabledKinds);
    const truncated = entries.length > limits.maxPatches;
    if (parsedPatches === undefined || (!Array.isArray(parsedPatches) && !isRecord(parsedPatches))) warnings.push('mechanicPatches 不是数组，已按空列表处理。');
    if (truncated) warnings.push('mechanicPatches 超过数量上限，已截断。');

    entries.slice(0, limits.maxPatches).forEach((raw) => {
        if (!patchWithinBudget(raw)) {
            rejectedPatches.push({ operation: 'unknown', reason: 'patch 载荷超过安全大小上限。' });
            return;
        }
        if (!isRecord(raw) || hasForbiddenKey(raw)) {
            rejectedPatches.push({ operation: 'unknown', reason: 'patch 不是安全对象或含有禁止字段。' });
            return;
        }
        const operation = patchOperation(raw);
        if (operation === 'unknown') {
            rejectedPatches.push(restrictedPatch(raw, '不支持的 patch 操作。', limits));
            return;
        }
        if (state === 'none') {
            const normalized = safePatch(raw, limits);
            if (normalized) patches.push(normalized);
            else rejectedPatches.push(restrictedPatch(raw, 'patch 结构无效。', limits));
            return;
        }
        if (state === 'invalid') {
            rejectedPatches.push(restrictedPatch(raw, '小说资料无效或已隔离，禁止新增、移除或清空机制。', limits));
            return;
        }
        if (operation === 'clear') {
            rejectedPatches.push(restrictedPatch(raw, 'profile gate 默认拒绝 clear，避免 AI 清空用户组件。', limits));
            return;
        }
        if (operation === 'remove') {
            const id = patchId(raw, limits.maxPatchIdChars);
            if (!id || !activeIds.has(id)) {
                rejectedPatches.push(restrictedPatch(raw, '只能移除当前已存在且属于 enabledMechanicKinds 的机制。', limits));
                return;
            }
            patches.push({ op: 'remove', id });
            activeIds.delete(id);
            return;
        }
        const kind = patchKind(raw, limits.maxPatchIdChars);
        if (!isRegisteredMechanicKind(kind)) {
            rejectedPatches.push(restrictedPatch(raw, '机制 kind 未注册。', limits));
            return;
        }
        if (!enabledKinds.has(kind)) {
            rejectedPatches.push(restrictedPatch(raw, '机制 kind 未在 profile.enabledMechanicKinds 中启用。', limits));
            return;
        }
        const definition = getMechanicDefinition(kind);
        const requestedTrigger = patchMechanic(raw)?.trigger;
        if (!definition || (requestedTrigger !== undefined
            && (typeof requestedTrigger !== 'string' || !definition.allowedTriggers.includes(requestedTrigger as any)))) {
            rejectedPatches.push(restrictedPatch(raw, '机制 trigger 不在该组件目录允许范围内。', limits));
            return;
        }
        const normalized = safePatch(raw, limits);
        if (!normalized) {
            rejectedPatches.push(restrictedPatch(raw, 'upsert patch 结构无效或含有禁止字段。', limits));
            return;
        }
        // Normalize only to validate the resulting registered kind, while
        // returning the bounded patch rather than an active mechanic instance.
        const normalizedMechanic = normalized.op === 'upsert' && normalized.mechanic
            ? normalizeMechanic(normalized.mechanic, 0)
            : null;
        if (!normalizedMechanic || normalizedMechanic.kind !== kind || normalizedMechanic.kind === 'unsupported') {
            rejectedPatches.push(restrictedPatch(raw, '机制归一化后不是允许的注册 kind。', limits));
            return;
        }
        if (!definition || !definition.allowedTriggers.includes(normalizedMechanic.trigger)) {
            rejectedPatches.push(restrictedPatch(raw, '机制 trigger 不在该组件目录允许范围内。', limits));
            return;
        }
        // Check the canonical normalized ID, not only a caller-supplied raw ID;
        // an omitted raw ID must not bypass a disabled-ID tombstone.
        if (disabledIds.has(normalizedMechanic.id)) {
            rejectedPatches.push(restrictedPatch(raw, '当前组件已被禁用，AI 不能用同一 ID 重新激活。', limits));
            return;
        }
        // Keep the same-patch-list cursor deterministic: an accepted upsert
        // may be removed or updated by a later patch in the same turn.
        if (normalizedMechanic.status === 'disabled') {
            activeIds.delete(normalizedMechanic.id);
            disabledIds.add(normalizedMechanic.id);
        } else {
            activeIds.add(normalizedMechanic.id);
            disabledIds.delete(normalizedMechanic.id);
        }
        patches.push({ op: 'upsert', mechanic: normalizedMechanic });
    });

    if (rejectedPatches.length) warnings.push(`已拒绝 ${rejectedPatches.length} 个不符合小说资料门控的机制 patch。`);
    return {
        patches,
        warnings: cleanWarnings(warnings, limits),
        rejectedPatches,
        truncated,
    };
}
