import type { NovelContextQuery, NovelContextResult } from './echoesNovelContextTypes';
import type { ParsedNovel } from './echoesNovelTypes';
import type { EchoesNovelProfile } from './echoesNovelProfileTypes';

export const ECHOES_NOVEL_RUNTIME_VERSION = 'echoes-novel-runtime/1' as const;

export interface EchoesNovelRuntimeContextOptions extends NovelContextQuery {
    /** Hard upper bound for the assembled prompt section. */
    maxPromptChars?: number;
    /** Defaults to true; analysis is concise metadata, not source text. */
    includeAnalysis?: boolean;
    /** Defaults to true when a ParsedNovel is available. */
    includeSource?: boolean;
}

export interface EchoesNovelRuntimeContext {
    runtimeVersion: typeof ECHOES_NOVEL_RUNTIME_VERSION;
    available: boolean;
    text: string;
    context: NovelContextResult | null;
    sourceChapterIds: string[];
    sourceChapterTitles: string[];
    truncated: boolean;
    analysisIncluded: boolean;
    sourceIncluded: boolean;
    warnings: string[];
}

export interface EchoesNovelRuntimeInput {
    profile: EchoesNovelProfile | null | undefined;
    document?: ParsedNovel | null;
    options?: EchoesNovelRuntimeContextOptions;
}
