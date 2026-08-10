import { describe, expect, it } from 'vitest';
import {
    applyDeviationChange,
    createCrossoverConfigDraft,
    createCrossoverTimelineState,
    createPlotDeviationState,
    getUpcomingCanonEvents,
    setCrossoverConfigConfirmed,
    updateCanonEvent,
    validateCrossoverConfig,
} from './echoesCrossover';
import type { EchoesCanonEvent } from './echoesCrossoverTypes';

const events: EchoesCanonEvent[] = [
    { id: 'e2', title: '第二个事件', summary: '后发生', chapterIndex: 10, status: 'upcoming', source: 'novel', confidence: 1 },
    { id: 'e1', title: '第一个事件', summary: '先发生', chapterIndex: 2, status: 'upcoming', source: 'novel', confidence: 1 },
    { id: 'e3', title: '已到达事件', summary: '已发生', chapterIndex: 20, status: 'reached', source: 'novel', confidence: 1 },
];

describe('Echoes crossover config', () => {
    it('creates a conservative draft and requires replacement target', () => {
        const draft = createCrossoverConfigDraft({
            source: { id: 'novel-1', title: '测试原著', kind: 'uploaded', chapterCount: 20 },
            role: 'replace_character',
            playerIdentity: '新角色',
        });
        expect(draft.status).toBe('draft');
        expect(draft.source.title).toBe('测试原著');
        expect(validateCrossoverConfig(draft).valid).toBe(false);
        expect(validateCrossoverConfig(draft).errors).toContain('替换角色模式必须指定被替换角色');
    });

    it('validates a complete crossover config and confirms it without mutating source', () => {
        const draft = createCrossoverConfigDraft({
            source: { id: 'novel-1', title: '测试原著', kind: 'uploaded' },
            role: 'original_character',
            entryPoint: { label: '第三章', chapterIndex: 2, source: 'user' },
            playerIdentity: '原创角色',
            playerGoal: '改变命运',
        });
        const result = validateCrossoverConfig(draft);
        expect(result.valid).toBe(true);
        const confirmed = setCrossoverConfigConfirmed(draft);
        expect(confirmed.status).toBe('confirmed');
        expect(draft.status).toBe('draft');
    });

    it('supports inspired mode as a distinct configuration', () => {
        const draft = createCrossoverConfigDraft({
            kind: 'inspired',
            source: { title: '参考作品', kind: 'described' },
        });
        const result = validateCrossoverConfig(draft);
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('这是参考原著创作模式，不会默认使用原著角色和原著事件');
    });
});

describe('Echoes crossover timeline and deviation', () => {
    it('sorts canon events deterministically and returns upcoming events', () => {
        const timeline = createCrossoverTimelineState(events, { reachedChapterIndex: 2 });
        expect(timeline.events.map(event => event.id)).toEqual(['e1', 'e2', 'e3']);
        expect(getUpcomingCanonEvents(timeline.events, 2).map(event => event.id)).toEqual(['e1', 'e2']);
    });

    it('updates only the requested canon event', () => {
        const updated = updateCanonEvent(events, { eventId: 'e2', status: 'altered' });
        expect(updated.find(event => event.id === 'e2')?.status).toBe('altered');
        expect(updated.find(event => event.id === 'e1')?.status).toBe('upcoming');
    });

    it('tracks deviation, major changes and return-to-canon boundary', () => {
        let state = createPlotDeviationState(events);
        state = applyDeviationChange(state, { eventId: 'e2', summary: '玩家提前改变了事件结果', impact: 'major' });
        expect(state.level).toBe(30);
        expect(state.alteredEventIds).toEqual(['e2']);
        expect(state.majorChanges).toContain('玩家提前改变了事件结果');
        state = applyDeviationChange(state, { eventId: 'e3', summary: '关键节点被彻底改写', impact: 'critical' });
        expect(state.level).toBe(80);
        expect(state.canReturnToCanon).toBe(false);
        expect(state.records).toHaveLength(2);
    });
});
