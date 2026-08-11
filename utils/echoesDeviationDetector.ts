/**
 * Echoes 偏离度检测引擎
 * 
 * 核心功能：
 * 1. 对比玩家行动 vs 原著事件
 * 2. 计算偏离程度（minor/moderate/major/critical）
 * 3. 自动调用 applyDeviationChange
 * 4. 生成偏离摘要
 */

import { applyDeviationChange } from './echoesCrossover';
import type {
    EchoesCanonEvent,
    EchoesPlotDeviationState,
    EchoesDeviationChange,
    EchoesDeviationImpact,
} from './echoesCrossoverTypes';

export interface DeviationDetectionContext {
    playerAction: string;
    aiResponse: string;
    reachedEvents: EchoesCanonEvent[];
    upcomingEvents: EchoesCanonEvent[];
    currentChapterIndex: number;
}

export interface DeviationAnalysis {
    detected: boolean;
    impact: EchoesDeviationImpact;
    summary: string;
    affectedEventId?: string;
    reason: string;
}

/**
 * 检测关键词是否出现在文本中
 */
function containsKeywords(text: string, keywords: string[]): boolean {
    const normalized = text.toLowerCase();
    return keywords.some(kw => normalized.includes(kw.toLowerCase()));
}

/**
 * 分析玩家行动的偏离程度
 */
export function analyzeDeviation(context: DeviationDetectionContext): DeviationAnalysis | null {
    const { playerAction, aiResponse, reachedEvents, upcomingEvents } = context;
    
    const combined = `${playerAction}\n${aiResponse}`.toLowerCase();
    
    // Critical 级别：主角死亡、核心矛盾消失
    if (containsKeywords(combined, ['主角死', '我死了', '主角身亡', '死亡', '殒命'])) {
        return {
            detected: true,
            impact: 'critical',
            summary: '主角死亡，剧情完全偏离原著',
            reason: '主角存活是原著前提',
        };
    }
    
    // Critical 级别：核心反派被提前击败
    const defeatKeywords = ['击败', '打败', '杀死', '消灭', '铲除'];
    const villainKeywords = ['反派', 'boss', '大魔王', '敌人', '幕后黑手'];
    if (
        containsKeywords(combined, defeatKeywords) &&
        containsKeywords(combined, villainKeywords) &&
        upcomingEvents.some(e => e.title.includes('最终对决') || e.title.includes('决战'))
    ) {
        return {
            detected: true,
            impact: 'critical',
            summary: '核心反派提前落败，主线矛盾消失',
            reason: '原著依赖核心冲突推进',
        };
    }
    
    // Major 级别：改变主线事件走向
    for (const event of reachedEvents.slice(-3)) {
        const eventKeywords = event.title.split(/[\s，、]/);
        const matchCount = eventKeywords.filter(kw => combined.includes(kw.toLowerCase())).length;
        
        if (matchCount >= 2) {
            // 检查是否有反转关键词
            const reverseKeywords = ['拒绝', '阻止', '破坏', '改变', '说服', '救下', '避免'];
            if (containsKeywords(playerAction, reverseKeywords)) {
                return {
                    detected: true,
                    impact: 'major',
                    summary: `改变了原著事件"${event.title}"的走向`,
                    affectedEventId: event.id,
                    reason: '玩家行动直接干预了主线事件',
                };
            }
        }
    }
    
    // Major 级别：主要角色命运改变
    const fateChangeKeywords = ['救活', '阻止死亡', '改变命运', '挽救'];
    if (containsKeywords(combined, fateChangeKeywords)) {
        return {
            detected: true,
            impact: 'major',
            summary: '改变了主要角色的命运',
            reason: '角色命运变化会影响后续剧情',
        };
    }
    
    // Moderate 级别：改变次要角色命运
    const minorCharacterKeywords = ['配角', '路人', '龙套', 'NPC', '次要'];
    if (
        containsKeywords(combined, fateChangeKeywords) &&
        containsKeywords(combined, minorCharacterKeywords)
    ) {
        return {
            detected: true,
            impact: 'moderate',
            summary: '改变了次要角色的命运',
            reason: '次要角色变化可能产生蝴蝶效应',
        };
    }
    
    // Moderate 级别：提前获取关键信息或物品
    const earlyGainKeywords = ['提前', '获得', '得到', '拿到', '获取'];
    const keyItemKeywords = ['神器', '秘籍', '宝物', '关键', '核心'];
    if (
        containsKeywords(combined, earlyGainKeywords) &&
        containsKeywords(combined, keyItemKeywords)
    ) {
        return {
            detected: true,
            impact: 'moderate',
            summary: '提前获取关键物品或信息',
            reason: '时间线被打乱',
        };
    }
    
    // Minor 级别：对话选择不同，但不改变结果
    const dialogueKeywords = ['说', '回答', '选择', '对话'];
    if (containsKeywords(playerAction, dialogueKeywords)) {
        // 检查 AI 响应是否表明结果相同
        const sameOutcomeKeywords = ['不过', '但是', '最终', '依然', '仍然'];
        if (containsKeywords(aiResponse, sameOutcomeKeywords)) {
            return {
                detected: true,
                impact: 'minor',
                summary: '对话选择不同，但事件结果未改变',
                reason: '微小差异不影响主线',
            };
        }
    }
    
    // 没有检测到偏离
    return null;
}

/**
 * 应用偏离并更新状态
 */
export function applyDetectedDeviation(
    deviationState: EchoesPlotDeviationState,
    analysis: DeviationAnalysis
): EchoesPlotDeviationState {
    const change: EchoesDeviationChange = {
        impact: analysis.impact,
        summary: analysis.summary,
        eventId: analysis.affectedEventId,
    };
    
    return applyDeviationChange(deviationState, change);
}

/**
 * 完整的偏离检测流程
 */
export function detectAndApplyDeviation(
    context: DeviationDetectionContext,
    currentDeviationState: EchoesPlotDeviationState
): {
    updated: EchoesPlotDeviationState;
    analysis: DeviationAnalysis | null;
} {
    const analysis = analyzeDeviation(context);
    
    if (!analysis || !analysis.detected) {
        return {
            updated: currentDeviationState,
            analysis: null,
        };
    }
    
    const updated = applyDetectedDeviation(currentDeviationState, analysis);
    
    return {
        updated,
        analysis,
    };
}

/**
 * 生成偏离度提示文本（给 AI 用）
 */
export function buildDeviationPromptHint(
    deviationState: EchoesPlotDeviationState,
    canonPolicy: 'free' | 'guided' | 'fixed'
): string {
    const { level, majorChanges, canReturnToCanon } = deviationState;
    
    if (level === 0) {
        return '当前剧情完全符合原著，未发生偏离。';
    }
    
    let hint = `当前剧情偏离度：${level}%\n`;
    
    if (majorChanges.length > 0) {
        hint += `\n重大变化：\n${majorChanges.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n`;
    }
    
    if (canonPolicy === 'fixed') {
        hint += '\n⚠️ 原著主线策略：固定主线。核心事件必须发生，但允许过程不同。';
    } else if (canonPolicy === 'guided') {
        hint += '\n💡 原著主线策略：引导还原。剧情会尝试回归原著，除非玩家持续干预。';
        if (!canReturnToCanon) {
            hint += '\n⚠️ 偏离度过高（≥70%），已无法回归原著主线。';
        }
    } else {
        hint += '\n✨ 原著主线策略：自由创作。允许完全偏离原著，创造新的故事线。';
    }
    
    return hint;
}

/**
 * 根据偏离度调整 AI 行为
 */
export function adjustAIBehavior(
    deviationState: EchoesPlotDeviationState,
    canonPolicy: 'free' | 'guided' | 'fixed',
    upcomingEvents: EchoesCanonEvent[]
): {
    shouldGuideBack: boolean;
    targetEvent: EchoesCanonEvent | null;
    guidance: string;
} {
    const { level, canReturnToCanon } = deviationState;
    
    // free 模式：不引导回归
    if (canonPolicy === 'free') {
        return {
            shouldGuideBack: false,
            targetEvent: null,
            guidance: '',
        };
    }
    
    // fixed 模式：必须经历核心事件
    if (canonPolicy === 'fixed') {
        const nextCoreEvent = upcomingEvents.find(e => e.confidence >= 0.9);
        if (nextCoreEvent) {
            return {
                shouldGuideBack: true,
                targetEvent: nextCoreEvent,
                guidance: `核心事件"${nextCoreEvent.title}"即将到来。无论偏离度如何，这个事件必须发生（但过程可以不同）。`,
            };
        }
    }
    
    // guided 模式：尝试引导回归
    if (canonPolicy === 'guided' && canReturnToCanon && level >= 30) {
        const nextEvent = upcomingEvents[0];
        if (nextEvent) {
            return {
                shouldGuideBack: true,
                targetEvent: nextEvent,
                guidance: `偏离度较高（${level}%），剧情会尝试引导玩家回到原著轨道。下一个原著事件："${nextEvent.title}"。`,
            };
        }
    }
    
    return {
        shouldGuideBack: false,
        targetEvent: null,
        guidance: '',
    };
}

/**
 * 生成完整的偏离度系统 Prompt 片段
 */
export function buildDeviationSystemPrompt(
    deviationState: EchoesPlotDeviationState,
    canonPolicy: 'free' | 'guided' | 'fixed',
    upcomingEvents: EchoesCanonEvent[]
): string {
    const hint = buildDeviationPromptHint(deviationState, canonPolicy);
    const behavior = adjustAIBehavior(deviationState, canonPolicy, upcomingEvents);
    
    let prompt = `## 剧情偏离状态\n\n${hint}\n`;
    
    if (behavior.shouldGuideBack && behavior.targetEvent) {
        prompt += `\n## AI 行为指引\n\n${behavior.guidance}\n`;
    }
    
    return prompt;
}
