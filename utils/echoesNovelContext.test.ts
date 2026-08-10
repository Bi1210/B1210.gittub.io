import { describe, expect, it } from 'vitest';
import { parseNovelText } from './echoesNovelParser';
import {
    assembleNovelContext,
    findRelevantNovelChapters,
    getNovelChapterWindow,
    getNovelContext,
    searchNovelText,
    selectNovelContextSegments,
} from './echoesNovelContext';

const document = parseNovelText([
    '这是开头的世界背景与序言。',
    '',
    '第1章 雾中城',
    '林舟第一次进入副本，城门在雾里打开。',
    '他在这里遇见了叶修。',
    '',
    '第2章 嘉世旧事',
    '叶修离开嘉世以后，第一次回到旧训练场。',
    '旧友讨论了下一场比赛。',
    '',
    '第3章 签约',
    '女主签约经纪公司，新的生活由此开始。',
    '',
    '第4章 远行',
    '众人离开城市，沿着海岸继续前进。',
    '',
    '第5章 终局',
    '终局之前，所有人重新聚在一起。',
].join('\n'));

function chapter(id: string) {
    return document.chapters.find((item) => item.id === id)!;
}

describe('Echoes novel context chapter retrieval', () => {
    it('按标题关键词和正文关键词命中章节', () => {
        const titleMatches = findRelevantNovelChapters(document, '嘉世');
        const bodyMatches = findRelevantNovelChapters(document, '副本');

        expect(titleMatches[0].chapterTitle).toBe('第2章 嘉世旧事');
        expect(titleMatches[0].titleMatchedTerms.length).toBeGreaterThan(0);
        expect(bodyMatches[0].chapterTitle).toBe('第1章 雾中城');
        expect(bodyMatches[0].bodyMatchedTerms).toContain('副本');
        expect(bodyMatches[0].firstMatchOffset).toBeGreaterThanOrEqual(document.chapters[0].startOffset);
    });

    it('标题命中优先于弱正文命中，多关键词得分更高', () => {
        const titleHit = findRelevantNovelChapters(document, '签约');
        const phraseHit = findRelevantNovelChapters(document, '叶修 离开 嘉世');

        expect(titleHit[0].chapterTitle).toBe('第3章 签约');
        expect(titleHit[0].score).toBeGreaterThan(titleHit[0].bodyMatchedTerms.length);
        expect(phraseHit[0].chapterTitle).toBe('第2章 嘉世旧事');
        expect(phraseHit[0].matchedTerms.length).toBeGreaterThanOrEqual(3);
    });

    it('英文查询不区分大小写，空查询不返回整本小说', () => {
        const englishDocument = parseNovelText('Chapter One\nThe First Dungeon opens.\n\nChapter Two\nAnother chapter.');
        const matches = findRelevantNovelChapters(englishDocument, 'first dungeon');

        expect(matches[0].chapterTitle).toBe('Chapter One');
        expect(findRelevantNovelChapters(document, '').length).toBe(0);
        expect(findRelevantNovelChapters(document, undefined).length).toBe(0);
    });
});

describe('Echoes novel context selection', () => {
    it('返回当前章节窗口，且不超出指定半径', () => {
        const current = chapter('chapter-3');
        const window = getNovelChapterWindow(document, current.id, 1);
        const selected = selectNovelContextSegments(document, {
            currentChapterId: current.id,
            nearbyChapterRadius: 1,
            includeOpening: false,
            uniformChapterCount: 0,
            maxSegments: 5,
        });

        expect(window.map((item) => item.id)).toEqual(['chapter-2', 'chapter-3', 'chapter-4']);
        expect(selected.map((item) => item.chapterId)).toEqual(['chapter-3', 'chapter-2', 'chapter-4']);
        expect(selected.every((item) => item.chapterId !== 'chapter-1' && item.chapterId !== 'chapter-5')).toBe(true);
    });

    it('指定章节即使没有查询命中也优先保留，并去重', () => {
        const selected = selectNovelContextSegments(document, {
            selectedChapterIds: ['chapter-5', 'chapter-5'],
            query: '不存在的关键词',
            includeOpening: false,
            uniformChapterCount: 0,
            maxSegments: 4,
        });

        expect(selected[0].chapterId).toBe('chapter-5');
        expect(selected.filter((item) => item.chapterId === 'chapter-5')).toHaveLength(1);
        expect(selected[0].reason).toContain('用户指定章节');
    });

    it('可选包含开头、前言和均匀章节，且片段不复制全文', () => {
        const selected = selectNovelContextSegments(document, {
            includeOpening: true,
            includePreface: true,
            uniformChapterCount: 3,
            maxSegments: 8,
            segmentChars: 30,
            openingChars: 20,
        });

        expect(selected.some((item) => item.kind === 'opening')).toBe(true);
        expect(selected.some((item) => item.kind === 'preface')).toBe(true);
        expect(selected.some((item) => item.chapterId === 'chapter-5')).toBe(true);
        expect(selected.every((item) => item.text.length <= 30 || item.kind === 'opening')).toBe(true);
        expect(selected.every((item) => item.text !== document.normalizedText)).toBe(true);
        expect(new Set(selected.map((item) => item.chapterId).filter(Boolean)).size)
            .toBe(selected.map((item) => item.chapterId).filter(Boolean).length);
    });

    it('不存在的章节 ID 不抛错，查询命中章节仍可返回', () => {
        const selected = selectNovelContextSegments(document, {
            selectedChapterIds: ['missing'],
            query: '经纪公司',
            includeOpening: false,
            uniformChapterCount: 0,
        });

        expect(selected[0].chapterId).toBe('chapter-3');
        expect(getNovelChapterWindow(document, 'missing', 2)).toEqual([]);
    });
});

describe('Echoes novel context assembly', () => {
    it('带章节标记拼接，并严格限制 maxChars', () => {
        for (const maxChars of [0, 1, 8, 30, 80, 240, 2_000]) {
            const result = getNovelContext(document, {
                currentChapterId: 'chapter-2',
                includeOpening: true,
                includePreface: true,
                maxChars,
                maxSegments: 6,
                segmentChars: 120,
            });

            expect(result.text.length).toBeLessThanOrEqual(maxChars);
            expect(result.usedChars).toBe(result.text.length);
            expect(result.segments.every((segment) =>
                segment.startOffset >= 0 &&
                segment.endOffset <= document.normalizedText.length &&
                segment.endOffset >= segment.startOffset,
            )).toBe(true);
        }
    });

    it('预算足够时保留当前章节，预算很小时安全截断并标记 truncated', () => {
        const normal = getNovelContext(document, {
            currentChapterId: 'chapter-2',
            includeOpening: false,
            uniformChapterCount: 0,
            maxChars: 300,
        });
        const tiny = getNovelContext(document, {
            currentChapterId: 'chapter-2',
            includeOpening: false,
            uniformChapterCount: 0,
            maxChars: 12,
        });

        expect(normal.text).toContain('嘉世');
        expect(tiny.text.length).toBeLessThanOrEqual(12);
        expect(tiny.truncated).toBe(true);
    });

    it('相同 document 和 options 得到完全相同结果', () => {
        const options = {
            query: '叶修离开嘉世',
            currentChapterId: 'chapter-2',
            nearbyChapterRadius: 1,
            includeOpening: true,
            maxChars: 500,
            maxSegments: 6,
        } as const;

        expect(getNovelContext(document, options)).toEqual(getNovelContext(document, options));
    });

    it('assembleNovelContext 可以组装预选片段并跳过重复大段正文', () => {
        const ch = chapter('chapter-2');
        const segment = {
            kind: 'chapter' as const,
            chapterId: ch.id,
            chapterIndex: ch.index,
            chapterTitle: ch.title,
            startOffset: ch.startOffset,
            endOffset: ch.endOffset,
            text: document.normalizedText.slice(ch.startOffset, ch.endOffset),
            score: 10,
            reason: 'test',
        };
        const result = assembleNovelContext(document, {
            maxChars: 500,
            maxSegments: 3,
            segments: [segment, segment],
        });

        expect(result.segments).toHaveLength(1);
        expect(result.text.match(/=== 第2章 嘉世旧事 ===/g)).toHaveLength(1);
    });
});

describe('Echoes novel text search', () => {
    it('返回有限搜索结果、原文偏移和有上限的 excerpt', () => {
        const results = searchNovelText(document, '叶修', {
            maxResults: 4,
            maxMatchesPerChapter: 2,
            excerptChars: 18,
        });

        expect(results.length).toBeGreaterThan(0);
        expect(results.length).toBeLessThanOrEqual(4);
        expect(results[0].chapterId).toBe('chapter-1');
        expect(results[0].matchedText).toBe('叶修');
        expect(results.every((result) => result.surroundingExcerpt.length <= 18)).toBe(true);
        expect(results.every((result) =>
            result.matchOffset >= 0 &&
            result.matchOffset < document.normalizedText.length,
        )).toBe(true);
        expect(searchNovelText(document, '').length).toBe(0);
    });

    it('查询不存在时返回空数组，不返回整章正文', () => {
        expect(searchNovelText(document, '完全不存在的词')).toEqual([]);
        const results = searchNovelText(document, '离开嘉世', { excerptChars: 10 });
        expect(results.every((result) => result.surroundingExcerpt.length <= 10)).toBe(true);
        expect(results.every((result) => result.surroundingExcerpt !== document.normalizedText)).toBe(true);
    });
});
