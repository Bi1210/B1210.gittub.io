/**
 * Echoes 穿书事件追踪器
 * 
 * 核心功能：
 * 1. 每回合结束后，检查当前章节位置
 * 2. 自动标记已到达的事件为 'reached'
 * 3. 根据偏离度标记为 'altered' 或 'skipped'
 * 4. 提供事件进度摘要
 */

import { updateCanonEvent, getUpcomingCanonEvents } from './echoesCrossover';
import type {
    EchoesCanonEvent,
    EchoesCanonEventStatus,
    EchoesCrossoverTimelineState,
} from './echoesCrossoverTypes';

export interface EventTrackerContext {
    currentChapterIndex: number;
    currentTurnContent: string;
    recentActions: string[];
}

export interface EventProgressSummary {
    total: number;
    upcoming: number;
    reached: number;
    altered: number;
    skipped: number;
    nextEvent: EchoesCanonEvent | null;
}

/**
 * 自动更新事件状态
 */
export function updateEventStatuses(
    timeline: EchoesCrossoverTimelineState,
    context: EventTrackerContext
): EchoesCrossoverTimelineState {
    const { currentChapterIndex, currentTurnContent } = context;
    
    let events = [...timeline.events];
    
    // 标记已到达的事件
    for (const event of events) {
        if (event.status === 'upcoming') {
            // 条件1：章节位置已到达
            const chapterReached = event.chapterIndex !== undefined && currentChapterIndex >= event.chapterIndex;
            
            // 条件2：事件内容在当前回合中出现
            const eventKeywords = event.title.split(/[\s，、]/);
            const contentMatches = eventKeywords.filter(kw =>
                kw.length > 1 && currentTurnContent.toLowerCase().includes(kw.toLowerCase())
            ).length;
            const contentReached = contentMatches >= 2;
            
            if (chapterReached || contentReached) {
                events = updateCanonEvent(events, {
                    eventId: event.id,
                    status: 'reached',
                });
            }
        }
    }
    
    return {
        ...timeline,
        events,
        reachedChapterIndex: Math.max(timeline.reachedChapterIndex, currentChapterIndex),
    };
}

/**
 * 根据偏离度标记事件为 altered
 */
export function markAlteredEvents(
    timeline: EchoesCrossoverTimelineState,
    alteredEventIds: string[]
): EchoesCrossoverTimelineState {
    let events = [...timeline.events];
    
    for (const eventId of alteredEventIds) {
        const event = events.find(e => e.id === eventId);
        if (event && event.status === 'reached') {
            events = updateCanonEvent(events, {
                eventId,
                status: 'altered',
            });
        }
    }
    
    return {
        ...timeline,
        events,
    };
}

/**
 * 标记跳过的事件
 */
export function markSkippedEvents(
    timeline: EchoesCrossoverTimelineState,
    context: EventTrackerContext
): EchoesCrossoverTimelineState {
    const { currentChapterIndex } = context;
    let events = [...timeline.events];
    
    // 如果当前章节已经超前，之前未到达的事件标记为 skipped
    for (const event of events) {
        if (event.status === 'upcoming' && event.chapterIndex !== undefined) {
            const chapterGap = currentChapterIndex - event.chapterIndex;
            
            // 超过 3 章仍未触发，标记为跳过
            if (chapterGap >= 3) {
                events = updateCanonEvent(events, {
                    eventId: event.id,
                    status: 'skipped',
                });
            }
        }
    }
    
    return {
        ...timeline,
        events,
    };
}

/**
 * 完整的事件追踪更新流程
 */
export function trackEvents(
    timeline: EchoesCrossoverTimelineState,
    context: EventTrackerContext
): EchoesCrossoverTimelineState {
    // 1. 更新已到达的事件
    let updated = updateEventStatuses(timeline, context);
    
    // 2. 标记跳过的事件
    updated = markSkippedEvents(updated, context);
    
    // 3. 应用偏离度标记
    if (timeline.deviation.alteredEventIds.length > 0) {
        updated = markAlteredEvents(updated, timeline.deviation.alteredEventIds);
    }
    
    return updated;
}

/**
 * 获取事件进度摘要
 */
export function getEventProgressSummary(timeline: EchoesCrossoverTimelineState): EventProgressSummary {
    const { events } = timeline;
    
    const statusCounts = events.reduce(
        (acc, event) => {
            acc[event.status] = (acc[event.status] || 0) + 1;
            return acc;
        },
        {} as Record<EchoesCanonEventStatus, number>
    );
    
    const nextEvent = getUpcomingCanonEvents(events, 1)[0] || null;
    
    return {
        total: events.length,
        upcoming: statusCounts.upcoming || 0,
        reached: statusCounts.reached || 0,
        altered: statusCounts.altered || 0,
        skipped: statusCounts.skipped || 0,
        nextEvent,
    };
}

/**
 * 生成事件进度文本摘要
 */
export function formatEventProgress(summary: EventProgressSummary): string {
    const { total, upcoming, reached, altered, skipped, nextEvent } = summary;
    
    const parts: string[] = [
        `原著事件总数：${total}`,
        `已到达：${reached}`,
    ];
    
    if (altered > 0) {
        parts.push(`已改变：${altered}`);
    }
    
    if (skipped > 0) {
        parts.push(`已跳过：${skipped}`);
    }
    
    parts.push(`待触发：${upcoming}`);
    
    let text = parts.join(' | ');
    
    if (nextEvent) {
        text += `\n\n下一个原著事件：${nextEvent.title}`;
        if (nextEvent.chapterIndex !== undefined) {
            text += ` (第 ${nextEvent.chapterIndex + 1} 章)`;
        }
    }
    
    return text;
}

/**
 * 获取最近到达的事件（用于显示）
 */
export function getRecentReachedEvents(
    timeline: EchoesCrossoverTimelineState,
    limit = 5
): EchoesCanonEvent[] {
    return timeline.events
        .filter(e => e.status === 'reached' || e.status === 'altered')
        .slice(-limit)
        .reverse();
}

/**
 * 检查是否有核心事件被跳过（警告）
 */
export function checkCriticalEventsSkipped(timeline: EchoesCrossoverTimelineState): {
    hasCritical: boolean;
    skippedCriticalEvents: EchoesCanonEvent[];
} {
    const skippedCritical = timeline.events.filter(
        e => e.status === 'skipped' && e.confidence >= 0.9
    );
    
    return {
        hasCritical: skippedCritical.length > 0,
        skippedCriticalEvents: skippedCritical,
    };
}

/**
 * 生成给 AI 的事件提示
 */
export function buildEventHintForAI(
    timeline: EchoesCrossoverTimelineState,
    includeUpcoming = 3
): string {
    const upcoming = getUpcomingCanonEvents(timeline.events, includeUpcoming);
    const recent = getRecentReachedEvents(timeline, 3);
    
    let hint = '';
    
    if (recent.length > 0) {
        hint += '## 最近到达的原著事件\n\n';
        recent.forEach((event, i) => {
            const status = event.status === 'altered' ? '（已改变）' : '';
            hint += `${i + 1}. ${event.title} ${status}\n`;
            hint += `   ${event.summary}\n\n`;
        });
    }
    
    if (upcoming.length > 0) {
        hint += '## 即将到来的原著事件\n\n';
        upcoming.forEach((event, i) => {
            hint += `${i + 1}. ${event.title}`;
            if (event.chapterIndex !== undefined) {
                hint += ` (第 ${event.chapterIndex + 1} 章)`;
            }
            hint += `\n   ${event.summary}\n\n`;
        });
    }
    
    return hint;
}

/**
 * 判断当前是否处于关键节点
 */
export function isAtCriticalEvent(
    timeline: EchoesCrossoverTimelineState,
    context: EventTrackerContext
): {
    isCritical: boolean;
    event: EchoesCanonEvent | null;
} {
    const { currentChapterIndex, currentTurnContent } = context;
    
    const upcoming = getUpcomingCanonEvents(timeline.events, 3);
    
    for (const event of upcoming) {
        // 高置信度事件
        if (event.confidence >= 0.9) {
            // 章节位置接近
            const chapterClose = event.chapterIndex !== undefined && Math.abs(currentChapterIndex - event.chapterIndex) <= 1;
            
            // 内容相关
            const eventKeywords = event.title.split(/[\s，、]/);
            const contentMatches = eventKeywords.filter(kw =>
                kw.length > 1 && currentTurnContent.toLowerCase().includes(kw.toLowerCase())
            ).length;
            
            if (chapterClose || contentMatches >= 2) {
                return {
                    isCritical: true,
                    event,
                };
            }
        }
    }
    
    return {
        isCritical: false,
        event: null,
    };
}
