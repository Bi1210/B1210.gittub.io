/**
 * Echoes 穿书向导完整流程
 * 
 * 核心功能：
 * 1. 用户填写穿书配置 → draft
 * 2. 调用 AI 生成原著事件列表
 * 3. 创建时间线状态
 * 4. 确认并保存到 EchoesWorld
 */

import {
    createCrossoverConfigDraft,
    setCrossoverConfigConfirmed,
    createCrossoverTimelineState,
    normalizeCanonEvent,
} from './echoesCrossover';
import type {
    EchoesCrossoverConfig,
    EchoesCanonEvent,
    EchoesCrossoverTimelineState,
} from './echoesCrossoverTypes';
import type { EchoesCrossoverDraftInput } from './echoesCrossover';

export interface CrossoverWizardStep {
    id: string;
    label: string;
    completed: boolean;
}

export interface CrossoverWizardState {
    currentStep: number;
    steps: CrossoverWizardStep[];
    draft: EchoesCrossoverConfig | null;
    events: EchoesCanonEvent[];
    timeline: EchoesCrossoverTimelineState | null;
    generating: boolean;
    error: string | null;
}

const WIZARD_STEPS: CrossoverWizardStep[] = [
    { id: 'source', label: '选择原著', completed: false },
    { id: 'role', label: '设定身份', completed: false },
    { id: 'entry', label: '进入时间点', completed: false },
    { id: 'knowledge', label: '剧透设置', completed: false },
    { id: 'events', label: '生成事件', completed: false },
    { id: 'confirm', label: '确认创建', completed: false },
];

export function createWizardState(): CrossoverWizardState {
    return {
        currentStep: 0,
        steps: [...WIZARD_STEPS],
        draft: null,
        events: [],
        timeline: null,
        generating: false,
        error: null,
    };
}

export function updateDraft(
    state: CrossoverWizardState,
    input: EchoesCrossoverDraftInput
): CrossoverWizardState {
    const draft = state.draft
        ? { ...state.draft, ...createCrossoverConfigDraft(input), updatedAt: Date.now() }
        : createCrossoverConfigDraft(input);
    
    return {
        ...state,
        draft,
        error: null,
    };
}

export function nextStep(state: CrossoverWizardState): CrossoverWizardState {
    if (state.currentStep >= state.steps.length - 1) return state;
    
    const steps = state.steps.map((step, i) =>
        i === state.currentStep ? { ...step, completed: true } : step
    );
    
    return {
        ...state,
        currentStep: state.currentStep + 1,
        steps,
    };
}

export function prevStep(state: CrossoverWizardState): CrossoverWizardState {
    if (state.currentStep <= 0) return state;
    
    return {
        ...state,
        currentStep: state.currentStep - 1,
    };
}

export function buildEventGenerationPrompt(config: EchoesCrossoverConfig): string {
    const { source, entryPoint, canonPolicy, canonKnowledge } = config;
    
    return `你是穿书小说分析助手。根据以下原著信息，生成 10-30 个关键剧情事件。

## 原著信息

**标题：** ${source.title}
${source.author ? `**作者：** ${source.author}` : ''}
**进入时间点：** ${entryPoint.label}
${entryPoint.description ? `**时间点描述：** ${entryPoint.description}` : ''}
${entryPoint.chapterIndex !== undefined ? `**章节位置：** 第 ${entryPoint.chapterIndex + 1} 章` : ''}

## 原著主线策略

**策略：** ${canonPolicy === 'free' ? '自由创作（允许大幅偏离）' : canonPolicy === 'guided' ? '引导还原（尽量贴近原著）' : '固定主线（必须经历核心事件）'}

## 剧透设置

**剧透模式：** ${canonKnowledge.spoilerMode === 'none' ? '无剧透（玩家不知道未来）' : canonKnowledge.spoilerMode === 'hints' ? '部分提示' : '完全剧透'}

## 任务要求

生成 10-30 个关键剧情事件，要求：

1. **覆盖完整剧情线** — 从进入时间点到结局，主线事件不遗漏
2. **包含关键节点** — 主角成长、重要转折、核心冲突、结局线索
3. **按时间顺序排列** — 事件顺序符合原著逻辑
4. **适合玩家追踪** — 事件描述清晰，玩家能判断是否已到达
5. **支持偏离判断** — 事件足够具体，能判断玩家是否改变了走向

## 输出格式

严格按照以下 JSON 格式输出，不要添加任何其他文字：

\`\`\`json
{
  "events": [
    {
      "id": "event-001",
      "title": "事件标题",
      "summary": "事件简要描述（100-300字）",
      "chapterIndex": 5,
      "status": "upcoming",
      "source": "novel",
      "confidence": 0.9
    }
  ]
}
\`\`\`

## 字段说明

- **id** — 唯一标识，格式 "event-NNN"
- **title** — 事件标题，简洁明了
- **summary** — 事件描述，包含：谁、做什么、结果如何
- **chapterIndex** — 章节位置（数字，从 0 开始）
- **status** — 固定为 "upcoming"
- **source** — 固定为 "novel"（表示来自原著）
- **confidence** — 置信度（0.0-1.0），核心事件 0.9，次要事件 0.5-0.7

## 示例事件

{
  "id": "event-003",
  "title": "主角觉醒异能",
  "summary": "在被追杀的生死关头，主角李明觉醒了隐藏的时间暂停能力，成功逃脱并救下同伴",
  "chapterIndex": 8,
  "status": "upcoming",
  "source": "novel",
  "confidence": 0.95
}

现在开始生成事件列表。`;
}

export async function generateCanonEvents(
    config: EchoesCrossoverConfig,
    requestAI: (prompt: string, maxTokens: number, context: string) => Promise<string>
): Promise<EchoesCanonEvent[]> {
    const prompt = buildEventGenerationPrompt(config);
    
    let response: string;
    try {
        response = await requestAI(prompt, 4000, `穿书-生成事件-${config.source.title}`);
    } catch (error) {
        throw new Error(`AI 调用失败: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // 提取 JSON
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/{[\s\S]*}/);
    if (!jsonMatch) {
        throw new Error('AI 返回格式错误：未找到 JSON 数据');
    }
    
    let parsed: { events?: unknown[] };
    try {
        parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    } catch (error) {
        throw new Error('AI 返回的 JSON 无法解析');
    }
    
    if (!parsed.events || !Array.isArray(parsed.events)) {
        throw new Error('AI 返回的数据结构错误：缺少 events 数组');
    }
    
    if (parsed.events.length === 0) {
        throw new Error('AI 返回的事件列表为空');
    }
    
    if (parsed.events.length > 50) {
        parsed.events = parsed.events.slice(0, 50);
    }
    
    const events: EchoesCanonEvent[] = parsed.events.map((raw, index) => {
        const event: Partial<EchoesCanonEvent> = {
            id: typeof (raw as any).id === 'string' ? (raw as any).id : `event-${String(index + 1).padStart(3, '0')}`,
            title: typeof (raw as any).title === 'string' ? (raw as any).title : '未命名事件',
            summary: typeof (raw as any).summary === 'string' ? (raw as any).summary : '',
            chapterIndex: typeof (raw as any).chapterIndex === 'number' ? (raw as any).chapterIndex : undefined,
            status: 'upcoming',
            source: 'novel',
            confidence: typeof (raw as any).confidence === 'number' ? (raw as any).confidence : 0.5,
        };
        
        return normalizeCanonEvent(event as EchoesCanonEvent);
    });
    
    return events;
}

export async function generateEventsAndTimeline(
    state: CrossoverWizardState,
    requestAI: (prompt: string, maxTokens: number, context: string) => Promise<string>
): Promise<CrossoverWizardState> {
    if (!state.draft) {
        return {
            ...state,
            error: '缺少穿书配置',
        };
    }
    
    const updatedState: CrossoverWizardState = {
        ...state,
        generating: true,
        error: null,
    };
    
    try {
        const events = await generateCanonEvents(state.draft, requestAI);
        
        const timeline = createCrossoverTimelineState(events, {
            reachedChapterIndex: state.draft.entryPoint.chapterIndex ?? 0,
            currentEventId: events[0]?.id,
        });
        
        return {
            ...updatedState,
            events,
            timeline,
            generating: false,
        };
    } catch (error) {
        return {
            ...updatedState,
            generating: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export function confirmAndFinalize(
    state: CrossoverWizardState
): {
    config: EchoesCrossoverConfig;
    timeline: EchoesCrossoverTimelineState;
} | null {
    if (!state.draft || !state.timeline) {
        return null;
    }
    
    const confirmed = setCrossoverConfigConfirmed(state.draft);
    
    return {
        config: confirmed,
        timeline: state.timeline,
    };
}

export function validateStep(state: CrossoverWizardState, stepId: string): { valid: boolean; error?: string } {
    const { draft } = state;
    
    switch (stepId) {
        case 'source':
            if (!draft?.source.title) {
                return { valid: false, error: '请填写原著标题' };
            }
            return { valid: true };
        
        case 'role':
            if (!draft?.role) {
                return { valid: false, error: '请选择穿越身份' };
            }
            if (draft.role === 'replace_character' && !draft.replacementCharacter) {
                return { valid: false, error: '替换角色模式必须指定被替换角色' };
            }
            return { valid: true };
        
        case 'entry':
            if (!draft?.entryPoint.label) {
                return { valid: false, error: '请填写进入时间点' };
            }
            return { valid: true };
        
        case 'knowledge':
            if (!draft?.canonPolicy) {
                return { valid: false, error: '请选择原著主线策略' };
            }
            return { valid: true };
        
        case 'events':
            if (state.events.length === 0) {
                return { valid: false, error: '事件列表为空，请重新生成' };
            }
            return { valid: true };
        
        case 'confirm':
            return { valid: true };
        
        default:
            return { valid: true };
    }
}
