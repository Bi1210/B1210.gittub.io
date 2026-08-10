import {
    getNovelContext,
} from './echoesNovelContext';
import {
    buildNovelAnalysisPrompt,
    parseNovelAnalysisResult,
} from './echoesNovelAnalysis';
import {
    readNovelFile,
} from './echoesNovelParser';
import type {
    NovelContextQuery,
} from './echoesNovelContextTypes';
import type {
    NovelAnalysisParseResult,
    NovelAnalysisSourceOptions,
} from './echoesNovelAnalysisTypes';
import type {
    ParsedNovel,
    NovelFileLike,
} from './echoesNovelTypes';
import {
    ECHOES_NOVEL_WORKFLOW_VERSION,
    type NovelAnalysisFileOptions,
    type NovelAnalysisPreparation,
    type NovelAnalysisRequester,
    type NovelAnalysisWorkflowError,
    type NovelAnalysisWorkflowErrorStage,
    type NovelAnalysisWorkflowOptions,
    type NovelAnalysisWorkflowResult,
} from './echoesNovelWorkflowTypes';

const DEFAULT_CONTEXT_MAX_CHARS = 12_000;
const DEFAULT_CONTEXT_MAX_SEGMENTS = 8;
const DEFAULT_UNIFORM_CHAPTER_COUNT = 3;
const MAX_SOURCE_EXCERPT_CHARS = 500;
const MAX_ERROR_MESSAGE_CHARS = 500;
const MAX_RAW_RESPONSE_CHARS = 8_000;

function boundedText(value: unknown, maxChars: number): string {
    return typeof value === 'string' ? value.trim().slice(0, maxChars) : '';
}

function uniqueStrings(values: readonly string[], maxChars: number): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const normalized = boundedText(value, maxChars);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        result.push(normalized);
    }
    return result;
}

function safeFileName(file: NovelFileLike | null | undefined): string {
    return file && typeof file.name === 'string' ? boundedText(file.name, 500) : '';
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.floor(value))
        : fallback;
}

function defaultContextOptions(options: NovelAnalysisWorkflowOptions): NovelContextQuery {
    const context = options.context ?? {};
    return {
        ...context,
        includeOpening: context.includeOpening ?? true,
        uniformChapterCount: nonNegativeInteger(context.uniformChapterCount, DEFAULT_UNIFORM_CHAPTER_COUNT),
        maxChars: nonNegativeInteger(context.maxChars, DEFAULT_CONTEXT_MAX_CHARS),
        maxSegments: nonNegativeInteger(context.maxSegments, DEFAULT_CONTEXT_MAX_SEGMENTS),
    };
}

function sourceFromDocument(
    document: ParsedNovel,
    context: NovelAnalysisPreparation['context'],
    options: NovelAnalysisWorkflowOptions,
): NovelAnalysisSourceOptions {
    const source = options.source ?? {};
    const chapterIds = uniqueStrings(
        context.segments
            .map((segment) => segment.chapterId)
            .filter((value): value is string => typeof value === 'string'),
        120,
    );
    const chapterTitles = uniqueStrings(
        context.segments
            .map((segment) => segment.chapterTitle)
            .filter((value): value is string => typeof value === 'string'),
        500,
    );
    const fileName = boundedText(source.sourceFileName ?? document.fileName, 500);
    const sourceTitle = boundedText(source.sourceTitle ?? document.fileName, 500);
    const title = boundedText(source.title ?? sourceTitle, 500);
    const sourceExcerpt = boundedText(context.text, MAX_SOURCE_EXCERPT_CHARS);
    const createdAt = boundedText(source.createdAt ?? document.createdAt ?? '', 80);

    return {
        ...source,
        title,
        sourceKind: boundedText(source.sourceKind ?? 'novel_context', 120),
        sourceTitle,
        sourceFileName: fileName,
        sourceChapterIds: chapterIds,
        sourceChapterTitles: chapterTitles,
        sourceExcerpt,
        ...(createdAt ? { createdAt } : {}),
    };
}

function boundedRawTextMaxChars(value: number | undefined): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return Math.max(0, Math.min(MAX_RAW_RESPONSE_CHARS, Math.floor(value)));
}

function sourceForFailure(
    options: NovelAnalysisWorkflowOptions,
    fileName = '',
): NovelAnalysisSourceOptions {
    const source = options.source ?? {};
    const safeFile = boundedText(source.sourceFileName ?? fileName, 500);
    const safeTitle = boundedText(source.sourceTitle ?? source.title ?? safeFile, 500);
    return {
        ...source,
        title: boundedText(source.title ?? safeTitle, 500),
        sourceKind: boundedText(source.sourceKind ?? 'novel_context', 120),
        sourceTitle: safeTitle,
        sourceFileName: safeFile,
        sourceChapterIds: uniqueStrings(source.sourceChapterIds ?? [], 120),
        sourceChapterTitles: uniqueStrings(source.sourceChapterTitles ?? [], 500),
        sourceExcerpt: boundedText(source.sourceExcerpt, MAX_SOURCE_EXCERPT_CHARS),
        ...(source.createdAt ? { createdAt: boundedText(source.createdAt, 80) } : {}),
    };
}

function stableStageMessage(stage: NovelAnalysisWorkflowErrorStage): string {
    switch (stage) {
        case 'read': return '无法读取小说文件。';
        case 'context': return '无法组装小说分析上下文。';
        case 'request': return '小说分析请求失败。';
        case 'parse': return 'AI 分析响应无法解析，已使用安全 fallback。';
        default: return '小说分析工作流失败。';
    }
}

function redactSensitiveText(message: string): string {
    return message
        .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
        .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}\b/g, '[redacted-key]')
        .replace(/((?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
        .slice(0, MAX_ERROR_MESSAGE_CHARS);
}

function errorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? boundedText(code, 100) || undefined : undefined;
}

function workflowError(
    stage: NovelAnalysisWorkflowErrorStage,
    error: unknown,
    overrideMessage?: string,
): NovelAnalysisWorkflowError {
    const stableMessage = stableStageMessage(stage);
    const rawMessage = error instanceof Error ? error.message : '';
    const message = overrideMessage || (rawMessage ? redactSensitiveText(rawMessage) : stableMessage);
    return {
        stage,
        message: message || stableMessage,
        ...(errorCode(error) ? { code: errorCode(error) } : {}),
    };
}

function fallbackParseResult(
    source: NovelAnalysisSourceOptions,
    warning: string,
): NovelAnalysisParseResult {
    return parseNovelAnalysisResult('', {
        ...source,
        warning,
    });
}

function failureResult(
    document: ParsedNovel | null,
    preparation: NovelAnalysisPreparation | null,
    source: NovelAnalysisSourceOptions,
    stage: NovelAnalysisWorkflowErrorStage,
    cause: unknown,
    warning?: string,
): NovelAnalysisWorkflowResult {
    const error = workflowError(stage, cause, warning);
    const parseResult = fallbackParseResult(source, error.message);
    return {
        document,
        preparation,
        analysis: parseResult.analysis,
        parseResult,
        error,
    };
}

/**
 * Builds bounded context and the analysis prompt. It is pure with respect to
 * the document and performs no network, storage, or API-key access.
 */
export function prepareNovelAnalysis(
    document: ParsedNovel,
    options: NovelAnalysisWorkflowOptions = {},
): NovelAnalysisPreparation {
    const contextOptions = defaultContextOptions(options);
    const context = getNovelContext(document, contextOptions);
    const preliminary: NovelAnalysisPreparation = {
        workflowVersion: ECHOES_NOVEL_WORKFLOW_VERSION,
        prompt: '',
        context,
        contextOptions,
        source: sourceFromDocument(document, {
            ...context,
            text: context.text.slice(0, contextOptions.maxChars),
        }, options),
    };
    const prompt = buildNovelAnalysisPrompt(preliminary.context.text, {
        ...preliminary.source,
        language: options.language,
    });
    return { ...preliminary, prompt };
}

/** Runs preparation, delegates the request, then reuses the analysis parser. */
export async function analyzeNovelDocument(
    document: ParsedNovel,
    requester: NovelAnalysisRequester,
    options: NovelAnalysisWorkflowOptions = {},
): Promise<NovelAnalysisWorkflowResult> {
    let preparation: NovelAnalysisPreparation;
    try {
        preparation = prepareNovelAnalysis(document, options);
    } catch (error) {
        return failureResult(
            document,
            null,
            sourceForFailure(options, document.fileName),
            'context',
            error,
        );
    }

    if (typeof requester !== 'function') {
        return failureResult(
            document,
            preparation,
            preparation.source,
            'request',
            undefined,
            '小说分析请求器不可用。',
        );
    }

    let rawResponse: unknown;
    try {
        rawResponse = await requester(preparation.prompt, options.maxTokens);
    } catch (error) {
        return failureResult(document, preparation, preparation.source, 'request', error);
    }

    let parseResult: NovelAnalysisParseResult;
    try {
        parseResult = parseNovelAnalysisResult(rawResponse, {
            ...preparation.source,
            rawTextMaxChars: boundedRawTextMaxChars(options.rawTextMaxChars),
        });
    } catch (error) {
        return failureResult(
            document,
            preparation,
            preparation.source,
            'parse',
            error,
        );
    }

    if (parseResult.fallback) {
        const error = workflowError('parse', undefined);
        return {
            document,
            preparation,
            analysis: parseResult.analysis,
            parseResult,
            error: {
                ...error,
                code: 'INVALID_AI_RESPONSE',
            },
        };
    }

    return {
        document,
        preparation,
        analysis: parseResult.analysis,
        parseResult,
    };
}

/** Reads a TXT file, then delegates to the same document workflow. */
export async function analyzeNovelFile(
    file: NovelFileLike,
    requester: NovelAnalysisRequester,
    options: NovelAnalysisFileOptions | NovelAnalysisWorkflowOptions = {},
): Promise<NovelAnalysisWorkflowResult> {
    const fileName = safeFileName(file);
    const workflowOptions: NovelAnalysisWorkflowOptions = options;
    let document: ParsedNovel;
    try {
        document = await readNovelFile(file, workflowOptions.read);
    } catch (error) {
        return failureResult(
            null,
            null,
            sourceForFailure(workflowOptions, fileName),
            'read',
            error,
        );
    }
    return analyzeNovelDocument(document, requester, workflowOptions);
}
