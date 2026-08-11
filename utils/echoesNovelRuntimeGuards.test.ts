import { describe, expect, it } from 'vitest';
import { normalizeMechanic } from './echoesMechanics';
import { createEchoesNovelProfile } from './echoesNovelProfile';
import {
    filterNovelHardFactsToLock,
    filterNovelMechanicPatches,
} from './echoesNovelRuntimeGuards';

const analysis = {
    schemaVersion: 1,
    title: '雾中城',
    author: '作者',
    sourceKind: 'uploaded',
    sourceTitle: '雾中城',
    sourceFileName: 'mist.txt',
    sourceChapterIds: ['chapter-1'],
    sourceChapterTitles: ['第一章'],
    sourceExcerpt: '短片段',
    worldSummary: '城市被规则笼罩。',
    era: '近未来',
    locations: ['雾城'],
    specificGenres: ['无限流'],
    themes: ['生存'],
    tone: '冷峻',
    writingStyle: '克制',
    language: 'zh-CN',
    protagonist: null,
    mainCharacters: [],
    worldRules: [{
        id: 'rule-1',
        text: '进入雾城后不能回头。',
        category: 'must_not',
        evidence: [{ quote: '不能回头', chapterId: 'chapter-1', basis: 'source' }],
        confidence: 0.9,
    }],
    gameplaySignals: [],
    mechanicHints: [],
    unsupportedMechanics: [],
    plotPoints: [],
    recommendedEntryPoints: [],
    contentWarnings: [],
    missingInformation: [],
    analysisWarnings: [],
    createdAt: '2026-08-08T00:00:00.000Z',
};

const makeProfile = (acceptedFactIds: string[] = [], enabledMechanicKinds: string[] = []) =>
    createEchoesNovelProfile(analysis, {
        source: { title: '雾中城', kind: 'uploaded', fileName: 'mist.txt' },
        acceptedFactIds,
        enabledMechanicKinds,
        now: 100,
    }).profile;

describe('Echoes novel runtime hard-fact gate', () => {
    it('keeps bounded legacy behavior without a profile', () => {
        const result = filterNovelHardFactsToLock(['普通剧情事实'], undefined);
        expect(result.facts).toEqual(['普通剧情事实']);
        expect(result.restrictedFacts).toEqual([]);
    });

    it('blocks an analyzed rule until its fact ID is accepted', () => {
        const profile = makeProfile();
        const result = filterNovelHardFactsToLock(['进入雾城后不能回头。'], profile);
        expect(result.facts).toEqual([]);
        expect(result.restrictedFacts[0]?.ruleId).toBe('rule-1');
        expect(result.restrictedFacts[0]?.reason).toContain('acceptedFactIds');
    });

    it('accepts either the rule ID or world-rule prefixed ID', () => {
        const byRuleId = filterNovelHardFactsToLock(['进入雾城后不能回头。'], makeProfile(['rule-1']));
        const byDraftId = filterNovelHardFactsToLock(['进入雾城后不能回头。'], makeProfile(['world-rule-rule-1']));
        expect(byRuleId.facts).toEqual(['进入雾城后不能回头。']);
        expect(byDraftId.facts).toEqual(['进入雾城后不能回头。']);
    });

    it('retains current-scene facts but reports they are not analyzed canon rules', () => {
        const result = filterNovelHardFactsToLock(['本轮刚刚发生的动作'], makeProfile());
        expect(result.facts).toEqual(['本轮刚刚发生的动作']);
        expect(result.warnings.join(' ')).toContain('未匹配已分析原著规则');
    });

    it('rejects forbidden full-text fields and bounds malicious input', () => {
        const result = filterNovelHardFactsToLock([
            { text: '安全事实' },
            { text: '整本正文', normalizedText: 'FULL NOVEL' },
            { text: 'x'.repeat(2_000) },
        ], makeProfile(), { maxFacts: 2, maxFactChars: 100 });
        expect(result.facts).toEqual(['安全事实']);
        expect(JSON.stringify(result)).not.toContain('FULL NOVEL');
        expect(result.truncated).toBe(true);
    });
});

describe('Echoes novel runtime mechanic gate', () => {
    const current = [normalizeMechanic({
        id: 'task-1', kind: 'task_panel', title: '当前任务', data: { tasks: [] },
    }, 1)];

    it('keeps legacy patch normalization without a profile', () => {
        const result = filterNovelMechanicPatches([
            { op: 'clear' },
        ], undefined, current);
        expect(result.patches).toEqual([{ op: 'clear' }]);
        expect(result.rejectedPatches).toEqual([]);
    });

    it('allows only explicitly enabled registered upserts', () => {
        const profile = makeProfile([], ['task_panel']);
        const result = filterNovelMechanicPatches([
            { op: 'upsert', mechanic: { id: 'task-2', kind: 'task_panel', title: '新任务', data: { tasks: [] } } },
            { op: 'upsert', mechanic: { id: 'event-1', kind: 'event_card', title: '未启用', data: { title: 'x' } } },
            { op: 'upsert', mechanic: { id: 'bad-1', kind: 'custom_future_widget', title: '未注册' } },
        ], profile, current);
        expect(result.patches).toHaveLength(1);
        expect(result.patches[0]).toMatchObject({ op: 'upsert', mechanic: { id: 'task-2', kind: 'task_panel' } });
        expect(result.rejectedPatches).toHaveLength(2);
    });

    it('rejects clear and only removes an existing enabled mechanic', () => {
        const profile = makeProfile([], ['task_panel']);
        const result = filterNovelMechanicPatches([
            { op: 'clear' },
            { op: 'remove', id: 'unknown' },
            { op: 'remove', id: 'task-1' },
        ], profile, current);
        expect(result.patches).toEqual([{ op: 'remove', id: 'task-1' }]);
        expect(result.rejectedPatches).toHaveLength(2);
        // The specific 'clear' rejection reason lives on the per-patch
        // rejectedPatches entry, not the aggregated warnings summary.
        expect(result.rejectedPatches.some((patch) => patch.operation === 'clear' && patch.reason.includes('clear'))).toBe(true);
    });

    it('accepts JSON-string input deterministically and strips forbidden fields', () => {
        const profile = makeProfile([], ['task_panel']);
        const raw = JSON.stringify([{ op: 'upsert', mechanic: {
            id: 'task-2', kind: 'task_panel', title: '任务', normalizedText: 'FULL NOVEL', data: { tasks: [] },
        } }]);
        const first = filterNovelMechanicPatches(raw, profile, []);
        const second = filterNovelMechanicPatches(raw, profile, []);
        expect(first).toEqual(second);
        expect(first.patches).toEqual([]);
        expect(JSON.stringify(first)).not.toContain('FULL NOVEL');
    });

    it('keeps a disabled ID tombstoned within the same patch batch', () => {
        const profile = makeProfile([], ['task_panel']);
        const active = normalizeMechanic({ id: 'task-tombstone', kind: 'task_panel', title: '任务', status: 'active', data: { tasks: [] } }, 1);
        const result = filterNovelMechanicPatches([
            { op: 'upsert', mechanic: { ...active, status: 'disabled' } },
            { op: 'upsert', mechanic: { ...active, status: 'active' } },
        ], profile, [active]);
        expect(result.patches).toHaveLength(1);
        expect(result.patches[0]?.mechanic).toMatchObject({ id: 'task-tombstone', status: 'disabled' });
        expect(result.rejectedPatches).toHaveLength(1);
        expect(result.rejectedPatches[0]?.reason).toContain('禁用');
    });

    it('keeps a newly disabled ID tombstoned even when absent initially', () => {
        const profile = makeProfile([], ['task_panel']);
        const rawMechanic = { id: 'new-tombstone', kind: 'task_panel', title: '新任务', data: { tasks: [] } };
        const result = filterNovelMechanicPatches([
            { op: 'upsert', mechanic: { ...rawMechanic, status: 'disabled' } },
            { op: 'upsert', mechanic: { ...rawMechanic, status: 'active' } },
        ], profile, []);
        expect(result.patches).toHaveLength(1);
        expect(result.patches[0]?.mechanic).toMatchObject({ id: 'new-tombstone', status: 'disabled' });
        expect(result.rejectedPatches).toHaveLength(1);
    });
});
