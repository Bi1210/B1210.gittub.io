import { describe, expect, it } from 'vitest';
import {
    createEchoesNovelProfile,
    normalizeEchoesNovelProfile,
    validateEchoesNovelProfile,
} from './echoesNovelProfile';
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
    worldSummary: '城市被持续的雾笼罩。',
    era: '近未来都市',
    locations: ['雾城'],
    specificGenres: ['无限流', '末世直播'],
    themes: ['生存'],
    tone: '冷峻',
    writingStyle: '克制',
    language: 'zh-CN',
    protagonist: null,
    mainCharacters: [],
    worldRules: [],
    gameplaySignals: [],
    mechanicHints: [{
        kind: 'scenario_picker',
        title: '副本选择',
        reason: '存在入口',
        trigger: 'choice',
        confidence: 0.8,
    }],
    unsupportedMechanics: [],
    plotPoints: [],
    recommendedEntryPoints: [
        {
            label: '普通入口',
            chapterId: 'chapter-1',
            chapterIndex: 0,
            reason: '先看背景',
            suitableForCrossover: false,
            confidence: 0.7,
        },
        {
            label: '推荐入口',
            chapterId: 'chapter-3',
            chapterIndex: 2,
            reason: '关系已展开',
            suitableForCrossover: true,
            confidence: 0.9,
        },
    ],
    contentWarnings: ['危险场景'],
    missingInformation: [],
    analysisWarnings: [],
    createdAt: '2026-08-08T00:00:00.000Z',
};

const profileOptions = {
    source: { id: '', kind: 'uploaded' as const },
    document: {
        fileName: 'mist.txt',
        format: 'txt' as const,
        parserVersion: 'echoes-novel-parser/1',
        chapterCount: 3,
        normalizedCharCount: 123456,
    },
    acceptedFactIds: ['fact-1', 'fact-1', '', 'fact-2'],
    enabledMechanicKinds: ['scenario_picker', 'scenario_picker', 'not_registered'],
    now: 1700000000000,
};

describe('Echoes novel profile creation', () => {
    it('创建 storage-safe profile，保留来源元数据和推荐入口', () => {
        const result = createEchoesNovelProfile(analysis, profileOptions);
        const profile = result.profile;

        expect(result.analysisParseResult.fallback).toBe(false);
        expect(profile.source.id).toMatch(/^novel-/);
        expect(profile.source.fileName).toBe('mist.txt');
        expect(profile.source.format).toBe('txt');
        expect(profile.source.chapterCount).toBe(3);
        expect(profile.source.normalizedCharCount).toBe(123456);
        expect(profile.entryPoint.label).toBe('推荐入口');
        expect(profile.entryPoint.chapterId).toBe('chapter-3');
        expect(profile.entryPoint.chapterIndex).toBe(2);
        expect(profile.entryPoint.source).toBe('ai');
        expect(profile.acceptedFactIds).toEqual(['fact-1', 'fact-2']);
        expect(profile.enabledMechanicKinds).toEqual(['scenario_picker']);
        expect(profile.createdAt).toBe(1700000000000);
        expect(profile.updatedAt).toBe(1700000000000);
        expect(result.warnings.join(' ')).toMatch(/未注册/);
        expect(profile).not.toHaveProperty('normalizedText');
        expect(profile).not.toHaveProperty('rawText');
    });

    it('推荐入口缺失时安全回退原著开头', () => {
        const result = createEchoesNovelProfile({
            ...analysis,
            recommendedEntryPoints: [],
        }, { now: 1700000000000 });

        expect(result.profile.entryPoint).toEqual({ label: '原著开头', source: 'novel' });
    });

    it('非法分析返回安全 fallback，不编造人物和剧情', () => {
        const result = createEchoesNovelProfile('{not-json', {
            source: { title: '外部来源', fileName: 'source.txt', kind: 'uploaded' },
            now: 1700000000000,
        });

        expect(result.analysisParseResult.fallback).toBe(true);
        expect(result.profile.analysis.protagonist).toBeNull();
        expect(result.profile.analysis.mainCharacters).toEqual([]);
        expect(result.profile.analysis.plotPoints).toEqual([]);
        expect(result.profile.source.title).toBe('外部来源');
    });
});

describe('Echoes novel profile import and validation', () => {
    it('导入时清洗未知分析字段、去重事实并保留时间戳', () => {
        const created = createEchoesNovelProfile(analysis, { now: 1700000000000 }).profile;
        const imported = normalizeEchoesNovelProfile({
            ...created,
            createdAt: 1600000000000,
            updatedAt: 1600000005000,
            acceptedFactIds: ['a', 'a', 'b'],
            analysis: { ...created.analysis, unknownField: 'remove me' },
            unknownProfileField: 'remove me',
        } as any, { now: 1700000010000 });

        expect(imported.profile.createdAt).toBe(1600000000000);
        expect(imported.profile.updatedAt).toBe(1600000005000);
        expect(imported.profile.acceptedFactIds).toEqual(['a', 'b']);
        expect(imported.profile.analysis).not.toHaveProperty('unknownField');
        expect(imported.profile).not.toHaveProperty('unknownProfileField');
    });

    it('输入含 normalizedText 时不静默保存，归一化结果不泄漏全文', () => {
        const fullText = '这是整本小说正文。'.repeat(1_000);
        const result = createEchoesNovelProfile({
            ...analysis,
            normalizedText: fullText,
            rawResponse: fullText,
        } as any, { now: 1700000000000 });

        expect(result.warnings.join(' ')).toMatch(/禁止保存字段|normalizedText/);
        expect(JSON.stringify(result.profile)).not.toContain(fullText);
        expect(JSON.stringify(result.profile)).not.toContain('normalizedText');
        expect(validateEchoesNovelProfile(result.profile).valid).toBe(true);

        const invalidImported = validateEchoesNovelProfile({
            ...result.profile,
            normalizedText: fullText,
        } as any);
        expect(invalidImported.valid).toBe(false);
        expect(invalidImported.errors.join(' ')).toMatch(/normalizedText/);
    });

    it('profile schema、来源、入口和机制校验可拒绝非法输入', () => {
        const profile = createEchoesNovelProfile(analysis, { now: 1700000000000 }).profile;
        const validation = validateEchoesNovelProfile({
            ...profile,
            schemaVersion: 999,
            source: { ...profile.source, id: '', kind: 'bad', format: 'pdf', chapterCount: -1 },
            entryPoint: { ...profile.entryPoint, source: 'bad' },
            enabledMechanicKinds: ['scenario_picker', 'not_registered'],
            createdAt: -1,
            updatedAt: 1.5,
        } as any);

        expect(validation.valid).toBe(false);
        expect(validation.errors.join(' ')).toMatch(/版本|稳定 ID|kind|format|chapterCount|入口来源|机制|createdAt/);
    });

    it('相同输入和 now 得到确定结构', () => {
        const first = createEchoesNovelProfile(analysis, { now: 1700000000000 });
        const second = createEchoesNovelProfile(analysis, { now: 1700000000000 });
        expect(first).toEqual(second);
    });
});
