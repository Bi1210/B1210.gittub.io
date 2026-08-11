import type { NovelChapter, ParsedNovel } from './echoesNovelTypes';
import {
    type NovelChapterMatch,
    type NovelChapterSearchOptions,
    type NovelContextAssemblyOptions,
    type NovelContextQuery,
    type NovelContextResult,
    type NovelContextSegment,
    type NovelContextSelectionOptions,
    type NovelChapterWindow,
    type NovelTextSearchOptions,
    type NovelTextSearchResult,
} from './echoesNovelContextTypes';

const DEFAULT_MAX_CHARS = 12_000;
const DEFAULT_MAX_SEGMENTS = 8;
const DEFAULT_SEGMENT_CHARS = 1_600;
const DEFAULT_OPENING_CHARS = 1_000;
const DEFAULT_UNIFORM_CHAPTER_COUNT = 3;
const DEFAULT_MAX_RELEVANT_CHAPTERS = 8;
const DEFAULT_SEARCH_RESULTS = 20;
const DEFAULT_EXCERPT_CHARS = 180;
const DEFAULT_MAX_MATCHES_PER_CHAPTER = 3;
const CJK_CHARACTER = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

interface QueryBundle {
    normalized: string;
    lower: string;
    phrases: string[];
    terms: string[];
}

interface Occurrence {
    index: number;
    length: number;
}

interface SelectionCandidate {
    kind: NovelContextSegment['kind'];
    chapter?: NovelChapter;
    startOffset: number;
    endOffset: number;
    anchorOffset?: number;
    score: number;
    priority: number;
    sequence: number;
    reason: string;
}

function finiteNonNegative(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.floor(value))
        : fallback;
}

function normalizedQuery(query: string | undefined): string {
    return typeof query === 'string' ? query.trim().replace(/\s+/g, ' ') : '';
}

function uniqueStrings(values: readonly string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        if (!value || seen.has(value)) continue;
        seen.add(value);
        result.push(value);
    }
    return result;
}

function extractQueryTerms(query: string): string[] {
    const parts = query.toLocaleLowerCase().match(/[A-Za-z0-9]+|[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g) ?? [];
    const terms: string[] = [];

    for (const part of parts) {
        if (!CJK_CHARACTER.test(part)) {
            terms.push(part);
            continue;
        }

        if (part.length <= 2) {
            terms.push(part);
            continue;
        }

        // Bigrams make unspaced Chinese queries useful without pretending to
        // understand Chinese word boundaries. The complete phrase is kept as
        // a high-signal term as well.
        terms.push(part);
        for (let index = 0; index < part.length - 1; index += 1) {
            terms.push(part.slice(index, index + 2));
        }
    }

    return uniqueStrings(terms);
}

function makeQueryBundle(query: string | undefined): QueryBundle {
    const normalized = normalizedQuery(query);
    if (!normalized) return { normalized: '', lower: '', phrases: [], terms: [] };

    const lower = normalized.toLocaleLowerCase();
    const compact = lower.replace(/\s+/g, '');
    const phrases = uniqueStrings([lower, compact].filter((value) => value.length >= 2));
    return { normalized, lower, phrases, terms: extractQueryTerms(normalized) };
}

function chapterBody(document: ParsedNovel, chapter: NovelChapter): string {
    const start = Math.max(0, Math.min(document.normalizedText.length, chapter.startOffset));
    const end = Math.max(start, Math.min(document.normalizedText.length, chapter.endOffset));
    return document.normalizedText.slice(start, end);
}

function chapterTitle(chapter: NovelChapter): string {
    return chapter.title || `Chapter ${chapter.index + 1}`;
}

/**
 * Chapters whose text range overlaps any assembled context segment. Used as
 * an attribution fallback when a segment carries no chapterId (e.g. an
 * 'opening' segment whose source range happens to cover whole chapters in a
 * short document, which makes chapter candidates lose their uncovered range
 * in selectNovelContextSegments and get silently dropped).
 */
export function chapterIdsOverlappingSegments(
    document: ParsedNovel,
    segments: readonly NovelContextSegment[],
): string[] {
    if (!segments.length || !document.chapters.length) return [];
    const ids: string[] = [];
    for (const chapter of document.chapters) {
        const chapterStart = Math.min(chapter.titleStartOffset, chapter.startOffset);
        const chapterEnd = Math.max(chapter.endOffset, chapter.titleEndOffset);
        const overlaps = segments.some((segment) => segment.startOffset < chapterEnd && segment.endOffset > chapterStart);
        if (overlaps) ids.push(chapter.id);
    }
    return ids;
}

function countOccurrences(haystack: string, needle: string, limit = 64): Occurrence[] {
    if (!needle || !haystack || limit <= 0) return [];
    const result: Occurrence[] = [];
    let fromIndex = 0;
    while (fromIndex <= haystack.length - needle.length && result.length < limit) {
        const index = haystack.indexOf(needle, fromIndex);
        if (index < 0) break;
        result.push({ index, length: needle.length });
        fromIndex = index + Math.max(1, needle.length);
    }
    return result;
}

function firstOccurrence(haystack: string, needles: readonly string[]): number | undefined {
    let first: number | undefined;
    for (const needle of needles) {
        const index = haystack.indexOf(needle);
        if (index >= 0 && (first === undefined || index < first)) first = index;
    }
    return first;
}

function countTermHits(text: string, terms: readonly string[]): string[] {
    return terms.filter((term) => text.includes(term));
}

function joinedReasons(reasons: readonly string[]): string {
    return uniqueStrings(reasons).join('；');
}

function compareChapterMatches(a: NovelChapterMatch, b: NovelChapterMatch): number {
    const aHasTitleHit = a.titleMatchedTerms.length > 0 ? 1 : 0;
    const bHasTitleHit = b.titleMatchedTerms.length > 0 ? 1 : 0;
    return bHasTitleHit - aHasTitleHit ||
        b.titleMatchedTerms.length - a.titleMatchedTerms.length ||
        b.score - a.score ||
        b.matchedTerms.length - a.matchedTerms.length ||
        a.chapterIndex - b.chapterIndex ||
        a.chapterId.localeCompare(b.chapterId);
}

function normalizeSearchLimit(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.floor(value))
        : fallback;
}

/**
 * Finds chapters using title and body matches. It deliberately returns an
 * empty list for an empty query instead of treating every chapter as relevant.
 */
export function findRelevantNovelChapters(
    document: ParsedNovel,
    query: string | undefined,
    options: NovelChapterSearchOptions = {},
): NovelChapterMatch[] {
    const bundle = makeQueryBundle(query);
    if (!bundle.normalized || !bundle.terms.length || !document.chapters.length) return [];

    const maxResults = normalizeSearchLimit(options.maxResults, DEFAULT_MAX_RELEVANT_CHAPTERS);
    if (maxResults <= 0) return [];
    const minScore = typeof options.minScore === 'number' && Number.isFinite(options.minScore)
        ? options.minScore
        : 0;
    const results: NovelChapterMatch[] = [];

    for (const chapter of document.chapters) {
        const title = chapterTitle(chapter);
        const titleLower = title.toLocaleLowerCase();
        const bodyLower = chapterBody(document, chapter).toLocaleLowerCase();
        const titleMatchedTerms = countTermHits(titleLower, bundle.terms);
        const bodyMatchedTerms = countTermHits(bodyLower, bundle.terms);
        const titlePhrase = bundle.phrases.some((phrase) => titleLower.includes(phrase));
        const bodyPhrase = bundle.phrases.some((phrase) => bodyLower.includes(phrase));

        if (!titleMatchedTerms.length && !bodyMatchedTerms.length && !titlePhrase && !bodyPhrase) continue;

        // Title hits carry a larger base weight than body hits, so a direct
        // title match remains ahead of a weak body-only match.
        const score =
            (titlePhrase ? 260 : 0) +
            titleMatchedTerms.length * 55 +
            (bodyPhrase ? 85 : 0) +
            bodyMatchedTerms.length * 10 +
            (titleMatchedTerms.length + bodyMatchedTerms.length) * 2;
        if (score < minScore) continue;

        const reasons: string[] = [];
        if (titlePhrase) reasons.push('标题短语命中');
        if (titleMatchedTerms.length) reasons.push(`标题关键词命中：${titleMatchedTerms.join('、')}`);
        if (bodyPhrase) reasons.push('正文短语命中');
        if (bodyMatchedTerms.length) reasons.push(`正文关键词命中：${bodyMatchedTerms.join('、')}`);

        const titleFirst = firstOccurrence(titleLower, titleMatchedTerms.length ? titleMatchedTerms : bundle.phrases);
        const bodyFirst = firstOccurrence(bodyLower, bodyMatchedTerms.length ? bodyMatchedTerms : bundle.phrases);
        const firstMatchOffset = titleFirst !== undefined
            ? chapter.titleStartOffset + titleFirst
            : bodyFirst !== undefined
                ? chapter.startOffset + bodyFirst
                : undefined;

        results.push({
            chapterId: chapter.id,
            chapterIndex: chapter.index,
            chapterTitle: title,
            score,
            reason: joinedReasons(reasons),
            reasons,
            matchedTerms: uniqueStrings([...titleMatchedTerms, ...bodyMatchedTerms]),
            titleMatchedTerms,
            bodyMatchedTerms,
            ...(firstMatchOffset !== undefined ? { firstMatchOffset } : {}),
        });
    }

    // A direct hit also makes its immediate neighbors useful context. These
    // synthetic matches stay below every direct title/body hit and carry no
    // fake keyword offset; they only identify the adjacency reason.
    const directIndexes = new Set(results.map((result) => result.chapterIndex));
    const adjacent = new Map<number, NovelChapterMatch>();
    for (const direct of results) {
        for (const neighborIndex of [direct.chapterIndex - 1, direct.chapterIndex + 1]) {
            if (neighborIndex < 0 || neighborIndex >= document.chapters.length || directIndexes.has(neighborIndex)) continue;
            const neighbor = document.chapters[neighborIndex];
            const reason = `邻接章节：${direct.chapterTitle} 命中查询`;
            const existing = adjacent.get(neighborIndex);
            if (existing) {
                existing.score = Math.max(existing.score, 8);
                if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
                existing.reason = joinedReasons(existing.reasons);
            } else {
                adjacent.set(neighborIndex, {
                    chapterId: neighbor.id,
                    chapterIndex: neighbor.index,
                    chapterTitle: chapterTitle(neighbor),
                    score: 8,
                    reason,
                    reasons: [reason],
                    matchedTerms: [],
                    titleMatchedTerms: [],
                    bodyMatchedTerms: [],
                });
            }
        }
    }

    return [...results, ...adjacent.values()].sort(compareChapterMatches).slice(0, maxResults);
}

function clampOffset(document: ParsedNovel, offset: number): number {
    return Math.max(0, Math.min(document.normalizedText.length, Number.isFinite(offset) ? Math.floor(offset) : 0));
}

function boundedRange(document: ParsedNovel, startOffset: number, endOffset: number): [number, number] {
    const start = clampOffset(document, startOffset);
    const end = Math.max(start, Math.min(document.normalizedText.length, Number.isFinite(endOffset) ? Math.floor(endOffset) : start));
    return [start, end];
}

function subtractRanges(
    startOffset: number,
    endOffset: number,
    usedRanges: readonly [number, number][],
): Array<[number, number]> {
    let pieces: Array<[number, number]> = [[startOffset, endOffset]];
    for (const [usedStart, usedEnd] of usedRanges) {
        const next: Array<[number, number]> = [];
        for (const [pieceStart, pieceEnd] of pieces) {
            if (pieceStart >= usedEnd || usedStart >= pieceEnd) {
                next.push([pieceStart, pieceEnd]);
                continue;
            }
            if (pieceStart < usedStart) next.push([pieceStart, Math.min(usedStart, pieceEnd)]);
            if (usedEnd < pieceEnd) next.push([Math.max(usedEnd, pieceStart), pieceEnd]);
        }
        pieces = next.filter(([start, end]) => end > start);
    }
    return pieces;
}

function chooseRange(
    pieces: readonly [number, number][],
    anchorOffset: number | undefined,
): [number, number] | null {
    if (!pieces.length) return null;
    if (anchorOffset !== undefined) {
        const containing = pieces.find(([start, end]) => anchorOffset >= start && anchorOffset < end);
        if (containing) return containing;
    }
    return pieces.reduce((best, piece) =>
        piece[1] - piece[0] > best[1] - best[0] ? piece : best,
    pieces[0]);
}

function clipRangeAroundAnchor(
    startOffset: number,
    endOffset: number,
    maxChars: number,
    anchorOffset?: number,
): [number, number] {
    if (endOffset <= startOffset) return [startOffset, startOffset];
    if (maxChars <= 0 || endOffset - startOffset <= maxChars) return [startOffset, endOffset];

    if (anchorOffset === undefined || anchorOffset < startOffset || anchorOffset >= endOffset) {
        return [startOffset, Math.min(endOffset, startOffset + maxChars)];
    }

    let start = Math.max(startOffset, anchorOffset - Math.floor(maxChars / 2));
    let end = Math.min(endOffset, start + maxChars);
    if (end - start < maxChars) start = Math.max(startOffset, end - maxChars);
    return [start, end];
}

function appendReason(candidate: SelectionCandidate, reason: string): void {
    if (!reason || candidate.reason.includes(reason)) return;
    candidate.reason = `${candidate.reason}；${reason}`;
}

function candidatePriority(kind: NovelContextSegment['kind']): number {
    switch (kind) {
        case 'chapter': return 0;
        case 'match': return 50;
        case 'opening': return 70;
        case 'preface': return 75;
        default: return 100;
    }
}

function ensureChapterSegmentRange(document: ParsedNovel, chapter: NovelChapter): [number, number] {
    const body = boundedRange(document, chapter.startOffset, chapter.endOffset);
    if (body[1] > body[0]) return body;
    return boundedRange(document, chapter.titleStartOffset, chapter.titleEndOffset);
}

function evenlySpacedIndexes(chapterCount: number, requestedCount: number): number[] {
    if (chapterCount <= 0 || requestedCount <= 0) return [];
    if (requestedCount >= chapterCount) return Array.from({ length: chapterCount }, (_, index) => index);
    if (requestedCount === 1) return [Math.floor((chapterCount - 1) / 2)];

    const result: number[] = [];
    const seen = new Set<number>();
    for (let index = 0; index < requestedCount; index += 1) {
        const candidate = Math.round(index * (chapterCount - 1) / (requestedCount - 1));
        if (!seen.has(candidate)) {
            seen.add(candidate);
            result.push(candidate);
        }
    }
    return result;
}

function isDuplicateSegmentText(text: string, existing: readonly string[]): boolean {
    const key = text.replace(/\s+/g, ' ').trim();
    if (!key) return true;
    return existing.some((previous) => {
        const previousKey = previous.replace(/\s+/g, ' ').trim();
        if (!previousKey) return false;
        if (previousKey === key) return true;
        const shortest = Math.min(previousKey.length, key.length);
        return shortest >= 32 && (previousKey.includes(key) || key.includes(previousKey));
    });
}

function makeSegment(
    document: ParsedNovel,
    candidate: SelectionCandidate,
    usedRanges: Array<[number, number]>,
    emittedTexts: string[],
    segmentChars: number,
    openingChars: number,
): NovelContextSegment | null {
    const [baseStart, baseEnd] = boundedRange(document, candidate.startOffset, candidate.endOffset);
    const uncovered = subtractRanges(baseStart, baseEnd, usedRanges);
    const chosen = chooseRange(uncovered, candidate.anchorOffset);
    if (!chosen) return null;

    const sourceLimit = candidate.kind === 'opening' ? openingChars : segmentChars;
    if (sourceLimit <= 0) return null;
    const [startOffset, endOffset] = clipRangeAroundAnchor(
        chosen[0],
        chosen[1],
        sourceLimit,
        candidate.anchorOffset,
    );
    if (endOffset <= startOffset) return null;

    const text = document.normalizedText.slice(startOffset, endOffset);
    if (isDuplicateSegmentText(text, emittedTexts)) return null;

    usedRanges.push([startOffset, endOffset]);
    emittedTexts.push(text);
    return {
        kind: candidate.kind,
        ...(candidate.chapter ? {
            chapterId: candidate.chapter.id,
            chapterIndex: candidate.chapter.index,
            chapterTitle: chapterTitle(candidate.chapter),
        } : {}),
        startOffset,
        endOffset,
        text,
        score: candidate.score,
        reason: candidate.reason,
    };
}

function selectionCandidateCompare(a: SelectionCandidate, b: SelectionCandidate): number {
    return a.priority - b.priority || b.score - a.score || a.sequence - b.sequence;
}

/**
 * Selects bounded source ranges in priority order. Segment text is limited to
 * a chapter snippet; the original document remains the only full-text store.
 */
export function selectNovelContextSegments(
    document: ParsedNovel,
    options: NovelContextSelectionOptions = {},
): NovelContextSegment[] {
    const maxSegments = finiteNonNegative(options.maxSegments, DEFAULT_MAX_SEGMENTS);
    if (maxSegments <= 0 || !document.normalizedText || !document.chapters.length) return [];

    const segmentChars = finiteNonNegative(options.segmentChars, DEFAULT_SEGMENT_CHARS);
    const openingChars = finiteNonNegative(options.openingChars, DEFAULT_OPENING_CHARS);
    const radius = finiteNonNegative(options.nearbyChapterRadius, 1);
    const candidates: SelectionCandidate[] = [];
    const byChapterId = new Map<string, SelectionCandidate>();
    let sequence = 0;

    const addChapterCandidate = (
        chapter: NovelChapter | undefined,
        kind: 'chapter' | 'match',
        priority: number,
        score: number,
        reason: string,
        anchorOffset?: number,
    ): void => {
        if (!chapter) return;
        const existing = byChapterId.get(chapter.id);
        if (existing) {
            if (priority < existing.priority) {
                existing.priority = priority;
                existing.kind = kind === 'chapter' || existing.kind === 'chapter' ? 'chapter' : 'match';
            }
            existing.score = Math.max(existing.score, score);
            appendReason(existing, reason);
            if (existing.anchorOffset === undefined && anchorOffset !== undefined) existing.anchorOffset = anchorOffset;
            return;
        }

        const [startOffset, endOffset] = ensureChapterSegmentRange(document, chapter);
        const candidate: SelectionCandidate = {
            kind,
            chapter,
            startOffset,
            endOffset,
            ...(anchorOffset !== undefined ? { anchorOffset } : {}),
            score,
            priority,
            sequence,
            reason,
        };
        sequence += 1;
        candidates.push(candidate);
        byChapterId.set(chapter.id, candidate);
    };

    const chaptersById = new Map(document.chapters.map((chapter) => [chapter.id, chapter]));
    const selectedIds = uniqueStrings((options.selectedChapterIds ?? []).map(String));
    selectedIds.forEach((chapterId, index) => {
        addChapterCandidate(
            chaptersById.get(chapterId),
            'chapter',
            index * 0.01,
            1_000 - index,
            '用户指定章节',
        );
    });

    const currentChapter = chaptersById.get(options.currentChapterId ?? '');
    if (currentChapter) {
        addChapterCandidate(currentChapter, 'chapter', 10, 900, '当前章节');
        const currentIndex = document.chapters.indexOf(currentChapter);
        for (let distance = 1; distance <= radius; distance += 1) {
            const before = document.chapters[currentIndex - distance];
            const after = document.chapters[currentIndex + distance];
            if (before) addChapterCandidate(before, 'chapter', 20 + distance * 0.1, 800 - distance, '当前章节前邻', before.startOffset);
            if (after) addChapterCandidate(after, 'chapter', 20 + distance * 0.1, 800 - distance, '当前章节后邻', after.startOffset);
        }
    }

    const relevant = findRelevantNovelChapters(document, options.query, {
        maxResults: finiteNonNegative(options.maxRelevantChapters, DEFAULT_MAX_RELEVANT_CHAPTERS),
    });
    for (const match of relevant) {
        addChapterCandidate(
            chaptersById.get(match.chapterId),
            'match',
            50,
            500 + match.score,
            `查询命中：${match.reason}`,
            match.firstMatchOffset,
        );
    }

    if (options.includeOpening !== false && openingChars > 0 && document.normalizedText.length > 0) {
        // When the caller explicitly asks for the preface too, move the
        // opening cursor past it. Otherwise both candidates would point to
        // the same source range and deterministic de-duplication would drop
        // one of them.
        const openingStart = options.includePreface === true && document.prefaceRange
            ? document.prefaceRange.endOffset
            : 0;
        if (openingStart < document.normalizedText.length) {
            candidates.push({
                kind: 'opening',
                startOffset: openingStart,
                endOffset: Math.min(document.normalizedText.length, openingStart + openingChars),
                score: 300,
                priority: 70,
                sequence,
                reason: '开头片段',
            });
            sequence += 1;
        }
    }

    if (options.includePreface === true && document.prefaceRange) {
        candidates.push({
            kind: 'preface',
            startOffset: document.prefaceRange.startOffset,
            endOffset: document.prefaceRange.endOffset,
            score: 290,
            priority: 75,
            sequence,
            reason: '前言或未归属正文',
        });
        sequence += 1;
    }

    const uniformCount = finiteNonNegative(options.uniformChapterCount, DEFAULT_UNIFORM_CHAPTER_COUNT);
    for (const chapterIndex of evenlySpacedIndexes(document.chapters.length, uniformCount)) {
        const chapter = document.chapters[chapterIndex];
        addChapterCandidate(chapter, 'chapter', 100 + chapterIndex * 0.01, 100, '全书均匀采样');
    }

    candidates.sort(selectionCandidateCompare);
    let selected = candidates.slice(0, maxSegments);

    const ensureOptionalCandidate = (kind: 'opening' | 'preface'): void => {
        const candidate = candidates.find((item) => item.kind === kind);
        if (!candidate || selected.includes(candidate)) return;
        const replaceableIndex = selected.reduce((bestIndex, item, index) =>
            item.priority >= 100 && (bestIndex < 0 || item.priority > selected[bestIndex].priority)
                ? index
                : bestIndex,
        -1);
        if (replaceableIndex >= 0) selected = [...selected.slice(0, replaceableIndex), candidate, ...selected.slice(replaceableIndex + 1)];
    };
    if (options.includeOpening !== false) ensureOptionalCandidate('opening');
    if (options.includePreface === true) ensureOptionalCandidate('preface');
    selected.sort(selectionCandidateCompare);

    const usedRanges: Array<[number, number]> = [];
    const emittedTexts: string[] = [];
    const result: NovelContextSegment[] = [];
    for (const candidate of selected) {
        const segment = makeSegment(document, candidate, usedRanges, emittedTexts, segmentChars, openingChars);
        if (segment) result.push(segment);
    }
    return result;
}

function segmentLabel(segment: NovelContextSegment): string {
    if (segment.chapterTitle) return segment.chapterTitle;
    if (segment.kind === 'preface') return '前言';
    if (segment.kind === 'opening') return '开头片段';
    return '原著片段';
}

function segmentMarker(segment: NovelContextSegment): string {
    return `=== ${segmentLabel(segment)} ===`;
}

function safeSegmentSource(document: ParsedNovel, segment: NovelContextSegment): NovelContextSegment | null {
    const [startOffset, endOffset] = boundedRange(document, segment.startOffset, segment.endOffset);
    if (endOffset <= startOffset) return null;
    return {
        ...segment,
        startOffset,
        endOffset,
        text: document.normalizedText.slice(startOffset, endOffset),
    };
}

/** Assembles selected source ranges with markers and a hard output budget. */
export function assembleNovelContext(
    document: ParsedNovel,
    options: NovelContextAssemblyOptions = {},
): NovelContextResult {
    const maxChars = finiteNonNegative(options.maxChars, DEFAULT_MAX_CHARS);
    const query = normalizedQuery(options.query);
    const sourceSegments = options.segments
        ? [...options.segments]
        : selectNovelContextSegments(document, options);
    const maxSegments = finiteNonNegative(options.maxSegments, DEFAULT_MAX_SEGMENTS);
    const candidates = sourceSegments
        .slice(0, maxSegments)
        .map((segment) => safeSegmentSource(document, segment))
        .filter((segment): segment is NovelContextSegment => segment !== null);

    if (maxChars <= 0 || !candidates.length) {
        return {
            text: '',
            segments: [],
            usedChars: 0,
            truncated: candidates.length > 0,
            query,
        };
    }

    let text = '';
    let truncated = false;
    const segments: NovelContextSegment[] = [];
    const emittedTexts: string[] = [];

    for (const candidate of candidates) {
        const sourceText = candidate.text;
        if (isDuplicateSegmentText(sourceText, emittedTexts)) {
            truncated = true;
            continue;
        }

        const separator = text ? '\n\n' : '';
        const marker = segmentMarker(candidate);
        const prefix = `${separator}${marker}\n`;
        const remaining = maxChars - text.length;
        if (remaining <= 0) {
            truncated = true;
            break;
        }

        if (prefix.length >= remaining) {
            text += prefix.slice(0, remaining);
            truncated = true;
            break;
        }

        const bodyBudget = remaining - prefix.length;
        const body = sourceText.slice(0, bodyBudget);
        text += prefix + body;
        if (body.length > 0) {
            segments.push({
                ...candidate,
                endOffset: candidate.startOffset + body.length,
                text: body,
            });
            emittedTexts.push(body);
        }
        if (body.length < sourceText.length) {
            truncated = true;
            break;
        }
    }

    return {
        text: text.slice(0, maxChars),
        segments,
        usedChars: Math.min(text.length, maxChars),
        truncated,
        query,
    };
}

/** Combines selection and assembly for callers that only need one entry point. */
export function getNovelContext(
    document: ParsedNovel,
    options: NovelContextQuery = {},
): NovelContextResult {
    const segments = selectNovelContextSegments(document, options);
    return assembleNovelContext(document, { ...options, segments });
}

/** Returns chapter metadata for the current chapter and its bounded neighbors. */
export function getNovelChapterWindow(
    document: ParsedNovel,
    chapterId: string,
    radius = 1,
): NovelChapterWindow {
    const chapterIndex = document.chapters.findIndex((chapter) => chapter.id === chapterId);
    if (chapterIndex < 0) return [];
    const safeRadius = finiteNonNegative(radius, 1);
    return document.chapters.slice(
        Math.max(0, chapterIndex - safeRadius),
        Math.min(document.chapters.length, chapterIndex + safeRadius + 1),
    );
}

function makeExcerpt(
    document: ParsedNovel,
    matchStart: number,
    matchEnd: number,
    boundaryStart: number,
    boundaryEnd: number,
    excerptChars: number,
): string {
    const limit = Math.max(0, Math.floor(excerptChars));
    if (limit <= 0) return '';
    const [safeBoundaryStart, safeBoundaryEnd] = boundedRange(document, boundaryStart, boundaryEnd);
    const [safeMatchStart, safeMatchEnd] = boundedRange(document, matchStart, matchEnd);
    if (safeBoundaryEnd <= safeBoundaryStart) return '';

    const matchLength = Math.max(0, safeMatchEnd - safeMatchStart);
    if (matchLength >= limit) return document.normalizedText.slice(safeMatchStart, safeMatchStart + limit);

    const contextBudget = limit - matchLength;
    let start = Math.max(safeBoundaryStart, safeMatchStart - Math.floor(contextBudget / 2));
    let end = Math.min(safeBoundaryEnd, start + limit);
    if (end - start < limit) start = Math.max(safeBoundaryStart, end - limit);
    return document.normalizedText.slice(start, end);
}

/** Searches bounded title/body occurrences and returns short source excerpts. */
export function searchNovelText(
    document: ParsedNovel,
    query: string | undefined,
    options: NovelTextSearchOptions = {},
): NovelTextSearchResult[] {
    const bundle = makeQueryBundle(query);
    if (!bundle.normalized || !bundle.terms.length || !document.chapters.length) return [];

    const maxResults = normalizeSearchLimit(options.maxResults, DEFAULT_SEARCH_RESULTS);
    const maxPerChapter = normalizeSearchLimit(options.maxMatchesPerChapter, DEFAULT_MAX_MATCHES_PER_CHAPTER);
    const excerptChars = normalizeSearchLimit(options.excerptChars, DEFAULT_EXCERPT_CHARS);
    if (maxResults <= 0 || maxPerChapter <= 0) return [];

    const patterns = uniqueStrings([...bundle.phrases, ...bundle.terms]);
    const results: NovelTextSearchResult[] = [];
    for (const chapter of document.chapters) {
        const chapterResults = new Map<string, NovelTextSearchResult>();
        const title = chapterTitle(chapter);
        const titleLower = title.toLocaleLowerCase();
        const body = chapterBody(document, chapter);
        const bodyLower = body.toLocaleLowerCase();

        for (const pattern of patterns) {
            const phraseWeight = bundle.phrases.includes(pattern) ? 70 : 0;
            for (const occurrence of countOccurrences(titleLower, pattern, maxPerChapter * 2)) {
                const startOffset = chapter.titleStartOffset + occurrence.index;
                const endOffset = startOffset + occurrence.length;
                const key = `${startOffset}:${endOffset}`;
                chapterResults.set(key, {
                    chapterId: chapter.id,
                    chapterIndex: chapter.index,
                    chapterTitle: title,
                    matchOffset: startOffset,
                    matchedText: document.normalizedText.slice(startOffset, endOffset),
                    surroundingExcerpt: makeExcerpt(
                        document,
                        startOffset,
                        endOffset,
                        chapter.titleStartOffset,
                        chapter.titleEndOffset,
                        excerptChars,
                    ),
                    score: 250 + phraseWeight + pattern.length,
                });
            }
            for (const occurrence of countOccurrences(bodyLower, pattern, maxPerChapter * 2)) {
                const startOffset = chapter.startOffset + occurrence.index;
                const endOffset = startOffset + occurrence.length;
                const key = `${startOffset}:${endOffset}`;
                chapterResults.set(key, {
                    chapterId: chapter.id,
                    chapterIndex: chapter.index,
                    chapterTitle: title,
                    matchOffset: startOffset,
                    matchedText: document.normalizedText.slice(startOffset, endOffset),
                    surroundingExcerpt: makeExcerpt(
                        document,
                        startOffset,
                        endOffset,
                        chapter.startOffset,
                        chapter.endOffset,
                        excerptChars,
                    ),
                    score: 50 + phraseWeight + pattern.length,
                });
            }
        }

        const rankedChapterResults = [...chapterResults.values()]
            .sort((a, b) => b.score - a.score || a.matchOffset - b.matchOffset)
            .slice(0, maxPerChapter);
        results.push(...rankedChapterResults);
    }

    return results
        .sort((a, b) => b.score - a.score || a.chapterIndex - b.chapterIndex || a.matchOffset - b.matchOffset)
        .slice(0, maxResults);
}
