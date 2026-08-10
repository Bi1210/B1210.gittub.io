import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    decodeNovelBytes,
    getChapterText,
    isSupportedNovelFile,
    NovelParserError,
    parseEpubNovel,
    parseNovelText,
    readNovelFile,
    sampleNovelForAnalysis,
} from './echoesNovelParser';

const encoder = new TextEncoder();

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function fileLike(name: string, bytes: Uint8Array, size = bytes.byteLength) {
    return {
        name,
        size,
        arrayBuffer: async () => toArrayBuffer(bytes),
    };
}

describe('Echoes novel text parser', () => {
    it('识别中文、特殊章节和英文 Chapter，并保留标题顺序', () => {
        const document = parseNovelText(
            '序章：潮声\n序章正文\n\n第1章 初见\n第一章正文\n\n第2节：回声\n第二节正文\n\n番外 1：旧信\n番外正文\n\n终章：归航\n终章正文\n\nChapter 4: The Gate\nEnglish body',
            { fileName: 'mixed.txt', createdAt: '2026-08-07T00:00:00.000Z' },
        );

        expect(document.fileName).toBe('mixed.txt');
        expect(document.chapterCount).toBe(6);
        expect(document.chapters.map((chapter) => chapter.title)).toEqual([
            '序章：潮声',
            '第1章 初见',
            '第2节：回声',
            '番外 1：旧信',
            '终章：归航',
            'Chapter 4: The Gate',
        ]);
        expect(document.chapters.map((chapter) => chapter.index)).toEqual([0, 1, 2, 3, 4, 5]);
        expect(document.createdAt).toBe('2026-08-07T00:00:00.000Z');
        expect(document.prefaceRange).toBeNull();
    });

    it('不把正文中的普通句子误判为章节标题', () => {
        const document = parseNovelText(
            'Chapter begins with ordinary sentence.\n正文仍在继续。\n\nChapter 1: Real title\n真正正文。\n\n第1章这是一个标题\n标题正文。',
        );

        expect(document.chapters.map((chapter) => chapter.title)).toEqual([
            'Chapter 1: Real title',
            '第1章这是一个标题',
        ]);
    });

    it('读取 fixture 并识别 Part、Prologue 等英文标题', () => {
        const text = readFileSync(
            new URL('../tests/fixtures/echoes/mixed-novel.txt', import.meta.url),
            'utf8',
        );
        const document = parseNovelText(text, { fileName: 'mixed-novel.txt' });

        expect(document.chapters.map((chapter) => chapter.title)).toEqual([
            '序章：玻璃海',
            '第1章 初见',
            '第2节：回声',
            '第3卷 雾中城',
            'Chapter 4: The Gate',
            'Part II',
            'Prologue',
            'Epilogue',
            '番外 1：旧信',
            '终章：归航',
        ]);
        expect(document.prefaceRange?.charCount).toBeGreaterThan(0);
        expect(document.unattributedRanges).toHaveLength(1);
    });

    it('没有章节标题时返回全文章节', () => {
        const text = '这是一篇没有章节标题的短文。\n第二行。';
        const document = parseNovelText(text);

        expect(document.chapterCount).toBe(1);
        expect(document.chapters[0]).toMatchObject({
            id: 'chapter-1',
            index: 0,
            title: '全文',
            startOffset: 0,
            endOffset: text.length,
            charCount: text.length,
        });
        expect(getChapterText(document, document.chapters[0])).toBe(text);
        expect(document.prefaceRange).toBeNull();
    });

    it('处理 UTF-8 BOM、CRLF 和空文件', async () => {
        const bytes = encoder.encode('\uFEFF第1章\r\n正文\r\n');
        const document = await readNovelFile(fileLike('bom.txt', bytes));

        expect(document.encoding).toBe('utf-8');
        expect(document.normalizedText).toBe('第1章\n正文\n');
        expect(document.normalizedText.startsWith('\uFEFF')).toBe(false);
        expect(document.originalCharCount).toBe('第1章\r\n正文\r\n'.length);
        expect(document.chapters[0].startOffset).toBe('第1章\n'.length);
        expect(getChapterText(document, document.chapters[0])).toBe('正文\n');

        const empty = await readNovelFile(fileLike('empty.txt', new Uint8Array()));
        expect(empty.normalizedText).toBe('');
        expect(empty.chapterCount).toBe(1);
        expect(getChapterText(empty, empty.chapters[0])).toBe('');
    });

    it('UTF-8 失败时尝试 GB18030/GBK，并在运行时不支持时保留提示', () => {
        const gb18030Bytes = new Uint8Array([0xD5, 0xE2, 0xCA, 0xC7]); // “这是” in GB18030/GBK
        const decoded = decodeNovelBytes(toArrayBuffer(gb18030Bytes));

        if (decoded.encoding === 'utf-8-fallback') {
            expect(decoded.text.length).toBeGreaterThan(0);
            expect(decoded.encodingNotice).toMatch(/GB18030|GBK|replacement/i);
        } else {
            expect(['gb18030', 'gbk']).toContain(decoded.encoding);
            expect(decoded.text).toContain('这是');
            expect(decoded.encodingNotice).toMatch(/UTF-8/);
        }
    });

    it('章节偏移和正文读取不复制章节正文', () => {
        const text = '前言\n\n第1章 一\n第一章正文\n\n第2章 二\n第二章正文';
        const document = parseNovelText(text);
        const first = document.chapters[0];
        const second = document.chapters[1];

        expect(document.prefaceRange).toEqual({
            startOffset: 0,
            endOffset: text.indexOf('第1章'),
            charCount: text.indexOf('第1章'),
        });
        expect(first.endOffset).toBe(second.titleStartOffset);
        expect(first.charCount).toBe(first.endOffset - first.startOffset);
        expect(getChapterText(document, first)).toBe('第一章正文\n\n');
        expect(getChapterText(document, second)).toBe('第二章正文');
    });
});

describe('Echoes novel sampling', () => {
    const document = parseNovelText(
        [
            '开头信息。'.repeat(30),
            ...Array.from({ length: 10 }, (_, index) => `第${index + 1}章 章节${index + 1}\n${`独特正文${index + 1}。`.repeat(30)}`),
        ].join('\n\n'),
    );

    it('默认包含开头，并从全书均匀采样而非只取开头', () => {
        const sample = sampleNovelForAnalysis(document, {
            maxChars: 2_000,
            openingChars: 80,
            chapterSnippetChars: 90,
            uniformChapterCount: 4,
        });

        expect(sample.length).toBeLessThanOrEqual(2_000);
        expect(sample).toContain('=== OPENING ===');
        expect(sample).toContain('独特正文1');
        expect(sample).toContain('独特正文10');
        expect(sample).toContain('独特正文7');
    });

    it('指定章节优先采样，且重复指定不会重复内容', () => {
        const selected = document.chapters[6];
        const sample = sampleNovelForAnalysis(document, {
            maxChars: 1_200,
            selectedChapterIds: [selected.id, selected.id],
            uniformChapterCount: 0,
            openingChars: 40,
            chapterSnippetChars: 220,
        });

        expect(sample).toContain(selected.title);
        expect(sample.match(new RegExp(`=== CHAPTER: ${selected.title} ===`, 'g'))?.length).toBe(1);
    });

    it('maxChars 严格限制，预算不足时安全截断', () => {
        for (const maxChars of [0, 1, 8, 37, 100, 503]) {
            const sample = sampleNovelForAnalysis(document, {
                maxChars,
                openingChars: 500,
                chapterSnippetChars: 500,
                uniformChapterCount: 10,
            });
            expect(sample.length).toBeLessThanOrEqual(maxChars);
        }
    });

    it('同一文档和选项采样结果确定且不重复大段内容', () => {
        const options = { maxChars: 1_800, uniformChapterCount: 6, chapterSnippetChars: 250 };
        const first = sampleNovelForAnalysis(document, options);
        const second = sampleNovelForAnalysis(document, options);

        expect(second).toBe(first);
        const bodies = first.split(/\n\n=== /).map((part) => part.replace(/^.*?\n/, ''));
        expect(new Set(bodies).size).toBe(bodies.length);
    });
});

describe('Echoes novel file boundaries', () => {
    it('只支持 TXT 扩展名', () => {
        expect(isSupportedNovelFile('book.txt')).toBe(true);
        expect(isSupportedNovelFile('BOOK.TXT')).toBe(true);
        expect(isSupportedNovelFile('book.epub')).toBe(false);
        expect(isSupportedNovelFile('book.pdf')).toBe(false);
        expect(isSupportedNovelFile('book.txt.bak')).toBe(false);
    });

    it('拒绝超出上层限制的文件，不在核心硬编码 50MB', async () => {
        const bytes = encoder.encode('小文件');
        await expect(readNovelFile(fileLike('book.txt', bytes, bytes.byteLength), { maxBytes: 2 }))
            .rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
        await expect(readNovelFile(fileLike('book.txt', bytes), { maxBytes: 50_000_000 }))
            .resolves.toMatchObject({ fileName: 'book.txt' });
    });

    it('EPUB 接口明确返回尚未启用错误', async () => {
        const file = fileLike('book.epub', new Uint8Array([1, 2, 3]));
        await expect(readNovelFile(file)).rejects.toMatchObject({
            name: 'NovelParserError',
            code: 'EPUB_NOT_ENABLED',
            message: 'EPUB 解析尚未启用。当前仅支持 TXT 文件。',
        });
        await expect(parseEpubNovel(file)).rejects.toMatchObject({
            code: 'EPUB_NOT_ENABLED',
        });
    });

    it('不支持的扩展名返回明确错误', async () => {
        await expect(readNovelFile(fileLike('book.pdf', encoder.encode('not txt'))))
            .rejects.toMatchObject({
                name: 'NovelParserError',
                code: 'UNSUPPORTED_FILE_TYPE',
            });
    });

    it('NovelParserError 暴露稳定错误码', () => {
        const error = new NovelParserError('INVALID_OPTION', 'bad option');
        expect(error).toBeInstanceOf(Error);
        expect(error.code).toBe('INVALID_OPTION');
    });
});
