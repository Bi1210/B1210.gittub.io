export const ECHOES_NOVEL_PARSER_VERSION = 'echoes-novel-parser/1';

export type NovelFormat = 'txt' | 'epub';

export type NovelEncoding = 'utf-8' | 'gb18030' | 'gbk' | 'utf-8-fallback';

export interface NovelTextRange {
    startOffset: number;
    endOffset: number;
    charCount: number;
}

/**
 * Chapter offsets point to the chapter body, excluding the title line and its
 * line ending. Offsets use JavaScript string indices into normalizedText.
 */
export interface NovelChapter {
    id: string;
    index: number;
    title: string;
    titleStartOffset: number;
    titleEndOffset: number;
    startOffset: number;
    endOffset: number;
    charCount: number;
}

export interface ParsedNovel {
    fileName: string;
    format: NovelFormat;
    encoding: NovelEncoding;
    encodingNotice?: string;
    originalCharCount: number;
    normalizedCharCount: number;
    normalizedText: string;
    chapterCount: number;
    chapters: NovelChapter[];
    prefaceRange: NovelTextRange | null;
    unattributedRanges: NovelTextRange[];
    parserVersion: string;
    createdAt?: string;
}

export interface NovelParseMetadata {
    fileName?: string;
    format?: 'txt';
    encoding?: NovelEncoding;
    encodingNotice?: string;
    createdAt?: string;
}

/** The small file surface needed by the browser adapter and tests. */
export interface NovelFileLike {
    name: string;
    size?: number;
    arrayBuffer(): Promise<ArrayBuffer> | ArrayBuffer;
}

export interface ReadNovelFileOptions {
    /** No default limit is imposed by the parser. */
    maxBytes?: number;
    createdAt?: string;
}

export interface NovelSamplingOptions {
    /** Defaults to 12000. Values below zero are treated as zero. */
    maxChars?: number;
    /** Chapter IDs to include before automatically selected chapters. */
    selectedChapterIds?: readonly string[];
    /** Defaults to six evenly distributed chapters. */
    uniformChapterCount?: number;
    /** Defaults to 1200, scaled down for small budgets. */
    openingChars?: number;
    /** Defaults to 600 characters per chapter fragment. */
    chapterSnippetChars?: number;
}

export type NovelParserErrorCode =
    | 'INVALID_FILE'
    | 'INVALID_OPTION'
    | 'UNSUPPORTED_FILE_TYPE'
    | 'FILE_TOO_LARGE'
    | 'DECODE_FAILED'
    | 'EPUB_NOT_ENABLED';

export interface NovelDecodedText {
    text: string;
    encoding: NovelEncoding;
    encodingNotice?: string;
}

export interface EpubParser {
    parse(file: NovelFileLike): Promise<ParsedNovel>;
}
