import { describe, expect, it } from 'vitest';
import {
    ALWAYS_ENABLED_MECHANIC_KINDS,
    ECHOES_MECHANIC_CATALOG,
    applyMechanicPatches,
    getMechanicCatalogForPrompt,
    getMechanicDefinition,
    isRegisteredMechanicKind,
    normalizeMechanic,
    normalizeMechanics,
    selectMechanicsForTrigger,
} from './echoesMechanics';
import { filterNovelMechanicPatches } from './echoesNovelRuntimeGuards';

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

describe('cast_roster and lore_codex mechanic kinds', () => {
    it('normalizes a cast_roster mechanic with nested character object', () => {
        const m = normalizeMechanic({
            id: 'cast-zhangsan',
            kind: 'cast_roster',
            title: '张三',
            trigger: 'always',
            data: {
                character: {
                    name: '张三',
                    aliasTitle: '铁手',
                    role: '退伍老兵，现任保安',
                    isPlayer: false,
                    fields: [
                        { label: '年龄', value: '45' },
                        { label: '阵营', value: '守序中立' },
                    ],
                    sections: [
                        { heading: '背景', body: '曾在边境服役十年，后因伤退役。' },
                    ],
                    tags: ['老兵', '配角'],
                },
            },
        });
        expect(m.kind).toBe('cast_roster');
        expect(m.id).toBe('cast-zhangsan');
        if (m.data.kind === 'cast_roster') {
            expect(m.data.character.name).toBe('张三');
            expect(m.data.character.aliasTitle).toBe('铁手');
            expect(m.data.character.isPlayer).toBe(false);
            expect(m.data.character.fields).toHaveLength(2);
            expect(m.data.character.fields[0].label).toBe('年龄');
            expect(m.data.character.sections).toHaveLength(1);
            expect(m.data.character.sections[0].heading).toBe('背景');
            expect(m.data.character.tags).toContain('老兵');
        }
    });

    it('normalizes a cast_roster with flat shape (no nested character wrapper)', () => {
        const m = normalizeMechanic({
            id: 'cast-player',
            kind: 'cast_roster',
            title: '主角',
            trigger: 'always',
            data: {
                // AI 也可能直接把字段平铺在 data 里，不套 character 对象
                name: '林默',
                role: '玩家角色',
                isPlayer: true,
                fields: [{ label: '职业', value: '调查员' }],
                sections: [],
                tags: ['玩家'],
            },
        });
        expect(m.kind).toBe('cast_roster');
        if (m.data.kind === 'cast_roster') {
            expect(m.data.character.name).toBe('林默');
            expect(m.data.character.isPlayer).toBe(true);
        }
    });

    it('normalizes a lore_codex entry with correct category passthrough', () => {
        const m = normalizeMechanic({
            id: 'lore-mistyforest',
            kind: 'lore_codex',
            title: '迷雾森林',
            trigger: 'always',
            data: {
                entry: {
                    term: '迷雾森林',
                    category: 'place',
                    summary: '城市东侧的禁区，常年弥漫不散的青灰色薄雾。',
                    details: '据说是旧战场遗留的某种能量干扰区域，指南针在其中会失灵。',
                    tags: ['危险地带', '禁区'],
                },
            },
        });
        expect(m.kind).toBe('lore_codex');
        expect(m.id).toBe('lore-mistyforest');
        if (m.data.kind === 'lore_codex') {
            expect(m.data.entry.term).toBe('迷雾森林');
            expect(m.data.entry.category).toBe('place');
            expect(m.data.entry.summary).toContain('禁区');
            expect(m.data.entry.details).toContain('指南针');
            expect(m.data.entry.tags).toContain('危险地带');
        }
    });

    it('falls back lore_codex category to "other" for unknown values', () => {
        const m = normalizeMechanic({
            id: 'lore-misc',
            kind: 'lore_codex',
            title: '某条目',
            trigger: 'always',
            data: { entry: { term: '奇怪东西', category: 'magic_system', summary: '未知分类的条目' } },
        });
        if (m.data.kind === 'lore_codex') {
            expect(m.data.entry.category).toBe('other');
        }
    });

    it('allows cast_roster and lore_codex through filterNovelMechanicPatches even without profile', () => {
        // No profile (state='none') — all registered kinds are allowed, including the new ones.
        const patches = [
            { op: 'upsert', mechanic: { id: 'cast-liming', kind: 'cast_roster', trigger: 'always', data: { character: { name: '黎明', isPlayer: false, fields: [], sections: [], tags: [] } } } },
            { op: 'upsert', mechanic: { id: 'lore-tower', kind: 'lore_codex', trigger: 'always', data: { entry: { term: '暗塔', category: 'place', summary: '北方地标', tags: [] } } } },
        ];
        const result = filterNovelMechanicPatches(patches, undefined, []);
        expect(result.patches).toHaveLength(2);
        expect(result.rejectedPatches).toHaveLength(0);
    });

    it('ALWAYS_ENABLED_MECHANIC_KINDS includes cast_roster and lore_codex', () => {
        expect(ALWAYS_ENABLED_MECHANIC_KINDS.has('cast_roster')).toBe(true);
        expect(ALWAYS_ENABLED_MECHANIC_KINDS.has('lore_codex')).toBe(true);
    });
});
