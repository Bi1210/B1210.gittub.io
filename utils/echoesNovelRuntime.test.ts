import { describe, expect, it } from 'vitest';
import { parseNovelText } from './echoesNovelParser';
import { createEchoesNovelProfile } from './echoesNovelProfile';
import { buildEchoesNovelRuntimeContext } from './echoesNovelRuntime';

const analysis = {
    schemaVersion: 1,
    title: '雾中城',
    author: '作者',
    sourceKind: 'uploaded',
    sourceTitle: '雾中城',
    sourceFileName: 'mist.txt',
    sourceChapterIds: ['chapter-1'],
    sourceChapterTitles: ['第一章 雾中城'],
    sourceExcerpt: '短片段',
    worldSummary: '城市被规则和持续的雾笼罩。',
    era: '近未来',
    locations: ['雾城'],
    specificGenres: ['无限流', '末世直播'],
    themes: ['生存'],
    tone: '冷峻',
    writingStyle: '克制细腻',
    language: 'zh-CN',
    protagonist: null,
    mainCharacters: [],
    worldRules: [],
    gameplaySignals: [],
    mechanicHints: [],
    unsupportedMechanics: [],
    plotPoints: [],
    recommendedEntryPoints: [],
    contentWarnings: [],
    missingInformation: [],
    analysisWarnings: [],
    createdAt: '2026-08-08T00:00:00.000Z',
};

const document = parseNovelText([
    '第1章 雾中城',
    '林舟进入雾城。这里是正文锚点。',
    '',
    '第2章 规则',
    '第二章出现了另一条规则。',
].join('\n'), { fileName: 'mist.txt' });

describe('Echoes novel runtime context', () => {
    it('combines validated analysis and bounded source context', () => {
        const profile = createEchoesNovelProfile(analysis, {
            source: { title: '雾中城', kind: 'uploaded', fileName: 'mist.txt' },
            document: { fileName: 'mist.txt', format: 'txt', parserVersion: 'parser/1', chapterCount: 2 },
            now: 100,
        }).profile;
        const result = buildEchoesNovelRuntimeContext({
            profile,
            document,
            options: { maxPromptChars: 900, maxChars: 300, uniformChapterCount: 0 },
        });

        expect(result.runtimeVersion).toBe('echoes-novel-runtime/1');
        expect(result.available).toBe(true);
        expect(result.analysisIncluded).toBe(true);
        expect(result.sourceIncluded).toBe(true);
        expect(result.text).toContain('雾中城');
        expect(result.text).toContain('林舟进入雾城');
        expect(result.text.length).toBeLessThanOrEqual(900);
        expect(result.sourceChapterIds).toContain('chapter-1');
        expect(result.text).not.toContain(document.normalizedText + 'x');
    });

    it('can run from persisted profile metadata without a loaded source document', () => {
        const profile = createEchoesNovelProfile(analysis, { now: 100 }).profile;
        const result = buildEchoesNovelRuntimeContext({ profile, options: { maxPromptChars: 700 } });
        expect(result.available).toBe(true);
        expect(result.analysisIncluded).toBe(true);
        expect(result.sourceIncluded).toBe(false);
        expect(result.context).toBeNull();
        expect(result.warnings).toContain('当前未加载原著正文，仅可使用已保存的分析元数据。');
    });

    it('skips invalid profile metadata instead of injecting it', () => {
        const profile = createEchoesNovelProfile(analysis, { now: 100 }).profile as any;
        profile.analysis.normalizedText = 'FULL NOVEL SHOULD NEVER BE USED';
        const result = buildEchoesNovelRuntimeContext({ profile, document });
        expect(result.analysisIncluded).toBe(false);
        expect(result.text).not.toContain('FULL NOVEL SHOULD NEVER BE USED');
        expect(result.warnings).toContain('小说资料未通过校验，已跳过分析元数据。');
    });

    it('respects include flags and query selection', () => {
        const profile = createEchoesNovelProfile(analysis, { now: 100 }).profile;
        const result = buildEchoesNovelRuntimeContext({
            profile,
            document,
            options: {
                includeAnalysis: false,
                query: '另一条规则',
                includeOpening: false,
                uniformChapterCount: 0,
                maxPromptChars: 1_200,
            },
        });
        expect(result.analysisIncluded).toBe(false);
        expect(result.context?.segments.some(segment => segment.chapterId === 'chapter-2')).toBe(true);
        expect(result.sourceChapterIds).toContain('chapter-2');
    });
});
