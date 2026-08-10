import {
    ECHOES_NOVEL_PARSER_VERSION,
    type EpubParser,
    type NovelChapter,
    type NovelDecodedText,
    type NovelFileLike,
    type NovelParseMetadata,
    type NovelParserErrorCode,
    type NovelSamplingOptions,
    type NovelTextRange,
    type ParsedNovel,
    type ReadNovelFileOptions,
    type NovelEncoding,
} from './echoesNovelTypes';

const TXT_EXTENSION = /\.txt$/i;
const EPUB_EXTENSION = /\.epub$/i;
const DEFAULT_SAMPLE_MAX_CHARS = 12_000;
const DEFAULT_OPENING_CHARS = 1_200;
const DEFAULT_CHAPTER_SNIPPET_CHARS = 600;
const DEFAULT_UNIFORM_CHAPTER_COUNT = 6;
const MAX_HEADING_CHARS = 160;
const CHINESE_NUMBER_CHARS = '0-9０-９一二三四五六七八九十百千万亿零〇两廿卅壹贰叁肆伍陆柒捌玖拾佰仟IVXLCDM';

const ENGLISH_SENTENCE_WORDS = new Set([
    'a', 'an', 'and', 'are', 'began', 'begins', 'contains', 'ends', 'finished',
    'follows', 'from', 'happens', 'has', 'here', 'is', 'it', 'looks', 'of',
    'says', 'shows', 'started', 'starts', 'tells', 'that', 'the', 'there',
    'this', 'to', 'was', 'were', 'will', 'with',
]);
const ENGLISH_SENTENCE_VERBS = new Set([
    'began', 'begins', 'contains', 'ends', 'finished', 'follows', 'happens',
    'has', 'is', 'looks', 'says', 'shows', 'started', 'starts', 'tells',
    'was', 'were', 'will',
]);
const CHINESE_BODY_SUFFIX = /^(?:正文(?:内容)?|本章正文|本节正文|正文如下|内容)(?:[：:、.．·•,，。!?！？；;]|$)/;
const TITLE_SEPARATOR = /^[ \t]*[：:、.．·•\-—_]/;
const ENGLISH_BODY_MARKERS = new Set(['body', 'content', 'text', 'begins', 'starts']);

export class NovelParserError extends Error {
    readonly code: NovelParserErrorCode;
    readonly cause?: unknown;

    constructor(code: NovelParserErrorCode, message: string, cause?: unknown) {
        super(message);
        this.name = 'NovelParserError';
        this.code = code;
        this.cause = cause;
    }
}

/** Returns true only for the currently enabled TXT reader. */
export function isSupportedNovelFile(name: string): boolean {
    return typeof name === 'string' && TXT_EXTENSION.test(name.trim());
}

function getNovelFormat(name: string): 'txt' | 'epub' | null {
    const trimmedName = name.trim();
    if (TXT_EXTENSION.test(trimmedName)) return 'txt';
    if (EPUB_EXTENSION.test(trimmedName)) return 'epub';
    return null;
}

function assertMaxBytes(maxBytes: number | undefined): void {
    if (maxBytes === undefined) return;
    if (!Number.isFinite(maxBytes) || maxBytes < 0) {
        throw new NovelParserError('INVALID_OPTION', 'maxBytes must be a finite non-negative number.');
    }
}

function assertFileLike(file: NovelFileLike): void {
    if (!file || typeof file.name !== 'string' || typeof file.arrayBuffer !== 'function') {
        throw new NovelParserError('INVALID_FILE', 'The file must provide a name and arrayBuffer() method.');
    }
}

function stripUtf8Bom(text: string): string {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function countReplacementCharacters(text: string): number {
    let count = 0;
    for (let index = 0; index < text.length; index += 1) {
        if (text.charCodeAt(index) === 0xfffd) count += 1;
    }
    return count;
}

function decodeWithLabel(bytes: Uint8Array, label: string, fatal: boolean): string {
    if (typeof TextDecoder === 'undefined') {
        throw new NovelParserError('DECODE_FAILED', 'TextDecoder is unavailable in this environment.');
    }
    return new TextDecoder(label, { fatal }).decode(bytes);
}

/**
 * Decode UTF-8 first. Legacy Chinese labels are attempted only after strict
 * UTF-8 fails; runtimes that do not expose those labels fall back to a
 * readable UTF-8 replacement result with an explicit notice.
 */
export function decodeNovelBytes(buffer: ArrayBuffer): NovelDecodedText {
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength === 0) return { text: '', encoding: 'utf-8' };

    try {
        return {
            text: stripUtf8Bom(decodeWithLabel(bytes, 'utf-8', true)),
            encoding: 'utf-8',
        };
    } catch {
        // Invalid UTF-8: continue with legacy Chinese encodings.
    }

    let firstLegacyResult: {
        text: string;
        encoding: 'gb18030' | 'gbk';
        replacements: number;
    } | null = null;

    for (const label of ['gb18030', 'gbk'] as const) {
        try {
            const text = stripUtf8Bom(decodeWithLabel(bytes, label, false));
            const result = { text, encoding: label, replacements: countReplacementCharacters(text) };
            if (!firstLegacyResult) firstLegacyResult = result;
            if (result.replacements === 0) {
                return {
                    text,
                    encoding: label,
                    encodingNotice: `UTF-8 decoding failed; the file was decoded as ${label}.`,
                };
            }
        } catch {
            // TextDecoder support for legacy labels is runtime-dependent.
        }
    }

    if (firstLegacyResult) {
        return {
            text: firstLegacyResult.text,
            encoding: firstLegacyResult.encoding,
            encodingNotice:
                `UTF-8 decoding failed; ${firstLegacyResult.encoding} decoding left ` +
                'replacement characters in the readable result.',
        };
    }

    try {
        const text = stripUtf8Bom(decodeWithLabel(bytes, 'utf-8', false));
        return {
            text,
            encoding: 'utf-8-fallback',
            encodingNotice:
                'UTF-8 decoding failed and this runtime has no usable GB18030/GBK decoder; ' +
                'unreadable bytes were replaced.',
        };
    } catch (cause) {
        throw new NovelParserError('DECODE_FAILED', 'Unable to decode the novel file as text.', cause);
    }
}

function normalizeNovelText(text: string): string {
    return stripUtf8Bom(text).replace(/\r\n?/g, '\n');
}

function makeRange(startOffset: number, endOffset: number): NovelTextRange {
    return {
        startOffset,
        endOffset,
        charCount: Math.max(0, endOffset - startOffset),
    };
}

interface HeadingMatch {
    lineStartOffset: number;
    lineEndOffset: number;
    titleStartOffset: number;
    titleEndOffset: number;
    title: string;
}

function hasSentencePunctuation(text: string): boolean {
    return /[。！？!?；;]/.test(text);
}

function hasExplicitTitleSeparator(suffix: string): boolean {
    return TITLE_SEPARATOR.test(suffix);
}

function isReasonableChineseSuffix(suffix: string): boolean {
    const trimmed = suffix.trim();
    if (!trimmed) return true;
    if (!hasExplicitTitleSeparator(suffix) && CHINESE_BODY_SUFFIX.test(trimmed)) return false;
    if (!hasExplicitTitleSeparator(suffix) && hasSentencePunctuation(trimmed)) return false;

    if (!hasExplicitTitleSeparator(suffix)) {
        const firstWord = trimmed.split(/[ \t]+/, 1)[0]
            .replace(/^[：:、.．·•\-—_]+/, '')
            .toLocaleLowerCase();
        if (ENGLISH_SENTENCE_WORDS.has(firstWord)) return false;
    }
    return true;
}

function matchChineseHeading(title: string): boolean {
    const numbered = title.match(new RegExp(`^第\\s*[${CHINESE_NUMBER_CHARS}]+\\s*(章|节|卷)(.*)$`));
    if (numbered && isReasonableChineseSuffix(numbered[2])) return true;

    const special = title.match(/^(序章|楔子|终章)(.*)$/);
    if (special && isReasonableChineseSuffix(special[2])) return true;

    const extra = title.match(new RegExp(`^番外(?:篇)?(?:[ \\t]*[${CHINESE_NUMBER_CHARS}]+)?(.*)$`));
    return Boolean(extra && isReasonableChineseSuffix(extra[1]));
}

function isRomanOrArabicNumber(value: string): boolean {
    return /^(?:[0-9]+|[０-９]+|[IVXLCDM]+)$/i.test(value);
}

function looksLikeEnglishSentence(titleSuffix: string, firstWord: string): boolean {
    const words = titleSuffix.toLocaleLowerCase().match(/[a-z]+/g) ?? [];
    if (ENGLISH_SENTENCE_VERBS.has(firstWord)) return true;
    if (words.some((word) => ENGLISH_BODY_MARKERS.has(word))) return true;
    return words.slice(1).some((word) => ENGLISH_SENTENCE_VERBS.has(word));
}

function matchEnglishHeading(title: string): boolean {
    const match = title.match(/^(Chapter|Part|Prologue|Epilogue)(.*)$/i);
    if (!match) return false;

    const suffix = match[2];
    if (!suffix) return true;
    if (!/^[ \t]/.test(suffix) && !hasExplicitTitleSeparator(suffix)) return false;

    const trimmed = suffix.trim();
    if (!trimmed) return true;
    if (hasExplicitTitleSeparator(suffix)) return true;

    const firstWord = trimmed.split(/[ \t]+/, 1)[0]
        .replace(/^[：:、.．·•\-—_]+/, '')
        .replace(/[：:、.．·•,，\-—_]+$/, '')
        .toLocaleLowerCase();
    if (looksLikeEnglishSentence(trimmed, firstWord)) return false;

    const keyword = match[1].toLocaleLowerCase();
    if (keyword === 'chapter' || keyword === 'part') {
        return isRomanOrArabicNumber(firstWord) || /^[a-z]+$/i.test(firstWord);
    }
    return /^[a-z]+$/i.test(firstWord);
}

function isChapterHeading(title: string): boolean {
    if (!title || title.length > MAX_HEADING_CHARS || /[\r\n]/.test(title)) return false;
    return matchChineseHeading(title) || matchEnglishHeading(title);
}

function findHeadings(text: string): HeadingMatch[] {
    const headings: HeadingMatch[] = [];
    let lineStartOffset = 0;

    while (lineStartOffset <= text.length) {
        const newlineOffset = text.indexOf('\n', lineStartOffset);
        const lineEndOffset = newlineOffset === -1 ? text.length : newlineOffset;
        const line = text.slice(lineStartOffset, lineEndOffset);
        const title = line.trim();

        if (title && isChapterHeading(title)) {
            const titleStartInLine = line.indexOf(title);
            const titleStartOffset = lineStartOffset + Math.max(0, titleStartInLine);
            headings.push({
                lineStartOffset,
                lineEndOffset,
                titleStartOffset,
                titleEndOffset: titleStartOffset + title.length,
                title,
            });
        }

        if (newlineOffset === -1) break;
        lineStartOffset = newlineOffset + 1;
    }
    return headings;
}

function createFullTextChapter(textLength: number): NovelChapter {
    return {
        id: 'chapter-1',
        index: 0,
        title: '全文',
        titleStartOffset: 0,
        titleEndOffset: 0,
        startOffset: 0,
        endOffset: textLength,
        charCount: textLength,
    };
}

export function parseNovelText(text: string, metadata: NovelParseMetadata = {}): ParsedNovel {
    if (typeof text !== 'string') {
        throw new NovelParserError('INVALID_FILE', 'Novel text must be a string.');
    }

    const textWithoutBom = stripUtf8Bom(text);
    const normalizedText = normalizeNovelText(textWithoutBom);
    const headings = findHeadings(normalizedText);
    const commonFields = {
        fileName: metadata.fileName ?? 'untitled.txt',
        format: 'txt' as const,
        encoding: metadata.encoding ?? 'utf-8',
        ...(metadata.encodingNotice ? { encodingNotice: metadata.encodingNotice } : {}),
        originalCharCount: textWithoutBom.length,
        normalizedCharCount: normalizedText.length,
        normalizedText,
        parserVersion: ECHOES_NOVEL_PARSER_VERSION,
        ...(metadata.createdAt ? { createdAt: metadata.createdAt } : {}),
    };

    if (headings.length === 0) {
        return {
            ...commonFields,
            chapterCount: 1,
            chapters: [createFullTextChapter(normalizedText.length)],
            prefaceRange: null,
            unattributedRanges: [],
        };
    }

    const chapters = headings.map((heading, index): NovelChapter => {
        const startOffset = heading.lineEndOffset < normalizedText.length
            ? heading.lineEndOffset + 1
            : heading.lineEndOffset;
        const nextHeading = headings[index + 1];
        const endOffset = nextHeading ? nextHeading.lineStartOffset : normalizedText.length;
        return {
            id: `chapter-${index + 1}`,
            index,
            title: heading.title,
            titleStartOffset: heading.titleStartOffset,
            titleEndOffset: heading.titleEndOffset,
            startOffset,
            endOffset,
            charCount: Math.max(0, endOffset - startOffset),
        };
    });

    const firstHeading = headings[0];
    const prefaceRange = normalizedText.slice(0, firstHeading.lineStartOffset).trim()
        ? makeRange(0, firstHeading.lineStartOffset)
        : null;

    return {
        ...commonFields,
        chapterCount: chapters.length,
        chapters,
        prefaceRange,
        unattributedRanges: prefaceRange ? [prefaceRange] : [],
    };
}

/** Reads one chapter body from the document's single normalized text buffer. */
export function getChapterText(document: ParsedNovel, chapter: NovelChapter): string {
    const startOffset = Math.max(0, Math.min(document.normalizedText.length, chapter.startOffset));
    const endOffset = Math.max(startOffset, Math.min(document.normalizedText.length, chapter.endOffset));
    return document.normalizedText.slice(startOffset, endOffset);
}

function normalizeSampleText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
    return aStart < bEnd && bStart < aEnd;
}

function subtractCoveredRanges(
    startOffset: number,
    endOffset: number,
    coveredRanges: Array<[number, number]>,
): Array<[number, number]> {
    let pieces: Array<[number, number]> = [[startOffset, endOffset]];
    for (const [coveredStart, coveredEnd] of coveredRanges) {
        const next: Array<[number, number]> = [];
        for (const [pieceStart, pieceEnd] of pieces) {
            if (!rangesOverlap(pieceStart, pieceEnd, coveredStart, coveredEnd)) {
                next.push([pieceStart, pieceEnd]);
                continue;
            }
            if (pieceStart < coveredStart) next.push([pieceStart, coveredStart]);
            if (coveredEnd < pieceEnd) next.push([coveredEnd, pieceEnd]);
        }
        pieces = next;
    }
    return pieces.filter(([start, end]) => end > start);
}

function takeTextFromRanges(
    text: string,
    ranges: Array<[number, number]>,
    maxChars: number,
): { rawText: string; usedRanges: Array<[number, number]> } {
    if (maxChars <= 0) return { rawText: '', usedRanges: [] };

    const chunks: string[] = [];
    const usedRanges: Array<[number, number]> = [];
    let remaining = maxChars;
    for (const [startOffset, endOffset] of ranges) {
        if (remaining <= 0) break;
        const chunk = text.slice(startOffset, Math.min(endOffset, startOffset + remaining));
        if (!chunk) continue;
        chunks.push(chunk);
        usedRanges.push([startOffset, startOffset + chunk.length]);
        remaining -= chunk.length;
    }
    return { rawText: chunks.join(''), usedRanges };
}

function evenlySpacedChapterIndexes(chapterCount: number, requestedCount: number): number[] {
    if (chapterCount <= 0 || requestedCount <= 0) return [];
    if (requestedCount >= chapterCount) return Array.from({ length: chapterCount }, (_, index) => index);
    if (requestedCount === 1) return [Math.floor((chapterCount - 1) / 2)];

    const indexes: number[] = [];
    const seen = new Set<number>();
    for (let index = 0; index < requestedCount; index += 1) {
        const candidate = Math.round(index * (chapterCount - 1) / (requestedCount - 1));
        if (!seen.has(candidate)) {
            indexes.push(candidate);
            seen.add(candidate);
        }
    }
    return indexes;
}

interface SampleCandidate {
    kind: 'opening' | 'chapter';
    chapter?: NovelChapter;
    startOffset: number;
    endOffset: number;
    preferredChars: number;
    header: string;
}

function finiteNonNegative(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function candidateMinimumCost(candidate: SampleCandidate, hasPrevious: boolean): number {
    return candidate.header.length + 1 + (hasPrevious ? 2 : 0) + 1;
}

function containsDuplicateContent(candidateText: string, emittedContent: string[]): boolean {
    const candidateKey = normalizeSampleText(candidateText);
    if (!candidateKey) return true;

    return emittedContent.some((emitted) => {
        const emittedKey = normalizeSampleText(emitted);
        if (!emittedKey) return false;
        if (emittedKey === candidateKey) return true;
        const shortestLength = Math.min(emittedKey.length, candidateKey.length);
        return shortestLength >= 24 &&
            (emittedKey.includes(candidateKey) || candidateKey.includes(emittedKey));
    });
}

function allocateContentBudgets(candidates: SampleCandidate[], contentBudget: number): number[] {
    if (!candidates.length || contentBudget <= 0) return candidates.map(() => 0);
    const desiredTotal = candidates.reduce((total, candidate) => total + candidate.preferredChars, 0);
    if (desiredTotal <= contentBudget) return candidates.map((candidate) => candidate.preferredChars);

    const base = Math.floor(contentBudget / candidates.length);
    let remainder = contentBudget - base * candidates.length;
    return candidates.map((candidate) => {
        const allocation = base + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder -= 1;
        return Math.min(candidate.preferredChars, allocation);
    });
}

/**
 * Deterministically samples the opening and requested chapter positions. The
 * returned string is always bounded by maxChars; no model or network call is
 * made here.
 */
export function sampleNovelForAnalysis(
    document: ParsedNovel,
    options: NovelSamplingOptions = {},
): string {
    const maxChars = finiteNonNegative(options.maxChars, DEFAULT_SAMPLE_MAX_CHARS);
    if (maxChars <= 0 || !document.normalizedText) return '';

    const openingChars = finiteNonNegative(options.openingChars, DEFAULT_OPENING_CHARS);
    const chapterSnippetChars = finiteNonNegative(options.chapterSnippetChars, DEFAULT_CHAPTER_SNIPPET_CHARS);
    const uniformChapterCount = finiteNonNegative(options.uniformChapterCount, DEFAULT_UNIFORM_CHAPTER_COUNT);
    const candidates: SampleCandidate[] = [];

    if (openingChars > 0) {
        candidates.push({
            kind: 'opening',
            startOffset: 0,
            endOffset: Math.min(document.normalizedText.length, openingChars),
            preferredChars: openingChars,
            header: '=== OPENING ===',
        });
    }

    const seenChapterIds = new Set<string>();
    const addChapterCandidate = (chapter: NovelChapter | undefined): void => {
        if (!chapter || seenChapterIds.has(chapter.id) || chapterSnippetChars <= 0) return;
        if (chapter.startOffset >= chapter.endOffset) return;
        seenChapterIds.add(chapter.id);
        candidates.push({
            kind: 'chapter',
            chapter,
            startOffset: chapter.startOffset,
            endOffset: chapter.endOffset,
            preferredChars: chapterSnippetChars,
            header: `=== CHAPTER: ${chapter.title} ===`,
        });
    };

    for (const chapterId of options.selectedChapterIds ?? []) {
        addChapterCandidate(document.chapters.find((chapter) => chapter.id === chapterId));
    }
    for (const chapterIndex of evenlySpacedChapterIndexes(document.chapters.length, uniformChapterCount)) {
        addChapterCandidate(document.chapters[chapterIndex]);
    }

    // Keep the opening mandatory. For a budget too small to hold its marker,
    // raw beginning text is the only safe representation that still includes it.
    if (!candidates.length) return document.normalizedText.slice(0, maxChars);
    if (maxChars < candidateMinimumCost(candidates[0], false)) {
        return document.normalizedText.slice(0, maxChars);
    }

    // Retain as many priority candidates as can fit at least one body char.
    const includedCandidates: SampleCandidate[] = [];
    let minimumCost = 0;
    for (const candidate of candidates) {
        const cost = candidateMinimumCost(candidate, includedCandidates.length > 0);
        if (minimumCost + cost <= maxChars) {
            includedCandidates.push(candidate);
            minimumCost += cost;
        }
    }
    if (!includedCandidates.length) return document.normalizedText.slice(0, maxChars);

    const overhead = includedCandidates.reduce(
        (total, candidate, index) => total + candidate.header.length + 1 + (index > 0 ? 2 : 0),
        0,
    );
    const budgets = allocateContentBudgets(includedCandidates, Math.max(0, maxChars - overhead));
    const coveredRanges: Array<[number, number]> = [];
    const emittedContent: string[] = [];
    const segments: string[] = [];

    for (let index = 0; index < includedCandidates.length; index += 1) {
        const candidate = includedCandidates[index];
        const uncovered = subtractCoveredRanges(candidate.startOffset, candidate.endOffset, coveredRanges);
        if (!uncovered.length || budgets[index] <= 0) continue;

        const taken = takeTextFromRanges(document.normalizedText, uncovered, budgets[index]);
        const body = taken.rawText.trim();
        if (!body || containsDuplicateContent(body, emittedContent)) continue;

        segments.push(`${candidate.header}\n${body}`);
        emittedContent.push(body);
        coveredRanges.push(...taken.usedRanges);
    }

    if (!segments.length) return document.normalizedText.slice(0, maxChars);
    return segments.join('\n\n').slice(0, maxChars);
}

export async function readNovelFile(
    file: NovelFileLike,
    options: ReadNovelFileOptions = {},
): Promise<ParsedNovel> {
    assertFileLike(file);
    assertMaxBytes(options.maxBytes);

    const format = getNovelFormat(file.name);
    if (format === 'epub') {
        throw new NovelParserError('EPUB_NOT_ENABLED', 'EPUB 解析尚未启用。当前仅支持 TXT 文件。');
    }
    if (format !== 'txt') {
        throw new NovelParserError('UNSUPPORTED_FILE_TYPE', 'Unsupported novel file type. Only .txt is enabled.');
    }

    if (options.maxBytes !== undefined && typeof file.size === 'number' && file.size > options.maxBytes) {
        throw new NovelParserError('FILE_TOO_LARGE', 'The novel file exceeds the configured maxBytes limit.');
    }

    let buffer: ArrayBuffer;
    try {
        buffer = await file.arrayBuffer();
    } catch (cause) {
        throw new NovelParserError('INVALID_FILE', 'Unable to read the novel file.', cause);
    }
    if (!buffer || typeof buffer.byteLength !== 'number') {
        throw new NovelParserError('INVALID_FILE', 'arrayBuffer() did not return an ArrayBuffer.');
    }
    if (options.maxBytes !== undefined && buffer.byteLength > options.maxBytes) {
        throw new NovelParserError('FILE_TOO_LARGE', 'The novel file exceeds the configured maxBytes limit.');
    }

    const decoded = decodeNovelBytes(buffer);
    return parseNovelText(decoded.text, {
        fileName: file.name,
        format: 'txt',
        encoding: decoded.encoding,
        encodingNotice: decoded.encodingNotice,
        createdAt: options.createdAt,
    });
}

/** EPUB boundary only; an EPUB implementation is deliberately not bundled. */
export async function parseNovelEpub(_file: NovelFileLike): Promise<ParsedNovel> {
    throw new NovelParserError('EPUB_NOT_ENABLED', 'EPUB 解析尚未启用。请先启用 EPUB 解析器依赖。');
}

export const epubParser: EpubParser = { parse: parseNovelEpub };
export const parseEpubNovel = parseNovelEpub;
