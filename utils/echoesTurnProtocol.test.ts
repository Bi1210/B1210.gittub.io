import { describe, expect, it } from 'vitest';
import { buildEchoesTurnOutputInstruction, parseEchoesTurnOutput } from './echoesTurnProtocol';

describe('Echoes turn protocol', () => {
    it('parses an OpenAI-compatible response with choices and mechanics', () => {
        const result = parseEchoesTurnOutput({
            choices: [{ message: { content: JSON.stringify({
                chapter: '第一章',
                mood: '紧张',
                blocks: [{ kind: 'narrative', format: 'markdown', content: '门后传来脚步声。' }],
                choices: [{ id: 'open', label: '打开门', preview: '可能暴露位置' }],
                statePatch: { location: '走廊', health: 120 },
                mechanicPatches: [{ op: 'upsert', mechanic: { id: 'rules', kind: 'rules_panel', data: { rules: [{ text: '不要回头' }] } } }],
                newKnownFacts: ['门后有人'],
            }) } }],
        }, { allowedFormats: ['text', 'markdown'] });
        expect(result.validJson).toBe(true);
        expect(result.output.chapter).toBe('第一章');
        expect(result.output.blocks[0].content).toBe('门后传来脚步声。');
        expect(result.output.choices[0].id).toBe('open');
        expect(result.output.statePatch.health).toBe(100);
        expect(result.output.mechanicPatches).toHaveLength(1);
    });

    it('accepts fenced JSON and safely falls back for invalid output', () => {
        const fenced = parseEchoesTurnOutput('```json\n{"blocks":[{"kind":"narrative","content":"继续前进。"}]}\n```', { fallbackText: '备用正文' });
        expect(fenced.validJson).toBe(true);
        expect(fenced.output.blocks[0].content).toBe('继续前进。');

        const invalid = parseEchoesTurnOutput('模型没有遵守格式', { fallbackText: '保留这段正文' });
        expect(invalid.usedFallback).toBe(true);
        expect(invalid.output.blocks[0].content).toBe('模型没有遵守格式');
        expect(invalid.output.choices).toEqual([]);
    });

    it('limits blocks, choices, facts and unsupported formats', () => {
        const result = parseEchoesTurnOutput({
            blocks: Array.from({ length: 10 }, (_, index) => ({ kind: 'narrative', format: 'html', content: `段落${index}` })),
            choices: Array.from({ length: 10 }, (_, index) => ({ label: `选项${index}` })),
            newKnownFacts: Array.from({ length: 10 }, (_, index) => `事实${index}`),
        }, { allowedFormats: ['text', 'markdown'], maxBlocks: 3, maxChoices: 2, maxFacts: 4 });
        expect(result.output.blocks).toHaveLength(3);
        expect(result.output.blocks[0].format).toBe('markdown');
        expect(result.output.choices).toHaveLength(2);
        expect(result.output.newKnownFacts).toHaveLength(4);
    });

    it('contains the registered mechanic protocol instruction', () => {
        const instruction = buildEchoesTurnOutputInstruction();
        expect(instruction).toContain('mechanicPatches');
        expect(instruction).toContain('不要输出未注册组件代码');
    });
});
