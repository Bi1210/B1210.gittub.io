/**
 * Echoes AI 验证器 — 字数验证、协议检查、自动重试
 * 
 * 核心功能：
 * 1. 字数验证 — 强制 minWords/maxWords 生效
 * 2. 协议检查 — 检测 AI 是否违反写作协议
 * 3. 自动重试 — 不符合要求时自动重试最多 3 次
 * 4. 降级策略 — 重试失败时的容错处理
 */

export interface WordCountRequirement {
    minWords?: number;
    maxWords?: number;
}

export interface ProtocolRequirement {
    playerAgency?: boolean;      // 不替玩家做决定
    sensoryWriting?: boolean;    // 感官写作，避免抽象
    characterAutonomy?: boolean; // 角色自主性
}

export interface ValidationResult {
    valid: boolean;
    content: string;
    warnings: string[];
    wordCount: number;
    violations: string[];
}

export interface RetryStrategy {
    maxRetries: number;
    escalatePrompt: boolean;  // 是否在 prompt 中强调要求
    fallbackToOriginal: boolean; // 重试失败时是否接受原内容
}

const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
    maxRetries: 3,
    escalatePrompt: true,
    fallbackToOriginal: false,
};

/**
 * 统计中文字数（汉字 + 英文单词 + 数字）
 */
function countWords(text: string): number {
    if (!text) return 0;
    
    // 移除代码块、JSON、Markdown 语法等干扰
    let clean = text
        .replace(/```[\s\S]*?```/g, '') // 代码块
        .replace(/`[^`]+`/g, '')        // 行内代码
        .replace(/\{[\s\S]*?\}/g, '')   // JSON
        .replace(/\[.*?\]\(.*?\)/g, '') // Markdown 链接
        .replace(/[#*_~`]/g, '')        // Markdown 标记
        .trim();
    
    // 统计汉字
    const chineseChars = (clean.match(/[\u4e00-\u9fa5]/g) || []).length;
    
    // 统计英文单词和数字
    const westernWords = (clean.match(/[a-zA-Z0-9]+/g) || []).length;
    
    return chineseChars + westernWords;
}

/**
 * 验证字数是否符合要求
 */
export function validateWordCount(
    content: string,
    requirement: WordCountRequirement
): { valid: boolean; wordCount: number; reason?: string } {
    const wordCount = countWords(content);
    const { minWords, maxWords } = requirement;
    
    if (minWords && wordCount < minWords) {
        return {
            valid: false,
            wordCount,
            reason: `字数不足：生成了 ${wordCount} 字，要求至少 ${minWords} 字`
        };
    }
    
    if (maxWords && wordCount > maxWords) {
        return {
            valid: false,
            wordCount,
            reason: `字数超限：生成了 ${wordCount} 字，要求最多 ${maxWords} 字`
        };
    }
    
    return { valid: true, wordCount };
}

/**
 * 检查是否替玩家做决定（违反玩家能动性）
 */
function checkPlayerAgencyViolation(content: string): string[] {
    const violations: string[] = [];
    const lower = content.toLowerCase();
    
    // 检测替玩家决定的常见模式
    const patterns = [
        { regex: /你决定|你选择|你认为|你觉得|你想要/g, desc: '替玩家做内心决定' },
        { regex: /你说[：:][""]|你回答[：:][""]|你开口[：:][""]/, desc: '替玩家说台词' },
        { regex: /你立即|你马上|你迅速|你毫不犹豫/, desc: '替玩家决定行动方式' },
        { regex: /你心想|你暗自|你内心/, desc: '替玩家决定内心活动' },
    ];
    
    for (const { regex, desc } of patterns) {
        const matches = content.match(regex);
        if (matches && matches.length > 0) {
            violations.push(`${desc}（出现 ${matches.length} 次）`);
        }
    }
    
    return violations;
}

/**
 * 检查是否过度使用抽象词汇（违反感官写作）
 */
function checkSensoryWritingViolation(content: string): string[] {
    const violations: string[] = [];
    
    // 检测抽象词汇密度
    const abstractWords = [
        '感觉', '似乎', '好像', '仿佛', '大概', '可能',
        '氛围', '气息', '感受', '印象', '意味',
    ];
    
    let abstractCount = 0;
    for (const word of abstractWords) {
        abstractCount += (content.match(new RegExp(word, 'g')) || []).length;
    }
    
    const wordCount = countWords(content);
    const abstractRatio = abstractCount / Math.max(wordCount, 1);
    
    // 如果抽象词汇超过 8%，视为违反感官写作
    if (abstractRatio > 0.08) {
        violations.push(
            `抽象词汇过多（${abstractCount} 个，占比 ${(abstractRatio * 100).toFixed(1)}%），` +
            `缺少具体的视觉、听觉、触觉描写`
        );
    }
    
    return violations;
}

/**
 * 检查角色是否无动机地配合玩家（违反角色自主性）
 */
function checkCharacterAutonomyViolation(content: string): string[] {
    const violations: string[] = [];
    
    // 检测角色降智配合的常见模式
    const patterns = [
        { regex: /主动告诉你|主动透露|主动说出/, desc: '角色无动机地主动透露信息' },
        { regex: /毫无保留|全盘托出|和盘托出/, desc: '角色毫无保留地配合' },
        { regex: /刚好|恰好|正好.*出现/, desc: '角色恰好出现（过于巧合）' },
    ];
    
    for (const { regex, desc } of patterns) {
        if (regex.test(content)) {
            violations.push(desc);
        }
    }
    
    return violations;
}

/**
 * 验证协议遵守情况
 */
export function validateProtocol(
    content: string,
    requirement: ProtocolRequirement
): { violations: string[] } {
    const violations: string[] = [];
    
    if (requirement.playerAgency) {
        violations.push(...checkPlayerAgencyViolation(content));
    }
    
    if (requirement.sensoryWriting) {
        violations.push(...checkSensoryWritingViolation(content));
    }
    
    if (requirement.characterAutonomy) {
        violations.push(...checkCharacterAutonomyViolation(content));
    }
    
    return { violations };
}

/**
 * 完整验证（字数 + 协议）
 */
export function validateAIOutput(
    content: string,
    wordCountReq: WordCountRequirement,
    protocolReq: ProtocolRequirement
): ValidationResult {
    const wordResult = validateWordCount(content, wordCountReq);
    const protocolResult = validateProtocol(content, protocolReq);
    
    const warnings: string[] = [];
    if (wordResult.reason) {
        warnings.push(wordResult.reason);
    }
    
    const valid = wordResult.valid && protocolResult.violations.length === 0;
    
    return {
        valid,
        content,
        warnings,
        wordCount: wordResult.wordCount,
        violations: protocolResult.violations,
    };
}

/**
 * 构建重试 prompt（强调未满足的要求）
 */
export function buildRetryPrompt(
    originalPrompt: string,
    validationResult: ValidationResult,
    attempt: number
): string {
    const issues: string[] = [];
    
    if (validationResult.warnings.length > 0) {
        issues.push(...validationResult.warnings);
    }
    
    if (validationResult.violations.length > 0) {
        issues.push(...validationResult.violations);
    }
    
    const issueText = issues.join('；');
    
    return `${originalPrompt}\n\n` +
        `【重要】上一次生成存在问题（第 ${attempt} 次尝试）：\n` +
        `${issueText}\n\n` +
        `请重新生成，务必解决上述问题。`;
}

/**
 * 带验证和重试的 AI 调用包装器
 */
export async function requestAIWithValidation<T>(
    requestFn: (prompt: string) => Promise<T>,
    extractContentFn: (response: T) => string,
    prompt: string,
    wordCountReq: WordCountRequirement = {},
    protocolReq: ProtocolRequirement = {},
    strategy: RetryStrategy = DEFAULT_RETRY_STRATEGY
): Promise<{ response: T; validation: ValidationResult }> {
    let lastResponse: T | null = null;
    let lastValidation: ValidationResult | null = null;
    let currentPrompt = prompt;
    
    for (let attempt = 1; attempt <= strategy.maxRetries; attempt++) {
        const response = await requestFn(currentPrompt);
        lastResponse = response;
        
        const content = extractContentFn(response);
        const validation = validateAIOutput(content, wordCountReq, protocolReq);
        lastValidation = validation;
        
        if (validation.valid) {
            return { response, validation };
        }
        
        if (attempt >= strategy.maxRetries) {
            break;
        }
        
        if (strategy.escalatePrompt) {
            currentPrompt = buildRetryPrompt(prompt, validation, attempt);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (!strategy.fallbackToOriginal) {
        throw new Error(
            `AI 输出验证失败（已重试 ${strategy.maxRetries} 次）：\n` +
            (lastValidation?.warnings.join('\n') || '未知错误')
        );
    }
    
    return {
        response: lastResponse!,
        validation: lastValidation!,
    };
}

/**
 * 字数截断（如果超过上限）
 */
export function truncateContent(content: string, maxWords: number): string {
    const wordCount = countWords(content);
    if (wordCount <= maxWords) {
        return content;
    }
    
    const ratio = maxWords / wordCount;
    const targetLength = Math.floor(content.length * ratio);
    const truncated = content.slice(0, targetLength);
    const lastParagraph = truncated.lastIndexOf('\n\n');
    
    if (lastParagraph > targetLength * 0.8) {
        return truncated.slice(0, lastParagraph) + '\n\n[内容已截断]';
    }
    
    return truncated + '\n\n[内容已截断]';
}
