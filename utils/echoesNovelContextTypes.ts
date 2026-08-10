import type { NovelChapter } from './echoesNovelTypes';

export interface NovelContextQuery {
    query?: string;
    currentChapterId?: string;
    selectedChapterIds?: readonly string[];
    nearbyChapterRadius?: number;
    maxChars?: number;
    maxSegments?: number;
    includeOpening?: boolean;
    includePreface?: boolean;
    /** Maximum source characters copied into one selected segment. */
    segmentChars?: number;
    /** Opening segment source-character limit. */
    openingChars?: number;
    /** Number of evenly distributed chapters used as a low-priority fallback. */
    uniformChapterCount?: number;
    /** Maximum number of query-hit chapters considered. */
    maxRelevantChapters?: number;
}

export interface NovelContextSegment {
    kind: 'opening' | 'preface' | 'chapter' | 'match';
    chapterId?: string;
    chapterIndex?: number;
    chapterTitle?: string;
    startOffset: number;
    endOffset: number;
    text: string;
    score: number;
    reason: string;
}

export interface NovelContextResult {
    text: string;
    segments: NovelContextSegment[];
    usedChars: number;
    truncated: boolean;
    query: string;
}

export interface NovelChapterMatch {
    chapterId: string;
    chapterIndex: number;
    chapterTitle: string;
    score: number;
    reason: string;
    reasons: string[];
    matchedTerms: string[];
    titleMatchedTerms: string[];
    bodyMatchedTerms: string[];
    firstMatchOffset?: number;
}

export interface NovelChapterSearchOptions {
    maxResults?: number;
    minScore?: number;
}

export interface NovelTextSearchOptions {
    maxResults?: number;
    excerptChars?: number;
    maxMatchesPerChapter?: number;
}

export interface NovelTextSearchResult {
    chapterId: string;
    chapterIndex: number;
    chapterTitle: string;
    matchOffset: number;
    matchedText: string;
    surroundingExcerpt: string;
    score: number;
}

export type NovelContextSelectionOptions = NovelContextQuery;

export interface NovelContextAssemblyOptions extends NovelContextQuery {
    /** Use preselected segments instead of selecting them again. */
    segments?: readonly NovelContextSegment[];
}

export type NovelChapterWindow = NovelChapter[];
