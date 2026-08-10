import { normalizeNovelSourceRef } from './echoesCrossover';
import { isRegisteredNovelAnalysisMechanicKind } from './echoesNovelAnalysis';
import type { EchoesEntryPoint, EchoesNovelSourceRef } from './echoesCrossoverTypes';
import type {
    NovelAnalysis,
    NovelEvidence,
    NovelEvidenceBasis,
    NovelMechanicHint,
    NovelRecommendedEntryPoint,
} from './echoesNovelAnalysisTypes';
import type {
    EchoesNovelFactSuggestion,
    EchoesNovelWorldDraft,
    EchoesNovelWorldDraftOptions,
} from './echoesNovelWorldDraftTypes';

const MAX_TITLE_CHARS = 300;
const MAX_SECTION_CHARS = 1_200;
const MAX_WORLD_SETTING_CHARS = 6_000;
const MAX_CAST_CHARS = 5_000;
const MAX_FACT_CHARS = 800;
const MAX_FACTS = 100;
const MAX_CHARACTERS = 50;
const MAX_ENTRY_POINTS = 20;
const MAX_MECHANICS = 30;
const MAX_WARNINGS = 100;
const MAX_WARNING_CHARS = 500;

const text = (value: unknown, max = MAX_SECTION_CHARS): string =>
    typeof value === 'string' ? value.trim().slice(0, max) : '';

const uniqueStrings = (values: readonly unknown[], maxItems = MAX_WARNINGS, maxChars = MAX_SECTION_CHARS): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const item = text(value, maxChars);
        if (!item || seen.has(item)) continue;
        seen.add(item);
        result.push(item);
        if (result.length >= maxItems) break;
    }
    return result;
};

const clamp = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
};

const positiveInteger = (value: unknown): number | undefined => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
    return Math.floor(value);
};

const stableHash = (value: string): string => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
};

function firstEvidence(value: { evidence?: readonly NovelEvidence[] }): NovelEvidence | undefined {
    return Array.isArray(value.evidence) && value.evidence.length > 0 ? value.evidence[0] : undefined;
}

function evidenceBasis(value: { evidence?: readonly NovelEvidence[] }): NovelEvidenceBasis {
    return firstEvidence(value)?.basis ?? 'unknown';
}

function sourceFromAnalysis(
    analysis: NovelAnalysis,
    options: EchoesNovelWorldDraftOptions,
): EchoesNovelSourceRef {
    const sourceOverride = options.source ?? {};
    const title = text(sourceOverride.title || analysis.sourceTitle || analysis.title, MAX_TITLE_CHARS) || '未命名原著';
    const fileName = text(sourceOverride.fileName || analysis.sourceFileName, MAX_TITLE_CHARS);
    const sourceKind = sourceOverride.kind || (
        fileName
            ? 'uploaded'
            : analysis.sourceKind === 'uploaded' || analysis.sourceKind === 'named' || analysis.sourceKind === 'described'
                ? analysis.sourceKind
                : 'unknown'
    );
    const format = sourceOverride.format || (
        /\.epub$/i.test(fileName) ? 'epub' : /\.txt$/i.test(fileName) ? 'txt' : undefined
    );
    const sourceId = text(sourceOverride.id, 200) || `novel-${stableHash(`${title}|${analysis.author}|${fileName}`)}`;
    return normalizeNovelSourceRef({
        ...sourceOverride,
        id: sourceId,
        title,
        ...(text(sourceOverride.author || analysis.author, 200) ? { author: text(sourceOverride.author || analysis.author, 200) } : {}),
        ...(fileName ? { fileName } : {}),
        kind: sourceKind,
        ...(format ? { format } : {}),
    });
}

function appendSection(sections: string[], heading: string, values: readonly string[]): void {
    const filtered = values.map(value => text(value)).filter(Boolean);
    if (filtered.length) sections.push(`【${heading}】\n${filtered.map(value => `- ${value}`).join('\n')}`);
}

function buildWorldSetting(analysis: NovelAnalysis): string {
    const sections: string[] = [];
    if (text(analysis.worldSummary, 2_000)) sections.push(`【世界概览】\n${text(analysis.worldSummary, 2_000)}`);
    if (text(analysis.era, 500)) sections.push(`【时代与背景】\n${text(analysis.era, 500)}`);
    appendSection(sections, '具体题材', uniqueStrings(analysis.specificGenres, 30, 200));
    appendSection(sections, '主题', uniqueStrings(analysis.themes, 30, 300));
    appendSection(sections, '主要地点', uniqueStrings(analysis.locations, 30, 300));
    if (text(analysis.tone, 500)) sections.push(`【氛围】\n${text(analysis.tone, 500)}`);
    if (analysis.worldRules.length) {
        appendSection(sections, '已识别世界规则（均需玩家确认后锁定）', analysis.worldRules.map(rule => {
            const category = text(rule.category, 100);
            return category ? `${rule.text}（${category}）` : rule.text;
        }));
    }
    if (analysis.gameplaySignals.length) {
        appendSection(sections, '潜在玩法信号（仅作可选增强）', analysis.gameplaySignals.map(signal => `${signal.name}：${signal.description}`));
    }
    if (!sections.length) return '尚未从有限原著片段中提取出足够的世界设定；请在创建前补充。';
    return sections.join('\n\n').slice(0, MAX_WORLD_SETTING_CHARS);
}

function buildCast(analysis: NovelAnalysis, maxCharacters: number): string {
    const entries: string[] = [];
    const hasProtagonist = maxCharacters > 0 && Boolean(analysis.protagonist?.name || analysis.protagonist?.identity);
    if (hasProtagonist && analysis.protagonist) {
        const protagonist = analysis.protagonist;
        entries.push(`【原著主角】${text(protagonist.name, 200) || '未命名'}：${text(protagonist.identity, 500) || '身份未知'}。`);
        if (protagonist.personality.length) entries.push(`性格：${uniqueStrings(protagonist.personality, 8, 180).join('、')}。`);
        if (protagonist.goals.length) entries.push(`目标：${uniqueStrings(protagonist.goals, 8, 180).join('、')}。`);
        if (protagonist.abilities.length) entries.push(`能力：${uniqueStrings(protagonist.abilities, 8, 180).join('、')}。`);
    }
    const mainCharacterLimit = Math.max(0, maxCharacters - (hasProtagonist ? 1 : 0));
    for (const character of analysis.mainCharacters.slice(0, mainCharacterLimit)) {
        const name = text(character.name, 200) || `人物${entries.length + 1}`;
        const details = [
            text(character.identity, 300),
            character.relationshipToProtagonist ? `与主角关系：${text(character.relationshipToProtagonist, 300)}` : '',
            character.personality.length ? `性格：${uniqueStrings(character.personality, 6, 150).join('、')}` : '',
            character.goals.length ? `目标：${uniqueStrings(character.goals, 6, 150).join('、')}` : '',
        ].filter(Boolean);
        entries.push(`【${character.isProtagonist ? '主角' : '主要人物'}】${name}${details.length ? `：${details.join('；')}。` : ''}`);
    }
    return entries.join('\n').slice(0, MAX_CAST_CHARS) || '主要人物将根据玩家选择和后续正文逐步建立；不要凭空补全人物。';
}

function factSuggestion(
    id: string,
    value: string,
    source: { evidence?: readonly NovelEvidence[] },
    confidence: number,
): EchoesNovelFactSuggestion | null {
    const fact = text(value, MAX_FACT_CHARS);
    if (!fact) return null;
    const evidence = firstEvidence(source);
    return {
        id: text(id, 160) || `fact-${stableHash(fact)}`,
        text: fact,
        confidence: clamp(confidence),
        basis: evidenceBasis(source),
        ...(evidence?.chapterId ? { chapterId: text(evidence.chapterId, 160) } : {}),
        ...(positiveInteger(evidence?.chapterIndex) !== undefined ? { chapterIndex: positiveInteger(evidence?.chapterIndex) } : {}),
        requiresConfirmation: true,
    };
}

function buildHardFactSuggestions(analysis: NovelAnalysis, maxFacts: number): EchoesNovelFactSuggestion[] {
    const result: EchoesNovelFactSuggestion[] = [];
    for (const rule of analysis.worldRules) {
        const item = factSuggestion(`world-rule-${rule.id}`, rule.text, rule, rule.confidence);
        if (item) result.push(item);
    }
    return result.slice(0, maxFacts);
}

function buildKnownFactSuggestions(analysis: NovelAnalysis, maxFacts: number): EchoesNovelFactSuggestion[] {
    const result: EchoesNovelFactSuggestion[] = [];
    if (analysis.protagonist) {
        const protagonist = analysis.protagonist;
        const identity = [
            protagonist.name ? `原著主角名为${text(protagonist.name, 160)}` : '',
            protagonist.identity ? `身份：${text(protagonist.identity, 400)}` : '',
        ].filter(Boolean).join('；');
        const identityFact = factSuggestion('protagonist-identity', identity, protagonist, protagonist.confidence);
        if (identityFact) result.push(identityFact);
    }
    for (const character of analysis.mainCharacters) {
        const fact = factSuggestion(
            `character-${character.id}`,
            `${text(character.name, 160) || '未命名人物'}：${text(character.identity, 300) || '身份未知'}${character.relationshipToProtagonist ? `；与主角关系：${text(character.relationshipToProtagonist, 300)}` : ''}`,
            character,
            character.confidence,
        );
        if (fact) result.push(fact);
    }
    return result.slice(0, maxFacts);
}

function entryPointFromAnalysis(point: NovelRecommendedEntryPoint): EchoesEntryPoint | null {
    const label = text(point.label, 300);
    if (!label) return null;
    return {
        ...(text(point.chapterId, 160) ? { chapterId: text(point.chapterId, 160) } : {}),
        ...(positiveInteger(point.chapterIndex) !== undefined ? { chapterIndex: positiveInteger(point.chapterIndex) } : {}),
        label,
        ...(text(point.reason, 900) ? { description: text(point.reason, 900) } : {}),
        source: 'ai',
    };
}

function buildEntryPoints(analysis: NovelAnalysis): EchoesEntryPoint[] {
    const seen = new Set<string>();
    const result: EchoesEntryPoint[] = [];
    const sourcePoints = analysis.recommendedEntryPoints.slice();
    const preferredIndex = sourcePoints.findIndex((point) => point.suitableForCrossover === true);
    const pointsToNormalize = sourcePoints.slice(0, MAX_ENTRY_POINTS);
    if (preferredIndex >= MAX_ENTRY_POINTS && pointsToNormalize.length >= MAX_ENTRY_POINTS) {
        pointsToNormalize[MAX_ENTRY_POINTS - 1] = sourcePoints[preferredIndex];
    }
    for (const point of pointsToNormalize) {
        const normalized = entryPointFromAnalysis(point);
        if (!normalized) continue;
        const key = `${normalized.chapterId || ''}|${normalized.chapterIndex ?? ''}|${normalized.label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(normalized);
    }
    if (result.length) return result;
    return [{ label: '原著开头', source: 'novel' }];
}

function sameEntryPoint(entry: EchoesEntryPoint, point: NovelRecommendedEntryPoint): boolean {
    const label = text(point.label, 300);
    if (!label || entry.label !== label) return false;
    const chapterId = text(point.chapterId, 160);
    const chapterIndex = positiveInteger(point.chapterIndex);
    if (chapterId && entry.chapterId !== chapterId) return false;
    if (chapterIndex !== undefined && entry.chapterIndex !== chapterIndex) return false;
    return true;
}

function chooseDefaultEntryPoint(
    analysis: NovelAnalysis,
    entryPoints: EchoesEntryPoint[],
): EchoesEntryPoint {
    const preferred = analysis.recommendedEntryPoints.find((point) => point.suitableForCrossover === true);
    if (preferred) {
        const exact = entryPoints.find((entry) => sameEntryPoint(entry, preferred));
        if (exact) return exact;
    }
    return entryPoints[0] ?? { label: '原著开头', source: 'novel' };
}

function buildWritingGuide(analysis: NovelAnalysis): EchoesNovelWorldDraft['writingGuide'] {
    const themes = uniqueStrings(analysis.themes, 8, 200);
    const warnings = uniqueStrings(analysis.contentWarnings, 8, 200);
    const instructions = [
        '这是基于有限原著片段的分析，不是完整剧本；缺失信息必须保留为空或明确标记未知。',
        themes.length ? `优先保持主题：${themes.join('、')}。` : '',
        warnings.length ? `注意内容边界：${warnings.join('、')}。` : '',
    ].filter(Boolean).join('\n');
    return {
        style: text(analysis.writingStyle, 500),
        tone: text(analysis.tone, 500),
        perspective: '',
        minWords: 0,
        maxWords: 0,
        contextRounds: 8,
        authorInstructions: instructions.slice(0, 2_000),
    };
}

function normalizeLimits(options: EchoesNovelWorldDraftOptions): { maxCharacters: number; maxFacts: number; maxMechanics: number } {
    const limit = (value: number | undefined, fallback: number): number =>
        typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
    return {
        maxCharacters: limit(options.maxCharacters, MAX_CHARACTERS),
        maxFacts: limit(options.maxFacts, MAX_FACTS),
        maxMechanics: limit(options.maxMechanics, MAX_MECHANICS),
    };
}

/**
 * Projects a normalized novel analysis into a user-reviewable Echoes creation
 * draft. It never creates a world, locks facts, or turns mechanic hints into
 * active mechanic instances.
 */
export function buildEchoesNovelWorldDraft(
    analysis: NovelAnalysis,
    options: EchoesNovelWorldDraftOptions = {},
): EchoesNovelWorldDraft {
    const limits = normalizeLimits(options);
    const title = text(options.title || analysis.title || analysis.sourceTitle, MAX_TITLE_CHARS) || '未命名 Echoes 世界';
    const entryPoints = buildEntryPoints(analysis);
    const defaultEntryPoint = chooseDefaultEntryPoint(analysis, entryPoints);
    const registeredMechanicHints = analysis.mechanicHints
        .filter((hint) => isRegisteredNovelAnalysisMechanicKind(hint.kind));
    const safeMechanicHints = registeredMechanicHints
        .slice(0, limits.maxMechanics)
        .map((hint): NovelMechanicHint => ({
            kind: hint.kind,
            title: text(hint.title, 300),
            reason: text(hint.reason, 1_000),
            trigger: hint.trigger,
            confidence: clamp(hint.confidence),
        }));
    const droppedMechanicCount = analysis.mechanicHints.length - registeredMechanicHints.length;
    const warnings = uniqueStrings([
        ...(droppedMechanicCount > 0 ? ['存在未注册机制，已从世界草稿建议中移除。'] : []),
        ...analysis.analysisWarnings,
        ...(analysis.unsupportedMechanics.length ? ['存在未注册机制，不能直接启用，只能作为人工设计参考。'] : []),
    ], MAX_WARNINGS, MAX_WARNING_CHARS);

    return {
        workflowVersion: 'echoes-novel-world-draft/1',
        title,
        worldSetting: buildWorldSetting(analysis),
        playerIdentity: '',
        playerGoal: '',
        cast: buildCast(analysis, limits.maxCharacters),
        writingGuide: buildWritingGuide(analysis),
        formattingPreference: 'novel',
        entryPoints,
        defaultEntryPoint,
        source: sourceFromAnalysis(analysis, options),
        suggestedHardFacts: buildHardFactSuggestions(analysis, limits.maxFacts),
        suggestedKnownFacts: buildKnownFactSuggestions(analysis, limits.maxFacts),
        mechanicHints: safeMechanicHints,
        contentWarnings: uniqueStrings(analysis.contentWarnings, MAX_WARNINGS, MAX_WARNING_CHARS),
        analysisWarnings: options.includeAnalysisWarnings === false ? [] : warnings,
    };
}

/** Builds only the source reference when a caller does not need a full draft. */
export function createEchoesNovelSourceRef(
    analysis: NovelAnalysis,
    source: Partial<EchoesNovelSourceRef> = {},
): EchoesNovelSourceRef {
    return sourceFromAnalysis(analysis, { source });
}
