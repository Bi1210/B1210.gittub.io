import { describe, expect, it } from 'vitest';
import { createEchoesNovelProfile } from './echoesNovelProfile';
import { sanitizeEchoesWorldForStorage } from './echoesWorldStorage';

const analysis = {
    schemaVersion: 1,
    title: '测试原著', author: '测试作者', sourceKind: 'uploaded', sourceTitle: '测试原著', sourceFileName: 'test.txt',
    sourceChapterIds: ['chapter-1'], sourceChapterTitles: ['第一章'], sourceExcerpt: '短片段',
    worldSummary: '测试世界', era: '近未来', locations: ['城市'], specificGenres: ['悬疑'], themes: ['调查'],
    tone: '冷峻', writingStyle: '克制', language: 'zh-CN', protagonist: null, mainCharacters: [], worldRules: [],
    gameplaySignals: [], mechanicHints: [], unsupportedMechanics: [], plotPoints: [], recommendedEntryPoints: [],
    contentWarnings: [], missingInformation: [], analysisWarnings: [], createdAt: '2026-08-08T00:00:00.000Z',
};

const profile = createEchoesNovelProfile(analysis, {
    source: { title: '测试原著', kind: 'uploaded', fileName: 'test.txt' },
    enabledMechanicKinds: ['task_panel'], now: 100,
}).profile;

const task = (id: string) => ({ id, kind: 'task_panel', title: id, data: { tasks: [] } });
const event = (id: string) => ({ id, kind: 'event_card', title: id, data: { title: id, description: '' } });

const baseWorld = (extra: Record<string, unknown> = {}) => ({
    id: 'world-1', hardFacts: ['RAW_FACT'], initialHardFacts: ['RAW_INITIAL'], mechanics: [task('task-1'), event('event-1')],
    initialMechanics: [task('task-1'), event('event-1')],
    turns: [{
        id: 'turn-1', beforeHardFacts: ['RAW_BEFORE'], hardFactsToLock: ['RAW_LOCK'], afterHardFacts: ['RAW_AFTER'],
        beforeMechanics: [task('task-1'), event('event-2')], afterMechanics: [task('task-1'), event('event-3')],
        mechanicPatches: [{ op: 'upsert', mechanic: task('task-2') }], createdAt: 1,
    }],
    novelProfile: profile, ...extra,
});

describe('Echoes world storage ledger sanitizer', () => {
    it('gates facts and mechanics before persistence', () => {
        const saved = sanitizeEchoesWorldForStorage(baseWorld()) as any;
        expect(saved.hardFacts).toEqual([]);
        expect(saved.initialHardFacts).toEqual([]);
        expect(saved.mechanics.map((item: any) => item.kind)).toEqual(['task_panel']);
        expect(saved.turns[0].beforeMechanics.map((item: any) => item.kind)).toEqual(['task_panel']);
        expect(saved.turns[0].afterMechanics.map((item: any) => item.kind)).toEqual(['task_panel', 'task_panel']);
        expect(saved.turns[0].hardFactsRecorded).toBe(true);
        expect(JSON.stringify(saved)).not.toContain('RAW_');
    });

    it('keeps an accepted new mechanic through the next remove patch', () => {
        const world = baseWorld({ turns: [
            { id: 'turn-1', mechanicPatches: [{ op: 'upsert', mechanic: task('task-2') }], createdAt: 1 },
            { id: 'turn-2', mechanicPatches: [{ op: 'remove', id: 'task-2' }], createdAt: 2 },
        ] });
        const saved = sanitizeEchoesWorldForStorage(world) as any;
        expect(saved.turns[0].afterMechanics.map((item: any) => item.id)).toContain('task-2');
        expect(saved.turns[1].beforeMechanics.map((item: any) => item.id)).toContain('task-2');
        expect(saved.turns[1].afterMechanics.map((item: any) => item.id)).not.toContain('task-2');
    });

    it('fails closed for quarantined profiles and ledgers', () => {
        const world = baseWorld({ novelProfile: { ...profile, trustStatus: 'quarantined' } });
        const saved = sanitizeEchoesWorldForStorage(world) as any;
        expect(saved.novelProfile.trustStatus).toBe('quarantined');
        expect(saved.hardFacts).toEqual([]);
        expect(saved.mechanics).toEqual([]);
        expect(saved.turns[0].beforeMechanics).toEqual([]);
        expect(saved.turns[0].afterMechanics).toEqual([]);
    });

    it('removes raw novel fields at nested levels', () => {
        const saved = sanitizeEchoesWorldForStorage({ ...baseWorld(), parsedNovel: 'FULL', turns: [{ rawResponse: 'FULL', state: { normalizedText: 'FULL' } }] }) as any;
        const encoded = JSON.stringify(saved);
        expect(encoded).not.toContain('FULL');
        expect(saved).not.toHaveProperty('parsedNovel');
    });

    it('preserves the disabled tombstone during storage replay', () => {
        const active = task('tombstone');
        const saved = sanitizeEchoesWorldForStorage(baseWorld({
            mechanics: [active], initialMechanics: [active],
            turns: [{
                id: 'turn-tombstone',
                mechanicPatches: [
                    { op: 'upsert', mechanic: { ...active, status: 'disabled' } },
                    { op: 'upsert', mechanic: { ...active, status: 'active' } },
                ],
                createdAt: 2,
            }],
        })) as any;
        expect(saved.turns[0].mechanicPatches).toHaveLength(1);
        expect(saved.turns[0].mechanicPatches[0].mechanic.status).toBe('disabled');
        expect(saved.mechanics[0].status).toBe('disabled');
    });
});
