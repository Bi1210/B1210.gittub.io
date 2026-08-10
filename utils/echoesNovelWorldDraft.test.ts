import { describe, expect, it } from 'vitest';
import { buildEchoesNovelWorldDraft, createEchoesNovelSourceRef } from './echoesNovelWorldDraft';
import type { NovelAnalysis } from './echoesNovelAnalysisTypes';

const analysis: NovelAnalysis = {
    schemaVersion: 1,
    title: '雾中城',
    author: '测试作者',
    sourceKind: 'uploaded',
    sourceTitle: '雾中城',
    sourceFileName: 'mist.txt',
    sourceChapterIds: ['chapter-1', 'chapter-3'],
    sourceChapterTitles: ['第一章', '第三章'],
    sourceExcerpt: '短片段',
    worldSummary: '城市被持续的雾笼罩，进入者必须遵守副本规则。',
    era: '近未来都市',
    locations: ['雾城', '旧训练场'],
    specificGenres: ['无限流', '末世直播'],
    themes: ['生存', '选择'],
    tone: '冷峻悬疑',
    writingStyle: '细腻克制',
    language: 'zh-CN',
    protagonist: {
        name: '林舟',
        identity: '误入副本的普通人',
        personality: ['谨慎'],
        goals: ['活下去'],
        abilities: ['观察规则'],
        evidence: [{ quote: '林舟进入副本', chapterId: 'chapter-1', basis: 'source' }],
        confidence: 0.9,
    },
    mainCharacters: [{
        id: 'char-1',
        name: '叶修',
        identity: '退役选手',
        personality: ['沉着'],
        goals: ['重返赛场'],
        relationshipToProtagonist: '暂时合作',
        isProtagonist: false,
        evidence: [{ quote: '叶修回到训练场', chapterId: 'chapter-2', basis: 'source' }],
        confidence: 0.8,
    }],
    worldRules: [{
        id: 'rule-1',
        text: '进入副本后不能无视已公布的规则。',
        category: 'must',
        evidence: [{ quote: '必须遵守规则', chapterId: 'chapter-1', basis: 'source' }],
        confidence: 0.75,
    }],
    gameplaySignals: [{
        id: 'signal-1',
        name: '副本选择',
        description: '玩家可以在多个副本之间选择。',
        evidence: [],
        confidence: 0.7,
    }],
    mechanicHints: [{
        kind: 'scenario_picker',
        title: '副本选择',
        reason: '存在多个副本入口。',
        trigger: 'choice',
        confidence: 0.7,
    }],
    unsupportedMechanics: [],
    plotPoints: [],
    recommendedEntryPoints: [{
        label: '从雾城入口开始',
        chapterId: 'chapter-1',
        chapterIndex: 0,
        reason: '保留原著开场压力。',
        suitableForCrossover: true,
        confidence: 0.8,
    }],
    contentWarnings: ['含有生存压力'],
    missingInformation: [],
    analysisWarnings: [],
    createdAt: '2026-08-08T00:00:00.000Z',
};

describe('Echoes novel world draft adapter', () => {
    it('projects analysis into a bounded, reviewable world draft', () => {
        const draft = buildEchoesNovelWorldDraft(analysis);
        expect(draft.workflowVersion).toBe('echoes-novel-world-draft/1');
        expect(draft.title).toBe('雾中城');
        expect(draft.worldSetting).toContain('无限流');
        expect(draft.worldSetting).toContain('副本选择');
        expect(draft.cast).toContain('林舟');
        expect(draft.cast).toContain('叶修');
        expect(draft.writingGuide.style).toBe('细腻克制');
        expect(draft.writingGuide.tone).toBe('冷峻悬疑');
        expect(draft.playerIdentity).toBe('');
        expect(draft.playerGoal).toBe('');
        expect(draft.suggestedHardFacts[0].requiresConfirmation).toBe(true);
        expect(draft.suggestedHardFacts[0].basis).toBe('source');
        expect(draft.mechanicHints.map(item => item.kind)).toEqual(['scenario_picker']);
        expect(draft.defaultEntryPoint.chapterId).toBe('chapter-1');
    });

    it('does not activate mechanics or lock facts and applies limits', () => {
        const expanded: NovelAnalysis = {
            ...analysis,
            mainCharacters: Array.from({ length: 5 }, (_, index) => ({
                ...analysis.mainCharacters[0], id: `char-${index}`, name: `人物${index}`,
            })),
            worldRules: Array.from({ length: 5 }, (_, index) => ({
                ...analysis.worldRules[0], id: `rule-${index}`, text: `规则${index}`,
            })),
        };
        const draft = buildEchoesNovelWorldDraft(expanded, { maxCharacters: 2, maxFacts: 2, maxMechanics: 0 });
        expect(draft.suggestedHardFacts).toHaveLength(2);
        expect(draft.suggestedKnownFacts).toHaveLength(2);
        expect(draft.mechanicHints).toEqual([]);
        expect(draft).not.toHaveProperty('mechanics');
    });

    it('creates deterministic source references without storing source text', () => {
        const first = createEchoesNovelSourceRef(analysis);
        const second = createEchoesNovelSourceRef(analysis);
        expect(first).toEqual(second);
        expect(first.kind).toBe('uploaded');
        expect(first.format).toBe('txt');
        expect(first.id).toMatch(/^novel-/);
        expect(first).not.toHaveProperty('normalizedText');
        expect(first).not.toHaveProperty('sourceExcerpt');
    });

    it('allows callers to suppress diagnostic analysis warnings', () => {
        const draft = buildEchoesNovelWorldDraft({ ...analysis, analysisWarnings: ['需要人工复核'] }, { includeAnalysisWarnings: false });
        expect(draft.analysisWarnings).toEqual([]);
    });
});
