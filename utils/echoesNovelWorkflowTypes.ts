import type {
    NovelFileLike,
    NovelSamplingOptions,
    NovelParseMetadata,
    ParsedNovel,
    ReadNovelFileOptions,
} from './echoesNovelTypes';
import type {
    NovelContextQuery,
    NovelContextResult,
} from './echoesNovelContextTypes';
import type {
    NovelAnalysis,
    NovelAnalysisParseResult,
    NovelAnalysisSourceOptions,
} from './echoesNovelAnalysisTypes';

export const ECHOES_NOVEL_WORKFLOW_VERSION = 'echoes-novel-workflow/1' as const;

/** The narrow request boundary used by the workflow; API details stay outside. */
export type NovelAnalysisRequester = (
    prompt: string,
    maxTokens?: number,
) => Promise<unknown>;

export interface NovelAnalysisWorkflowOptions {
    source?: NovelAnalysisSourceOptions;
    language?: string;
    context?: NovelContextQuery;
    /** Parser sampling options retained for callers that build a fallback sample. */
    sampling?: NovelSamplingOptions;
    read?: ReadNovelFileOptions;
    maxTokens?: number;
    rawTextMaxChars?: number;
}

export interface NovelAnalysisPreparation {
    workflowVersion: typeof ECHOES_NOVEL_WORKFLOW_VERSION;
    prompt: string;
    context: NovelContextResult;
    contextOptions: NovelContextQuery;
    /** Derived only from context.segments; never from the full document. */
    source: NovelAnalysisSourceOptions;
}

export type NovelAnalysisWorkflowErrorStage = 'read' | 'context' | 'request' | 'parse';

export interface NovelAnalysisWorkflowError {
    stage: NovelAnalysisWorkflowErrorStage;
    message: string;
    code?: string;
}

export interface NovelAnalysisWorkflowResult {
    document: ParsedNovel | null;
    preparation: NovelAnalysisPreparation | null;
    analysis: NovelAnalysis;
    parseResult: NovelAnalysisParseResult;
    error?: NovelAnalysisWorkflowError;
}

/** Options for analyzeNovelFile; the file itself is the first function argument. */
export type NovelAnalysisFileOptions = NovelAnalysisWorkflowOptions;

/** Metadata accepted by the parser adapter without exposing the full source text. */
export type NovelAnalysisDocumentMetadata = Pick<NovelParseMetadata, 'fileName' | 'encodingNotice' | 'createdAt'>;
