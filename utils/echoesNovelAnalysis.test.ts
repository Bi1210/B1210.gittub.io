import { describe, expect, it } from 'vitest';
import {
    buildNovelAnalysisPrompt,
    createNovelAnalysisFallback,
    isRegisteredNovelAnalysisMechanicKind,
    parseNovelAnalysisResult,
    validateNovelAnalysis,
} from './echoesNovelAnalysis';

const sourceOptions = {
    sourceKind: 'novel_context',
    sourceTitle: '星海直播间',
    sourceFileName: 'star-sea.txt',
    sourceChapterIds: ['chapter-3'],
    sourceChapterTitles: ['第3章 试播'],
    createdAt: '2026-08-08T00:00:00.000Z',
};

const validPayload = {
    schemaVersion: 1,
    title: '星海直播间',
    author: '作者甲',
    worldSummary: '主角在末世直播任务中探索副本，并面对舆论与资源竞争。',
    era: '近未来末世',
    locations: ['安全区', '废墟副本'],
    specificGenres: ['末世直播', '娱乐圈无限流'],
    themes: ['生存', '舆论'],
    tone: '紧张',
    writingStyle: '快节奏群像',
    language: 'zh-CN',
    protagonist: {
        name: '林舟',
        identity: '新人主播',
        personality: ['谨慎'],
        goals: ['完成直播任务'],
        abilities: ['观察'],
        evidence: [{ quote: '林舟打开直播间。', chapterId: 'chapter-3', basis: 'source' }],
        confidence: 0.9,
    },
    mainCharacters: [{
        id: 'ye-xiu',
        name: '叶修',
        identity: '队友',
        personality: ['冷静'],
        goals: ['离开副本'],
        relationshipToProtagonist: '临时队友',
        isProtagonist: false,
        evidence: [{ quote: '叶修查看倒计时。', chapterId: 'chapter-3', basis: 'source' }],
        confidence: 0.8,
    }],
    worldRules: [{
        id: 'rule-1',
        text: '副本开启后不能离开。',
        category: 'conditional',
        evidence: [{ quote: '倒计时结束前不得离场。', basis: 'source' }],
        confidence: 0.85,
    }],
    gameplaySignals: [
        { id: 'signal-1', name: '弹幕', description: '观众实时评论。', evidence: [], confidence: 0.8 },
        { id: 'signal-2', name: '副本选择', description: '进入不同任务场景。', evidence: [], confidence: 0.8 },
        { id: 'signal-3', name: '倒计时', description: '任务剩余时间。', evidence: [], confidence: 0.8 },
    ],
    mechanicHints: [
        { kind: 'danmaku_stream', title: '观众弹幕', reason: '原文存在实时评论。', trigger: 'scene', confidence: 0.85 },
        { kind: 'scenario_picker', title: '副本选择', reason: '存在任务场景选择。', trigger: 'choice', confidence: 0.8 },
        { kind: 'countdown', title: '任务倒计时', reason: '存在时间限制。', trigger: 'always', confidence: 0.9 },
    ],
    plotPoints: [{
        id: 'plot-1',
        chapterId: 'chapter-3',
        chapterIndex: 2,
        chapterHint: '第3章 试播',
        title: '首次试播',
        summary: '林舟首次进入副本直播。',
        suitableForEntry: true,
        confidence: 0.8,
        evidence: [{ quote: '欢迎来到试播副本。', chapterId: 'chapter-3', basis: 'source' }],
    }],
    recommendedEntryPoints: [{
        label: '试播开始',
        chapterId: 'chapter-3',
        chapterIndex: 2,
        reason: '规则和关系都刚刚展开。',
        suitableForCrossover: true,
        confidence: 0.75,
    }],
    contentWarnings: ['危险场景'],
    missingInformation: [],
    analysisWarnings: [],
};

function parsed(value: unknown) {
    return parseNovelAnalysisResult(value, sourceOptions);
}

describe('Echoes novel analysis parsing', () => {
    it('解析普通 JSON 并保留具体玩法与混合题材', () => {
        const result = parsed(JSON.stringify(validPayload));

        expect(result.fallback).toBe(false);
        expect(result.validation.valid).toBe(true);
        expect(result.analysis.specificGenres).toEqual(['末世直播', '娱乐圈无限流']);
        expect(result.analysis.gameplaySignals.map((item) => item.name)).toEqual(['弹幕', '副本选择', '倒计时']);
        expect(result.analysis.mechanicHints.map((item) => item.kind)).toEqual([
            'danmaku_stream',
            'scenario_picker',
            'countdown',
        ]);
        expect(result.analysis.sourceChapterIds).toEqual(['chapter-3']);
    });

    it('解析 Markdown JSON 代码块与前后解释文字', () => {
        const fenced = `分析如下：\n\n\`\`\`json\n${JSON.stringify(validPayload)}\n\`\`\`\n\n以上。`;
        const wrapped = `这里是摘要。 ${JSON.stringify(validPayload)} 结束。`;

        expect(parsed(fenced).analysis.title).toBe('星海直播间');
        expect(parsed(wrapped).analysis.author).toBe('作者甲');
    });

    it('解析 OpenAI choices[0].message.content', () => {
        const result = parsed({
            choices: [{ message: { content: JSON.stringify(validPayload) } }],
        });

        expect(result.fallback).toBe(false);
        expect(result.analysis.protagonist?.name).toBe('林舟');
    });

    it('错误 JSON 和空响应返回安全 fallback，并保留有界 rawText', () => {
        const invalid = parseNovelAnalysisResult('{ not json', { ...sourceOptions, rawTextMaxChars: 5 });
        const empty = parsed('');

        expect(invalid.fallback).toBe(true);
        expect(invalid.rawText).toBe('{ not');
        expect(invalid.analysis.mainCharacters).toEqual([]);
        expect(invalid.analysis.protagonist).toBeNull();
        expect(invalid.analysis.analysisWarnings.join(' ')).toMatch(/JSON/);
        expect(empty.fallback).toBe(true);
        expect(empty.analysis.missingInformation).toContain('protagonist');
    });

    it('缺字段、字段类型错误和未知字段安全清洗', () => {
        const result = parsed(JSON.stringify({
            schemaVersion: 'broken',
            title: 123,
            specificGenres: '娱乐圈',
            protagonist: 'not object',
            mainCharacters: {},
            worldRules: 'bad',
            gameplaySignals: 'bad',
            plotPoints: 'bad',
            recommendedEntryPoints: 'bad',
            unknownField: 'ignored',
        }));

        expect(result.fallback).toBe(false);
        expect(result.analysis.title).toBe('星海直播间');
        expect(result.analysis.specificGenres).toEqual([]);
        expect(result.analysis.protagonist).toBeNull();
        expect(result.analysis.mainCharacters).toEqual([]);
        expect(result.analysis).not.toHaveProperty('unknownField');
        expect(result.analysis.missingInformation).toContain('worldSummary');
        expect(result.analysis.analysisWarnings.join(' ')).toMatch(/schemaVersion/);
    });

    it('保留娱乐圈与无限流的具体玩法，不压缩成固定模板', () => {
        const result = parsed(JSON.stringify({
            ...validPayload,
            specificGenres: ['娱乐圈', '无限流', '娱乐圈无限流'],
            gameplaySignals: [
                { id: 'a', name: '热搜', description: '公众榜单', evidence: [], confidence: 0.8 },
                { id: 'b', name: '直播', description: '实时播出', evidence: [], confidence: 0.8 },
                { id: 'c', name: '隐藏规则', description: '副本规则', evidence: [], confidence: 0.8 },
                { id: 'd', name: '积分', description: '副本结算积分', evidence: [], confidence: 0.8 },
            ],
            mechanicHints: [
                { kind: 'trending_board', title: '热搜', reason: '榜单', trigger: 'event', confidence: 0.8 },
                { kind: 'live_room', title: '直播间', reason: '直播', trigger: 'scene', confidence: 0.8 },
                { kind: 'rules_panel', title: '规则', reason: '隐藏规则', trigger: 'chapter_start', confidence: 0.8 },
                { kind: 'leaderboard', title: '积分', reason: '结算', trigger: 'chapter_end', confidence: 0.8 },
            ],
        }));

        expect(result.analysis.specificGenres).toEqual(['娱乐圈', '无限流', '娱乐圈无限流']);
        expect(result.analysis.gameplaySignals.map((item) => item.name)).toEqual(['热搜', '直播', '隐藏规则', '积分']);
        expect(result.analysis.mechanicHints.map((item) => item.kind)).toEqual([
            'trending_board', 'live_room', 'rules_panel', 'leaderboard',
        ]);
    });

    it('未注册机制不会进入 mechanicHints，而是转为 unsupportedMechanics', () => {
        const result = parsed(JSON.stringify({
            ...validPayload,
            mechanicHints: [
                { kind: 'danmaku_stream', title: '弹幕', reason: '有效', trigger: 'scene', confidence: 0.8 },
                { kind: 'custom_magic_board', title: '魔法面板', reason: '未注册', trigger: 'scene', confidence: 1.2 },
            ],
        }));

        expect(result.analysis.mechanicHints).toHaveLength(1);
        expect(result.analysis.mechanicHints[0].kind).toBe('danmaku_stream');
        expect(result.analysis.unsupportedMechanics[0]).toMatchObject({ requestedKind: 'custom_magic_board', confidence: 1 });
        expect(result.analysis.analysisWarnings.join(' ')).toMatch(/未注册/);
        expect(isRegisteredNovelAnalysisMechanicKind('custom_magic_board')).toBe(false);
        expect(isRegisteredNovelAnalysisMechanicKind('generic_panel')).toBe(true);
    });

    it('限制 evidence、角色、plotPoints 和 confidence，不保存大段引文', () => {
        const longQuote = '原文'.repeat(400);
        const result = parsed(JSON.stringify({
            ...validPayload,
            protagonist: {
                ...validPayload.protagonist,
                confidence: 2,
                evidence: Array.from({ length: 8 }, () => ({ quote: longQuote, basis: 'source' })),
            },
            mainCharacters: Array.from({ length: 60 }, (_, index) => ({
                ...validPayload.mainCharacters[0], id: `c-${index}`, name: `角色${index}`,
            })),
            plotPoints: Array.from({ length: 25 }, (_, index) => ({
                ...validPayload.plotPoints[0], id: `p-${index}`,
            })),
        }));

        expect(result.analysis.protagonist?.confidence).toBe(1);
        expect(result.analysis.protagonist?.evidence).toHaveLength(5);
        expect(result.analysis.protagonist?.evidence[0].quote.length).toBeLessThanOrEqual(500);
        expect(result.analysis.mainCharacters).toHaveLength(50);
        expect(result.analysis.plotPoints).toHaveLength(20);
        expect(result.analysis.protagonist?.evidence[0].quote).not.toBe(longQuote);
    });

    it('相同输入得到稳定结构，且 fallback 不编造人物或剧情', () => {
        const raw = JSON.stringify(validPayload);
        expect(parsed(raw)).toEqual(parsed(raw));

        const fallback = createNovelAnalysisFallback({
            ...sourceOptions,
            sourceExcerpt: '这是来源片段摘要。'.repeat(80),
            warning: 'connection failed',
        });
        expect(fallback.protagonist).toBeNull();
        expect(fallback.plotPoints).toEqual([]);
        expect(fallback.sourceExcerpt.length).toBeLessThanOrEqual(500);
        expect(fallback.missingInformation).toContain('worldSummary');
    });
});

describe('Echoes novel analysis validation and prompt', () => {
    it('validateNovelAnalysis 检查 schema、数组、证据和 confidence', () => {
        const valid = parsed(JSON.stringify(validPayload)).analysis;
        const invalid = {
            ...valid,
            schemaVersion: 9,
            title: 7,
            specificGenres: 'bad',
            mainCharacters: {},
            mechanicHints: [{ kind: 'not_registered', confidence: 4 }],
            plotPoints: {},
        };

        expect(validateNovelAnalysis(valid).valid).toBe(true);
        const validation = validateNovelAnalysis(invalid);
        expect(validation.valid).toBe(false);
        expect(validation.errors.join(' ')).toMatch(/schemaVersion|title|specificGenres|mainCharacters|mechanicHints|plotPoints/);
    });

    it('buildNovelAnalysisPrompt 明确限定证据、具体玩法和机制目录', () => {
        const prompt = buildNovelAnalysisPrompt('=== 第3章 试播 ===\n林舟打开直播间。', sourceOptions);

        expect(prompt).toContain('只能根据提供的片段分析');
        expect(prompt).toContain('不能编造');
        expect(prompt).toContain('具体题材和混合题材');
        expect(prompt).toContain('弹幕');
        expect(prompt).toContain('副本选择');
        expect(prompt).toContain('danmaku_stream');
        expect(prompt).toContain('generic_panel');
        expect(prompt).toContain('章节标记');
        expect(prompt).toContain('林舟打开直播间。');
    });
});
