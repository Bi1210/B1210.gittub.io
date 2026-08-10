import { describe, expect, it } from 'vitest';
import {
    ECHOES_MECHANIC_CATALOG,
    applyMechanicPatches,
    getMechanicCatalogForPrompt,
    getMechanicDefinition,
    isRegisteredMechanicKind,
    normalizeMechanic,
    normalizeMechanics,
    selectMechanicsForTrigger,
} from './echoesMechanics';

describe('Echoes mechanic registry', () => {
    it('exposes concrete components without binding them to a genre', () => {
        expect(ECHOES_MECHANIC_CATALOG.some(item => item.kind === 'danmaku_stream')).toBe(true);
        expect(ECHOES_MECHANIC_CATALOG.some(item => item.kind === 'trending_board')).toBe(true);
        expect(ECHOES_MECHANIC_CATALOG.some(item => item.kind === 'scenario_picker')).toBe(true);
        expect(getMechanicDefinition('scenario_picker')?.interactive).toBe(true);
        expect(getMechanicCatalogForPrompt()).toContain('trending_board');
        expect(isRegisteredMechanicKind('rules_panel')).toBe(true);
        expect(isRegisteredMechanicKind('not_registered')).toBe(false);
    });

    it('normalizes entertainment mechanics into bounded data', () => {
        const mechanic = normalizeMechanic({
            id: 'hot',
            kind: 'trending_board',
            title: '娱乐热搜',
            trigger: 'event',
            data: {
                entries: [
                    { id: 'b', topic: '第二条', rank: 2, rankChange: 1, heat: 120, relatedToPlayer: false },
                    { id: 'a', topic: '第一条', rank: 1, rankChange: 'new', heat: 80, relatedToPlayer: true },
                ],
            },
            actions: [{ id: 'open', label: '查看详情' }],
        });
        expect(mechanic.kind).toBe('trending_board');
        if (mechanic.data.kind === 'trending_board') {
            expect(mechanic.data.entries.map(item => item.id)).toEqual(['a', 'b']);
            expect(mechanic.data.entries[0].heat).toBe(40);
            expect(mechanic.data.entries[1].heat).toBe(100);
        }
        expect(mechanic.actions[0].label).toBe('查看详情');
    });

    it('normalizes infinite-flow mechanics and keeps unknown kinds safe', () => {
        const result = normalizeMechanics([
            { id: 'scenario', kind: 'scenario_picker', data: { options: [{ id: 'one', title: '旧校舍', status: 'available' }] } },
            { id: 'rules', kind: 'rules_panel', data: { rules: [{ id: 'r1', text: '不能回头', category: 'must_not', known: true, severity: 2 }] } },
            { id: 'unknown', kind: 'custom_future_widget', title: '未知组件' },
        ]);
        expect(result.mechanics).toHaveLength(3);
        expect(result.unsupported.map(item => item.id)).toEqual(['unknown']);
        expect(result.mechanics.find(item => item.id === 'unknown')?.kind).toBe('unsupported');
        expect(result.mechanics.find(item => item.id === 'rules')?.data.kind).toBe('rules_panel');
    });

    it('applies upsert, remove and clear patches deterministically', () => {
        const initial = [normalizeMechanic({ id: 'one', kind: 'task_panel', data: { tasks: [] } }, 100)];
        const updated = applyMechanicPatches(initial, [
            { op: 'upsert', mechanic: { id: 'two', kind: 'countdown', data: { label: '剩余时间', current: 10 } } },
            { op: 'remove', id: 'one' },
        ], 200);
        expect(updated.map(item => item.id)).toEqual(['two']);
        const cleared = applyMechanicPatches(updated, [{ op: 'clear' }], 300);
        expect(cleared).toEqual([]);
    });

    it('selects only active mechanics matching a trigger or always', () => {
        const mechanics = [
            normalizeMechanic({ id: 'scene', kind: 'danmaku_stream', trigger: 'scene' }, 1),
            normalizeMechanic({ id: 'always', kind: 'countdown', trigger: 'always' }, 1),
            normalizeMechanic({ id: 'hidden', kind: 'task_panel', trigger: 'scene', status: 'hidden' }, 1),
            normalizeMechanic({ id: 'event', kind: 'event_card', trigger: 'event' }, 1),
        ];
        expect(selectMechanicsForTrigger(mechanics, 'scene').map(item => item.id)).toEqual(['scene', 'always']);
    });
});
