import { describe, expect, it } from 'vitest';
import { parseNovelText } from './echoesNovelParser';
import {
    analyzeNovelDocument,
    analyzeNovelFile,
    prepareNovelAnalysis,
} from './echoesNovelWorkflow';
import type { NovelAnalysisRequester } from './echoesNovelWorkflowTypes';

const document = parseNovelText([
    '前言：这是世界背景。',
    '',
    '第1章 雾中城',
    '林舟进入副本，城门在雾里打开。',
    '',
    '第2章 嘉世旧事',
    '叶修离开嘉世以后回到旧训练场。',
    '',
    '第3章 签约',
    '女主签约经纪公司，开始新的生活。',
    '',
    '第4章 远行',
    '众人离开城市，沿着海岸继续前进。',
].join('\n'), { fileName: 'workflow.txt', createdAt: '2026-08-08T00:00:00.000Z' });

const validResponse = JSON.stringify({
    schemaVersion: 1,
    title: '雾中城',
    author: '作者',
    worldSummary: '有限片段显示这是一个副本世界。',
    specificGenres: ['无限流', '末世直播'],
    gameplaySignals: [{ id: 'task', name: '副本选择', description: '选择副本', evidence: [], confidence: 0.7 }],
    mechanicHints: [{ kind: 'scenario_picker', title: '副本选择', reason: '存在副本', trigger: 'choice', confidence: 0.7 }],
    protagonist: null,
    mainCharacters: [],
    worldRules: [],
    plotPoints: [],
    recommendedEntryPoints: [],
    contentWarnings: [],
    missingInformation: [],
    analysisWarnings: [],
});

const fileLike = (name: string, text: string) => ({
    name,
    size: new TextEncoder().encode(text).byteLength,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
});

describe('Echoes novel analysis workflow preparation', () => {
    it('生成有界 Prompt、章节标记和来源章节信息', () => {
        const preparation = prepareNovelAnalysis(document, {
            context: {
                maxChars: 180,
                maxSegments: 4,
                includeOpening: true,
                uniformChapterCount: 2,
            },
            source: { sourceKind: 'uploaded_txt' },
            language: 'zh-CN',
        });

        expect(preparation.workflowVersion).toBe('echoes-novel-workflow/1');
        expect(preparation.context.text.length).toBeLessThanOrEqual(180);
        expect(preparation.prompt).toContain('原著片段开始');
        expect(preparation.prompt).toContain('===');
        expect(preparation.prompt).toContain('workflow.txt');
        expect(preparation.source.sourceChapterIds?.length).toBeGreaterThan(0);
        expect(new Set(preparation.source.sourceChapterIds).size).toBe(preparation.source.sourceChapterIds?.length);
        expect(preparation.source.sourceExcerpt?.length).toBeLessThanOrEqual(500);
    });

    it('query 和 selectedChapterIds 会影响实际上下文来源', () => {
        const queryPreparation = prepareNovelAnalysis(document, {
            context: {
                query: '经纪公司',
                includeOpening: false,
                uniformChapterCount: 0,
                maxChars: 300,
                maxSegments: 3,
            },
        });
        const selectedPreparation = prepareNovelAnalysis(document, {
            context: {
                selectedChapterIds: ['chapter-2'],
                query: '不存在的词',
                includeOpening: false,
                uniformChapterCount: 0,
                maxChars: 300,
                maxSegments: 2,
            },
        });

        expect(queryPreparation.context.segments.some((segment) => segment.chapterId === 'chapter-3')).toBe(true);
        expect(selectedPreparation.context.segments[0].chapterId).toBe('chapter-2');
        expect(selectedPreparation.source.sourceChapterIds).toContain('chapter-2');
    });

    it('长文不会把 normalizedText 全文写入来源摘要或 Prompt', () => {
        const longDocument = parseNovelText([
            '前言',
            ...Array.from({ length: 30 }, (_, index) => `第${index + 1}章 章节${index + 1}\n${'独立正文内容。'.repeat(120)}`),
        ].join('\n\n'), { fileName: 'long.txt' });
        const preparation = prepareNovelAnalysis(longDocument, {
            context: { maxChars: 700, maxSegments: 5, uniformChapterCount: 3 },
        });

        expect(longDocument.normalizedText.length).toBeGreaterThan(700);
        expect(preparation.context.text.length).toBeLessThanOrEqual(700);
        expect(preparation.source.sourceExcerpt?.length).toBeLessThanOrEqual(500);
        expect(preparation.prompt).not.toContain(longDocument.normalizedText);
    });
});

describe('Echoes novel analysis workflow execution', () => {
    it('requester 收到 Prompt 和 maxTokens，OpenAI 兼容对象进入分析归一化', async () => {
        let receivedPrompt = '';
        let receivedMaxTokens: number | undefined;
        const requester: NovelAnalysisRequester = async (prompt, maxTokens) => {
            receivedPrompt = prompt;
            receivedMaxTokens = maxTokens;
            return { choices: [{ message: { content: validResponse } }] };
        };
        const result = await analyzeNovelDocument(document, requester, {
            maxTokens: 321,
            context: { maxChars: 240, maxSegments: 3, uniformChapterCount: 1 },
        });

        expect(receivedPrompt).toContain('原著片段开始');
        expect(receivedMaxTokens).toBe(321);
        expect(result.error).toBeUndefined();
        expect(result.parseResult.fallback).toBe(false);
        expect(result.analysis.specificGenres).toEqual(['无限流', '末世直播']);
        expect(result.document).toBe(document);
        expect(result.preparation).not.toBeNull();
    });

    it('requester 抛错时返回 request stage 和安全 fallback，不抛异常', async () => {
        const requester: NovelAnalysisRequester = async () => {
            throw new Error('upstream timeout with apiKey=sk-secret-value');
        };
        const result = await analyzeNovelDocument(document, requester);

        expect(result.error?.stage).toBe('request');
        expect(result.error?.message).not.toContain('sk-secret-value');
        expect(result.parseResult.fallback).toBe(true);
        expect(result.analysis.protagonist).toBeNull();
        expect(result.document).toBe(document);
        expect(result.preparation).not.toBeNull();
    });

    it('非法 AI 输出复用 parseNovelAnalysisResult fallback，并返回 parse stage', async () => {
        const result = await analyzeNovelDocument(document, async () => '这不是 JSON');

        expect(result.error?.stage).toBe('parse');
        expect(result.error?.code).toBe('INVALID_AI_RESPONSE');
        expect(result.parseResult.fallback).toBe(true);
        expect(result.analysis.mainCharacters).toEqual([]);
        expect(result.analysis.plotPoints).toEqual([]);
    });

    it('readNovelFile 失败时返回 read stage 和安全 fallback', async () => {
        const result = await analyzeNovelFile(fileLike('not-supported.pdf', 'not txt'), async () => validResponse);

        expect(result.error?.stage).toBe('read');
        expect(result.error?.code).toBe('UNSUPPORTED_FILE_TYPE');
        expect(result.document).toBeNull();
        expect(result.preparation).toBeNull();
        expect(result.parseResult.fallback).toBe(true);
        expect(result.analysis.mainCharacters).toEqual([]);
    });

    it('analyzeNovelFile 读取 TXT 后进入同一 requester 流程', async () => {
        let calls = 0;
        const result = await analyzeNovelFile(
            fileLike('uploaded.txt', '第1章 开始\n这是正文。'),
            async (prompt) => {
                calls += 1;
                expect(prompt).toContain('===');
                return validResponse;
            },
            { read: { maxBytes: 10_000 }, context: { maxChars: 150, uniformChapterCount: 0 } },
        );

        expect(calls).toBe(1);
        expect(result.error).toBeUndefined();
        expect(result.document?.fileName).toBe('uploaded.txt');
        expect(result.parseResult.fallback).toBe(false);
    });

    it('相同 document 和 options 的准备结果稳定', () => {
        const options = { context: { query: '叶修', maxChars: 300, maxSegments: 4 } } as const;
        expect(prepareNovelAnalysis(document, options)).toEqual(prepareNovelAnalysis(document, options));
    });
});
