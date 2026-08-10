import { describe, expect, it } from 'vitest';
import { applyMechanicPatches, normalizeMechanic } from './echoesMechanics';
import { applyEchoesMechanicAction, normalizeEchoesMechanicActionRequest, prepareEchoesMechanicAction } from './echoesMechanicActions';
import { filterNovelMechanicPatches } from './echoesNovelRuntimeGuards';
import { createEchoesNovelProfile } from './echoesNovelProfile';

const analysis = {
    schemaVersion: 1,
    title: '测试世界', author: '测试作者', sourceKind: 'uploaded', sourceTitle: '测试世界', sourceFileName: 'test.txt',
    sourceChapterIds: ['chapter-1'], sourceChapterTitles: ['第一章'], sourceExcerpt: '片段',
    worldSummary: '测试世界概览', era: '近未来', locations: ['城市'], specificGenres: ['悬疑'], themes: ['调查'],
    tone: '冷峻', writingStyle: '克制', language: 'zh-CN', protagonist: null, mainCharacters: [], worldRules: [],
    gameplaySignals: [], mechanicHints: [], unsupportedMechanics: [], plotPoints: [], recommendedEntryPoints: [],
    contentWarnings: [], missingInformation: [], analysisWarnings: [], createdAt: '2026-08-08T00:00:00.000Z',
};

const profile = createEchoesNovelProfile(analysis, {
    source: { title: '测试世界', kind: 'uploaded', fileName: 'test.txt' },
    enabledMechanicKinds: ['task_panel', 'scenario_picker', 'inventory_grid'],
    now: 100,
}).profile;

const taskMechanic = normalizeMechanic({
    id: 'tasks',
    kind: 'task_panel',
    title: '任务',
    actions: [{ id: 'advance', label: '推进任务', effect: { type: 'task_update', taskId: 'task-1', status: 'active', progress: 0.5 } }],
    data: { tasks: [{ id: 'task-1', title: '调查', description: '调查现场', status: 'available', progress: 0 }] },
}, 1);

const scenarioMechanic = normalizeMechanic({
    id: 'scenarios',
    kind: 'scenario_picker',
    title: '入口',
    actions: [{ id: 'enter', label: '进入旧校舍', effect: { type: 'scenario_select', optionId: 'school' } }],
    data: { options: [{ id: 'school', title: '旧校舍', description: '', status: 'available' }, { id: 'station', title: '车站', description: '', status: 'available' }] },
}, 1);

const inventoryMechanic = normalizeMechanic({
    id: 'inventory',
    kind: 'inventory_grid',
    title: '物品',
    actions: [{ id: 'equip', label: '装备手电', effect: { type: 'inventory_update', itemId: 'flashlight', equipped: true } }],
    data: { items: [{ id: 'flashlight', name: '手电', quantity: 1, equipped: false, tags: [] }] },
}, 1);

describe('Echoes mechanic action backend', () => {
    it('applies a bounded task effect and returns a safe action text', () => {
        const result = applyEchoesMechanicAction([taskMechanic], { mechanicId: 'tasks', actionId: 'advance' }, { profile, now: 20 });
        expect(result.accepted).toBe(true);
        expect(result.changed).toBe(true);
        expect(result.actionText).toContain('推进任务');
        const task = result.mechanics[0].data;
        expect(task.kind).toBe('task_panel');
        if (task.kind === 'task_panel') expect(task.tasks[0]).toMatchObject({ status: 'active', progress: 0.5 });
    });

    it('applies scenario and inventory effects only to their own normalized component', () => {
        const scenario = applyEchoesMechanicAction([scenarioMechanic], { mechanicId: 'scenarios', actionId: 'enter' }, { profile, now: 20 });
        expect(scenario.accepted).toBe(true);
        if (scenario.mechanics[0].data.kind === 'scenario_picker') expect(scenario.mechanics[0].data.options[0].status).toBe('selected');

        const inventory = applyEchoesMechanicAction([inventoryMechanic], { mechanicId: 'inventory', actionId: 'equip' }, { profile, now: 20 });
        expect(inventory.accepted).toBe(true);
        if (inventory.mechanics[0].data.kind === 'inventory_grid') expect(inventory.mechanics[0].data.items[0].equipped).toBe(true);
    });

    it('rejects disabled, non-interactive, missing, and quarantined actions', () => {
        const disabled = normalizeMechanic({ ...taskMechanic, actions: [{ id: 'x', label: '不可用', disabled: true, disabledReason: '条件不足' }] }, 1);
        expect(applyEchoesMechanicAction([disabled], { mechanicId: 'tasks', actionId: 'x' }, { profile }).accepted).toBe(false);

        const nonInteractive = normalizeMechanic({ id: 'rules', kind: 'rules_panel', data: { rules: [] }, actions: [{ id: 'x', label: '查看' }] }, 1);
        expect(applyEchoesMechanicAction([nonInteractive], { mechanicId: 'rules', actionId: 'x' }, { profile }).accepted).toBe(false);
        expect(applyEchoesMechanicAction([taskMechanic], { mechanicId: 'tasks', actionId: 'missing' }, { profile }).accepted).toBe(false);
        expect(applyEchoesMechanicAction([taskMechanic], { mechanicId: 'tasks', actionId: 'advance' }, { profile: { ...profile, trustStatus: 'quarantined' } }).mechanics).toEqual([]);
    });

    it('prepares a deterministic local patch and preserves the no-request path', () => {
        const empty = prepareEchoesMechanicAction([taskMechanic], undefined, { profile, now: 30 });
        expect(empty).toMatchObject({ accepted: true, hadRequest: false, localPatches: [] });
        expect(empty.mechanics).toHaveLength(1);

        const prepared = prepareEchoesMechanicAction([taskMechanic], { mechanicId: 'tasks', actionId: 'advance' }, { profile, now: 30 });
        expect(prepared.accepted).toBe(true);
        expect(prepared.hadRequest).toBe(true);
        expect(prepared.localPatches).toHaveLength(1);
        expect(prepared.actionText).toContain('推进任务');
        expect(prepared.mechanics[0].data.kind).toBe('task_panel');
        if (prepared.mechanics[0].data.kind === 'task_panel') expect(prepared.mechanics[0].data.tasks[0].progress).toBe(0.5);
        expect(applyMechanicPatches(prepared.beforeMechanics, prepared.localPatches, 30)).toEqual(prepared.mechanics);
        expect(prepareEchoesMechanicAction([taskMechanic], { mechanicId: 'tasks' }, { profile }).accepted).toBe(false);
    });

    it('allows an event-card choice to update its own target component only', () => {
        const crossProfile = createEchoesNovelProfile(analysis, {
            source: { title: '测试世界', kind: 'uploaded', fileName: 'test.txt' },
            enabledMechanicKinds: ['event_card', 'task_panel'],
            now: 100,
        }).profile;
        const event = normalizeMechanic({
            id: 'event', kind: 'event_card', title: '临时事件',
            data: {
                title: '临时事件', body: '请回应', severity: 'notice',
                choices: [{ id: 'finish', label: '完成调查', effect: { type: 'task_update', targetMechanicId: 'tasks', taskId: 'task-1', status: 'completed', progress: 1 } }],
            },
        }, 1);
        const result = applyEchoesMechanicAction([event, taskMechanic], { mechanicId: 'event', actionId: 'finish' }, { profile: crossProfile, now: 40 });
        expect(result.accepted).toBe(true);
        expect(result.changed).toBe(true);
        expect(result.patch?.op).toBe('upsert');
        expect(result.patch?.mechanic?.id).toBe('tasks');
        const unchangedEvent = result.mechanics.find(item => item.id === 'event');
        expect(unchangedEvent?.data.kind).toBe('event_card');
        if (unchangedEvent?.data.kind === 'event_card') expect(unchangedEvent.data.data.body).toBe('请回应');
        const updatedTask = result.mechanics.find(item => item.id === 'tasks');
        expect(updatedTask?.data.kind).toBe('task_panel');
        if (updatedTask?.data.kind === 'task_panel') expect(updatedTask.data.tasks[0]).toMatchObject({ status: 'completed', progress: 1 });
    });

    it('keeps valid-profile clear and disabled-ID bypasses rejected', () => {
        const clear = filterNovelMechanicPatches([{ op: 'clear' }], profile, [taskMechanic]);
        expect(clear.patches).toEqual([]);
        expect(clear.rejectedPatches[0]?.reason).toContain('clear');

        const disabled = normalizeMechanic({ ...taskMechanic, id: 'disabled-task', status: 'disabled' }, 1);
        const reuse = filterNovelMechanicPatches([{ op: 'upsert', mechanic: { ...disabled, status: 'active' } }], profile, [disabled]);
        expect(reuse.patches).toEqual([]);
        expect(reuse.rejectedPatches[0]?.reason).toContain('禁用');
    });

    it('normalizes only stable action IDs and rejects malformed requests', () => {
        expect(normalizeEchoesMechanicActionRequest({ mechanicId: ' tasks ', actionId: ' advance ' })).toEqual({ mechanicId: 'tasks', actionId: 'advance' });
        expect(normalizeEchoesMechanicActionRequest({ mechanicId: '', actionId: 'advance' })).toBeUndefined();
        expect(normalizeEchoesMechanicActionRequest(['tasks', 'advance'])).toBeUndefined();
        expect(normalizeEchoesMechanicActionRequest({ mechanicId: 'tasks' })).toBeUndefined();
    });
});
