import {
    createEchoesNovelSourceRef,
} from './echoesNovelWorldDraft';
import {
    normalizeNovelSourceRef,
} from './echoesCrossover';
import {
    isRegisteredNovelAnalysisMechanicKind,
    parseNovelAnalysisResult,
    validateNovelAnalysis,
} from './echoesNovelAnalysis';
import {
    ECHOES_NOVEL_PROFILE_SCHEMA_VERSION,
    type EchoesNovelProfile,
    type EchoesNovelProfileDocumentRef,
    type EchoesNovelProfileInput,
    type EchoesNovelProfileNormalizationResult,
    type EchoesNovelProfileOptions,
    type EchoesNovelProfileValidationResult,
} from './echoesNovelProfileTypes';
import type {
    NovelAnalysis,
    NovelAnalysisParseResult,
    NovelAnalysisSourceOptions,
} from './echoesNovelAnalysisTypes';
import type { EchoesEntryPoint, EchoesNovelSourceRef } from './echoesCrossoverTypes';

const MAX_ID_CHARS = 200;
const MAX_LABEL_CHARS = 300;
const MAX_WARNING_CHARS = 500;
const MAX_IDS = 200;
const MAX_ENABLED_MECHANICS = 30;
const MAX_WARNINGS = 100;
const VALID_ENTRY_SOURCES = new Set<EchoesEntryPoint['source']>(['user', 'novel', 'ai', 'unknown']);
const VALID_SOURCE_KINDS = new Set<EchoesNovelSourceRef['kind']>(['uploaded', 'named', 'described', 'unknown']);
const VALID_SOURCE_FORMATS = new Set<EchoesNovelSourceRef['format']>(['txt', 'epub']);
const FORBIDDEN_PROFILE_KEYS = ['normalizedText', 'rawText', 'rawResponse', 'fullText'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, maxChars: number): string {
    return typeof value === 'string' ? value.trim().slice(0, maxChars) : '';
}

function uniqueStrings(values: readonly unknown[], maxItems = MAX_IDS, maxChars = MAX_ID_CHARS): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        const item = text(value, maxChars);
        if (!item || seen.has(item)) continue;
        seen.add(item);
        result.push(item);
        if (result.length >= maxItems) break;
    }
    return result;
}

function warningList(values: readonly unknown[]): string[] {
    return uniqueStrings(values, MAX_WARNINGS, MAX_WARNING_CHARS);
}

function safeInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
        ? value
        : undefined;
}

function safeTimestamp(value: unknown, fallback: number): number {
    const timestamp = safeInteger(value);
    return timestamp === undefined ? fallback : timestamp;
}

function sourceOptionsFromDocument(
    document: EchoesNovelProfileDocumentRef | undefined,
): Partial<EchoesNovelSourceRef> {
    if (!isRecord(document)) return {};
    return {
        ...(text(document.fileName, 500) ? { fileName: text(document.fileName, 500) } : {}),
        ...(document.format === 'txt' || document.format === 'epub' ? { format: document.format } : {}),
        ...(text(document.parserVersion, 120) ? { parserVersion: text(document.parserVersion, 120) } : {}),
        ...(safeInteger(document.chapterCount) !== undefined ? { chapterCount: safeInteger(document.chapterCount) } : {}),
        ...(safeInteger(document.normalizedCharCount) !== undefined ? { normalizedCharCount: safeInteger(document.normalizedCharCount) } : {}),
    };
}

function analysisSourceOptions(
    source: Partial<EchoesNovelSourceRef> | undefined,
): NovelAnalysisSourceOptions {
    if (!source) return {};
    return {
        ...(text(source.kind, 120) ? { sourceKind: text(source.kind, 120) } : {}),
        ...(text(source.title, 500) ? { sourceTitle: text(source.title, 500) } : {}),
        ...(text(source.fileName, 500) ? { sourceFileName: text(source.fileName, 500) } : {}),
        ...(text(source.author, 300) ? { author: text(source.author, 300) } : {}),
    };
}

function mergeSource(
    analysis: NovelAnalysis,
    source: Partial<EchoesNovelSourceRef> | undefined,
    document: EchoesNovelProfileDocumentRef | undefined,
): EchoesNovelSourceRef {
    const documentSource = sourceOptionsFromDocument(document);
    const merged = { ...documentSource, ...(source || {}) };
    const generated = createEchoesNovelSourceRef(analysis, merged);
    return normalizeNovelSourceRef({
        ...merged,
        ...generated,
        // An explicitly supplied non-empty id is authoritative; an empty id
        // must not erase the deterministic generated reference.
        ...(text(merged.id, MAX_ID_CHARS) ? { id: text(merged.id, MAX_ID_CHARS) } : {}),
    });
}

function normalizeEntryPoint(
    point: Partial<EchoesEntryPoint> | undefined,
    analysis: NovelAnalysis,
    warnings: string[],
): EchoesEntryPoint {
    const recommended = analysis.recommendedEntryPoints.find(item => item.suitableForCrossover === true)
        || analysis.recommendedEntryPoints[0];
    const raw = isRecord(point) ? point as Partial<EchoesEntryPoint> : {};
    const hasExplicitPoint = Object.keys(raw).length > 0;
    const recommendedLabel = recommended?.label || '原著开头';
    const label = text(raw.label, MAX_LABEL_CHARS) || text(recommendedLabel, MAX_LABEL_CHARS) || '原著开头';
    const chapterId = text(raw.chapterId, MAX_ID_CHARS) || text(recommended?.chapterId, MAX_ID_CHARS);
    const chapterIndex = safeInteger(raw.chapterIndex) ?? safeInteger(recommended?.chapterIndex);
    const description = text(raw.description, 1_000) || text(recommended?.reason, 1_000);
    const source = VALID_ENTRY_SOURCES.has(raw.source as EchoesEntryPoint['source'])
        ? raw.source as EchoesEntryPoint['source']
        : (!hasExplicitPoint ? (recommended ? 'ai' : 'novel') : 'user');
    if (raw.source !== undefined && !VALID_ENTRY_SOURCES.has(raw.source as EchoesEntryPoint['source'])) {
        warnings.push('entryPoint.source 无效，已安全归一化。');
    }
    return {
        ...(chapterId ? { chapterId } : {}),
        ...(chapterIndex !== undefined ? { chapterIndex } : {}),
        label,
        ...(description ? { description } : {}),
        source,
    };
}

function normalizeMechanicKinds(
    values: readonly unknown[] | undefined,
    warnings: string[],
): Array<Extract<EchoesNovelProfile['enabledMechanicKinds'][number], string>> {
    const result: EchoesNovelProfile['enabledMechanicKinds'] = [];
    if (!Array.isArray(values)) {
        if (values !== undefined) warnings.push('enabledMechanicKinds 不是数组，已清空。');
        return result;
    }
    if (values.length > MAX_ENABLED_MECHANICS) warnings.push('enabledMechanicKinds 超过上限，已截断。');
    for (const value of values.slice(0, MAX_ENABLED_MECHANICS)) {
        if (isRegisteredNovelAnalysisMechanicKind(value)) {
            if (!result.includes(value)) result.push(value);
        } else if (typeof value === 'string' && value.trim()) {
            warnings.push(`机制 ${text(value, MAX_ID_CHARS)} 未注册，未启用。`);
        }
    }
    return result;
}

function hasForbiddenProfileKey(value: unknown, depth = 0, budget = { left: 800 }, seen = new Set<object>()): string | undefined {
    if (typeof value === 'string') {
        const match = value.match(/['\"](normalizedText|rawText|rawResponse|fullText)['\"]\s*:/);
        return match?.[1];
    }
    if (budget.left <= 0 || depth > 6 || !value || typeof value !== 'object') return undefined;
    if (seen.has(value as object)) return undefined;
    seen.add(value as object);
    budget.left -= 1;
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = hasForbiddenProfileKey(item, depth + 1, budget, seen);
            if (found) return found;
        }
        return undefined;
    }
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
        if ((FORBIDDEN_PROFILE_KEYS as readonly string[]).includes(entryKey)) return entryKey;
        const found = hasForbiddenProfileKey(entryValue, depth + 1, budget, seen);
        if (found) return found;
    }
    return undefined;
}

function normalizeProfileAt(
    analysisInput: unknown,
    options: EchoesNovelProfileOptions,
    sourceOverride: Partial<EchoesNovelSourceRef> | undefined,
    document: EchoesNovelProfileDocumentRef | undefined,
    acceptedFactIds: readonly unknown[] | undefined,
    enabledMechanicKinds: readonly unknown[] | undefined,
    createdAt: number | undefined,
    updatedAt: number | undefined,
): EchoesNovelProfileNormalizationResult {
    const safeSourceOverride = isRecord(sourceOverride)
        ? sourceOverride as Partial<EchoesNovelSourceRef>
        : undefined;
    const forbiddenKey = hasForbiddenProfileKey({ analysisInput, sourceOverride: safeSourceOverride, document });
    const parseResult = parseNovelAnalysisResult(analysisInput, {
        ...analysisSourceOptions(safeSourceOverride),
    });
    const analysis = parseResult.analysis;
    const warnings: string[] = [
        ...(forbiddenKey ? [`输入包含禁止保存字段 ${forbiddenKey}，已拒绝该字段并仅保留归一化分析。`] : []),
        ...parseResult.validation.warnings,
        ...(parseResult.fallback ? ['小说分析结果使用了安全 fallback，不能据此自动锁定原著事实。'] : []),
    ];
    const source = mergeSource(analysis, sourceOverride, document);
    const entryPoint = normalizeEntryPoint(options.entryPoint, analysis, warnings);
    const enabled = normalizeMechanicKinds(enabledMechanicKinds, warnings);
    const now = safeTimestamp(options.now, Date.now());
    const created = safeTimestamp(createdAt, now);
    const updated = safeTimestamp(updatedAt, created);
    const accepted = Array.isArray(acceptedFactIds) ? acceptedFactIds : [];
    if (acceptedFactIds !== undefined && !Array.isArray(acceptedFactIds)) {
        warnings.push('acceptedFactIds 不是数组，已清空。');
    }
    const profile: EchoesNovelProfile = {
        schemaVersion: ECHOES_NOVEL_PROFILE_SCHEMA_VERSION,
        source,
        analysis,
        entryPoint,
        acceptedFactIds: uniqueStrings(accepted, MAX_IDS, MAX_ID_CHARS),
        enabledMechanicKinds: enabled,
        createdAt: created,
        updatedAt: updated,
    };
    return {
        profile,
        analysisParseResult: parseResult,
        warnings: warningList(warnings),
    };
}

/** Creates a storage-safe profile from raw or already-normalized analysis data. */
export function createEchoesNovelProfile(
    analysisInput: unknown,
    options: EchoesNovelProfileOptions = {},
): EchoesNovelProfileNormalizationResult {
    return normalizeProfileAt(
        analysisInput,
        options,
        options.source,
        options.document,
        options.acceptedFactIds,
        options.enabledMechanicKinds,
        undefined,
        undefined,
    );
}

/** Re-normalizes an imported profile and strips unknown analysis fields. */
export function normalizeEchoesNovelProfile(
    input: EchoesNovelProfileInput,
    options: EchoesNovelProfileOptions = {},
): EchoesNovelProfileNormalizationResult {
    const rawInput = isRecord(input) ? input as EchoesNovelProfileInput : {} as EchoesNovelProfileInput;
    const inputSource = isRecord(rawInput.source) ? rawInput.source as Partial<EchoesNovelSourceRef> : {};
    const optionSource = isRecord(options.source) ? options.source as Partial<EchoesNovelSourceRef> : {};
    const source = { ...inputSource, ...optionSource };
    const entryPoint = options.entryPoint || rawInput.entryPoint;
    const mergedOptions: EchoesNovelProfileOptions = { ...options, source, entryPoint };
    const result = normalizeProfileAt(
        rawInput.analysis,
        mergedOptions,
        source,
        options.document,
        options.acceptedFactIds ?? rawInput.acceptedFactIds,
        options.enabledMechanicKinds ?? rawInput.enabledMechanicKinds,
        rawInput.createdAt,
        rawInput.updatedAt,
    );
    // Keep an explicit quarantine marker across normalization. The marker is
    // intentionally understood as invalid by runtime gates, so malformed
    // imported profiles can never silently fall back to legacy permissive mode.
    if (rawInput.trustStatus === 'quarantined') {
        result.profile = { ...result.profile, trustStatus: 'quarantined' };
    }
    return result;
}

/** Validates the normalized profile contract without reading network or storage. */
export function validateEchoesNovelProfile(value: unknown): EchoesNovelProfileValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { valid: false, errors: ['小说资料必须是对象。'], warnings };
    }
    const profile = value as Partial<EchoesNovelProfile>;
    if (profile.trustStatus === 'quarantined') {
        errors.push('小说资料处于隔离状态。');
    } else if (profile.trustStatus !== undefined) {
        errors.push('小说资料 trustStatus 无效。');
    }
    if (profile.schemaVersion !== ECHOES_NOVEL_PROFILE_SCHEMA_VERSION) errors.push('不支持的小说资料版本。');
    if (!profile.source || typeof profile.source !== 'object' || Array.isArray(profile.source)) {
        errors.push('缺少原著来源引用。');
    } else {
        if (!text(profile.source.id, 200)) errors.push('原著来源缺少稳定 ID。');
        if (!text(profile.source.title, 300)) errors.push('原著来源缺少标题。');
        if (!VALID_SOURCE_KINDS.has(profile.source.kind as EchoesNovelSourceRef['kind'])) errors.push('原著来源 kind 无效。');
        if (profile.source.format !== undefined && !VALID_SOURCE_FORMATS.has(profile.source.format)) errors.push('原著来源 format 无效。');
        if (profile.source.chapterCount !== undefined && safeInteger(profile.source.chapterCount) === undefined) errors.push('原著来源 chapterCount 无效。');
        if (profile.source.normalizedCharCount !== undefined && safeInteger(profile.source.normalizedCharCount) === undefined) errors.push('原著来源 normalizedCharCount 无效。');
    }
    if (!profile.analysis || typeof profile.analysis !== 'object' || Array.isArray(profile.analysis)) {
        errors.push('缺少小说分析。');
    } else {
        const analysisValidation = validateNovelAnalysis(profile.analysis);
        errors.push(...analysisValidation.errors);
        warnings.push(...analysisValidation.warnings);
    }
    if (!profile.entryPoint || typeof profile.entryPoint !== 'object' || Array.isArray(profile.entryPoint)) {
        errors.push('缺少进入时间点。');
    } else {
        if (!text(profile.entryPoint.label, MAX_LABEL_CHARS)) errors.push('进入时间点缺少标签。');
        if (!VALID_ENTRY_SOURCES.has(profile.entryPoint.source as EchoesEntryPoint['source'])) errors.push('进入时间点来源无效。');
    }
    if (!Array.isArray(profile.acceptedFactIds)) errors.push('acceptedFactIds 必须是数组。');
    else {
        if (profile.acceptedFactIds.length > MAX_IDS) errors.push('acceptedFactIds 不能超过 200 项。');
        if (profile.acceptedFactIds.some(item => typeof item !== 'string')) errors.push('acceptedFactIds 只能包含字符串。');
        const ids = profile.acceptedFactIds.filter((item): item is string => typeof item === 'string');
        if (new Set(ids).size !== ids.length) warnings.push('acceptedFactIds 含有重复 ID。');
    }
    if (!Array.isArray(profile.enabledMechanicKinds)) errors.push('enabledMechanicKinds 必须是数组。');
    else {
        if (profile.enabledMechanicKinds.length > MAX_ENABLED_MECHANICS) errors.push('enabledMechanicKinds 不能超过 30 项。');
        profile.enabledMechanicKinds.forEach((kind, index) => {
            if (!isRegisteredNovelAnalysisMechanicKind(kind)) errors.push(`enabledMechanicKinds[${index}] 不是已注册机制。`);
        });
    }
    const createdAt = safeInteger(profile.createdAt);
    const updatedAt = safeInteger(profile.updatedAt);
    if (createdAt === undefined || updatedAt === undefined) {
        errors.push('createdAt 和 updatedAt 必须是非负整数。');
    } else if (updatedAt < createdAt) {
        errors.push('updatedAt 不能早于 createdAt。');
    }
    if (hasForbiddenProfileKey(value)) errors.push('小说资料不能包含 normalizedText、rawText、rawResponse 或 fullText。');
    return { valid: errors.length === 0, errors: warningList(errors), warnings: warningList(warnings) };
}

export type { NovelAnalysis, NovelAnalysisParseResult };
