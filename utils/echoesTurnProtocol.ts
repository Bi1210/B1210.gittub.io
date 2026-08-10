import type { EchoesContentBlock, EchoesFormat, EchoesState } from '../types';
import type { EchoesMechanicPatch } from './echoesMechanicsTypes';
import type {
    EchoesChapterStatus,
    EchoesChoice,
    EchoesEndingTrigger,
    EchoesTurnOutput,
    EchoesTurnParseResult,
    EchoesTurnParserOptions,
} from './echoesTurnProtocolTypes';

// This file is intentionally outside the app tree for isolated protocol tests.
// It is copied into the project only after the protocol is reviewed.
const clean = (value: unknown, max = 12000): string => typeof value === 'string' ? value.trim().slice(0, max) : '';
const list = (value: unknown, max = 100, itemMax = 1000): string[] => Array.isArray(value) ? value.map(item => clean(item, itemMax)).filter(Boolean).slice(0, max) : [];
const finite = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const allowedKind = new Set(['narrative', 'dialogue', 'artifact', 'state', 'system']);
const allowedEnding = new Set(['BE', 'NE', 'HE', 'TE', 'SE']);
const allowedStatus = new Set(['current', 'completed', 'locked']);
const allowedFormats = new Set(['text', 'markdown', 'html', 'latex', 'code', 'json', 'xml', 'yaml', 'csv', 'tsv', 'sql', 'svg', 'mermaid', 'plantuml', 'mindmap']);

const extractText = (response: unknown): { text: string; validJson: boolean } => {
    if (response && typeof response === 'object') {
        const object = response as Record<string, any>;
        if (object.choices?.[0]?.message?.content !== undefined) return extractText(object.choices[0].message.content);
        if (typeof object.content === 'string') return extractText(object.content);
        return { text: JSON.stringify(response), validJson: true };
    }
    const text = typeof response === 'string' ? response.trim() : '';
    if (!text) return { text: '', validJson: false };
    const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try { return { text: JSON.stringify(JSON.parse(unfenced)), validJson: true }; } catch { /* scan embedded JSON below */ }
    for (let start = 0; start < unfenced.length; start += 1) {
        if (unfenced[start] !== '{') continue;
        let depth = 0; let quoted = false; let escaped = false;
        for (let end = start; end < unfenced.length; end += 1) {
            const char = unfenced[end];
            if (quoted) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') quoted = false;
            } else if (char === '"') quoted = true;
            else if (char === '{') depth += 1;
            else if (char === '}') {
                depth -= 1;
                if (depth === 0) {
                    try { return { text: JSON.stringify(JSON.parse(unfenced.slice(start, end + 1))), validJson: true }; } catch { break; }
                }
            }
        }
    }
    return { text, validJson: false };
};

const fallbackBlock = (text: string, formats: readonly EchoesFormat[]): EchoesContentBlock => ({
    id: `fallback-${Date.now()}`,
    kind: 'narrative',
    format: formats.includes('markdown') ? 'markdown' : 'text',
    content: clean(text, 30000) || '世界暂时没有回应。',
});

const normalizeStatePatch = (value: unknown): Partial<EchoesState> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const raw = value as Record<string, unknown>;
    const patch: Partial<EchoesState> = {};
    if (typeof raw.time === 'string') patch.time = clean(raw.time, 200);
    if (typeof raw.location === 'string') patch.location = clean(raw.location, 300);
    if (typeof raw.chapter === 'string') patch.chapter = clean(raw.chapter, 200);
    const health = finite(raw.health); if (health !== undefined) patch.health = Math.max(0, Math.min(100, health));
    const sanity = finite(raw.sanity); if (sanity !== undefined) patch.sanity = Math.max(0, Math.min(100, sanity));
    if (Array.isArray(raw.inventory)) patch.inventory = list(raw.inventory, 100, 300);
    if (raw.resources && typeof raw.resources === 'object' && !Array.isArray(raw.resources)) patch.resources = Object.fromEntries(Object.entries(raw.resources as Record<string, unknown>).slice(0, 50).filter(([, item]) => typeof item === 'string' || typeof item === 'number').map(([key, item]) => [clean(key, 80), typeof item === 'number' ? item : clean(item, 300)]));
    if (raw.custom && typeof raw.custom === 'object' && !Array.isArray(raw.custom)) patch.custom = Object.fromEntries(Object.entries(raw.custom as Record<string, unknown>).slice(0, 100).filter(([, item]) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean').map(([key, item]) => [clean(key, 80), typeof item === 'string' ? clean(item, 500) : item])) as Record<string, string | number | boolean>;
    return patch;
};

const normalizeBlocks = (value: unknown, options: Required<Pick<EchoesTurnParserOptions, 'allowedFormats' | 'maxBlocks'>>, fallback: string): EchoesContentBlock[] => {
    if (!Array.isArray(value)) return [fallbackBlock(fallback, options.allowedFormats)];
    const blocks = value.slice(0, options.maxBlocks).map((item, index) => {
        const raw = item && typeof item === 'object' ? item as Record<string, unknown> : {};
        const kind = allowedKind.has(raw.kind as string) ? raw.kind as EchoesContentBlock['kind'] : 'narrative';
        const requested = clean(raw.format, 30) as EchoesFormat;
        const format = options.allowedFormats.includes(requested) && allowedFormats.has(requested) ? requested : (kind === 'narrative' || kind === 'dialogue' ? (options.allowedFormats.includes('markdown') ? 'markdown' : 'text') : 'text');
        const content = clean(raw.content ?? raw.text ?? raw.body, 30000);
        return content ? { id: clean(raw.id, 120) || `block-${index + 1}`, kind, format, ...(clean(raw.title, 200) ? { title: clean(raw.title, 200) } : {}), content, collapsible: raw.collapsible === true } as EchoesContentBlock : null;
    }).filter((item): item is EchoesContentBlock => !!item);
    return blocks.length ? blocks : [fallbackBlock(fallback, options.allowedFormats)];
};

const normalizeChoices = (value: unknown, max: number): EchoesChoice[] => Array.isArray(value) ? value.slice(0, max).map((item, index) => {
    const raw = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const label = clean(raw.label ?? raw.title, 300);
    return label ? { id: clean(raw.id, 120) || `choice-${index + 1}`, label, ...(clean(raw.description, 800) ? { description: clean(raw.description, 800) } : {}), ...(clean(raw.preview, 800) ? { preview: clean(raw.preview, 800) } : {}), disabled: raw.disabled === true, ...(clean(raw.disabledReason ?? raw.disabledHint, 300) ? { disabledReason: clean(raw.disabledReason ?? raw.disabledHint, 300) } : {}) } : null;
}).filter((item): item is EchoesChoice => !!item) : [];

const normalizeMechanicPatches = (value: unknown, max: number): EchoesMechanicPatch[] => Array.isArray(value) ? value.slice(0, max).filter(item => item && typeof item === 'object').map(item => item as EchoesMechanicPatch) : [];

export const parseEchoesTurnOutput = (response: unknown, options: EchoesTurnParserOptions = {}): EchoesTurnParseResult => {
    const formats = (options.allowedFormats?.length ? options.allowedFormats : ['text', 'markdown']) as readonly EchoesFormat[];
    const maxBlocks = options.maxBlocks ?? 24;
    const maxChoices = options.maxChoices ?? 6;
    const maxFacts = options.maxFacts ?? 200;
    const maxMechanicPatches = options.maxMechanicPatches ?? 20;
    const extracted = extractText(response);
    let raw: Record<string, unknown> = {};
    let warnings: string[] = [];
    if (extracted.validJson) {
        try { raw = JSON.parse(extracted.text) as Record<string, unknown>; } catch { warnings.push('JSON 解析结果无法转换为对象'); }
    } else warnings.push('AI 返回不是合法 JSON，已降级为正文');
    // Keep an invalid string response visible for recovery; fallbackText is only a last resort.
    const fallback = clean(typeof response === 'string' ? response : options.fallbackText ?? '', 30000) || clean(options.fallbackText, 30000);
    const statePatch = normalizeStatePatch(raw.statePatch ?? raw.state);
    const parsedChapter = clean(raw.chapter, 200) || (statePatch.chapter || '序章');
    if (!statePatch.chapter && parsedChapter) statePatch.chapter = parsedChapter;
    const directorRaw = raw.directorPatch ?? raw.director;
    const directorPatch = directorRaw && typeof directorRaw === 'object' && !Array.isArray(directorRaw) ? directorRaw as EchoesTurnOutput['directorPatch'] : {};
    const chapterUpdateRaw = raw.chapterUpdate && typeof raw.chapterUpdate === 'object' ? raw.chapterUpdate as Record<string, unknown> : null;
    const endingRaw = raw.endingTriggered && typeof raw.endingTriggered === 'object' ? raw.endingTriggered as Record<string, unknown> : null;
    const chapterUpdate = chapterUpdateRaw && clean(chapterUpdateRaw.title, 300) ? { ...(clean(chapterUpdateRaw.id, 120) ? { id: clean(chapterUpdateRaw.id, 120) } : {}), title: clean(chapterUpdateRaw.title, 300), ...(clean(chapterUpdateRaw.summary, 2000) ? { summary: clean(chapterUpdateRaw.summary, 2000) } : {}), status: allowedStatus.has(chapterUpdateRaw.status as string) ? chapterUpdateRaw.status as EchoesChapterStatus : 'current' } : undefined;
    const endingTriggered = endingRaw && clean(endingRaw.title, 300) && allowedEnding.has(endingRaw.type as string) ? { ...(clean(endingRaw.id, 120) ? { id: clean(endingRaw.id, 120) } : {}), title: clean(endingRaw.title, 300), type: endingRaw.type as EchoesEndingTrigger['type'], ...(clean(endingRaw.epilogue, 6000) ? { epilogue: clean(endingRaw.epilogue, 6000) } : {}), achievements: list(endingRaw.achievements, 20, 300) } : undefined;
    return {
        output: {
            chapter: parsedChapter,
            ...(clean(raw.mood, 30) ? { mood: clean(raw.mood, 30) } : {}),
            blocks: normalizeBlocks(raw.blocks, { allowedFormats: formats, maxBlocks }, fallback),
            choices: normalizeChoices(raw.choices, maxChoices),
            suggestions: list(raw.suggestions ?? raw.actions, 6, 300),
            statePatch,
            directorPatch,
            newKnownFacts: list(raw.newKnownFacts ?? raw.knownFacts, maxFacts, 1000),
            hardFactsToLock: list(raw.hardFactsToLock ?? raw.hardFacts, maxFacts, 1000),
            continuitySummary: clean(raw.continuitySummary ?? raw.recap, 5000),
            mechanicPatches: normalizeMechanicPatches(raw.mechanicPatches ?? raw.mechanics, maxMechanicPatches),
            ...(chapterUpdate ? { chapterUpdate } : {}),
            ...(endingTriggered ? { endingTriggered } : {}),
        },
        validJson: extracted.validJson,
        usedFallback: !extracted.validJson,
        warnings,
        rawText: typeof response === 'string' ? response : extracted.text,
    };
};

export const buildEchoesTurnOutputInstruction = (): string => `只输出合法 JSON，不要代码围栏。正文放在 blocks；关键节点才输出 choices；需要变化的动态组件使用 mechanicPatches。不要输出未注册组件代码，只能使用组件目录中已有的 kind。字段：chapter、mood、blocks、choices、suggestions、statePatch、directorPatch、newKnownFacts、hardFactsToLock、continuitySummary、mechanicPatches，可选 chapterUpdate、endingTriggered。`;
