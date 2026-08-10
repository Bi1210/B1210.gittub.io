import { applyMechanicPatches, getMechanicDefinition, normalizeMechanic } from './echoesMechanics';
import { filterNovelMechanicPatches, getNovelRuntimeProfileState, sanitizeNovelMechanicSnapshot } from './echoesNovelRuntimeGuards';
import type {
    EchoesMechanicAction,
    EchoesMechanicData,
    EchoesMechanicInstance,
    EchoesMechanicPatch,
    EchoesScenarioOption,
    EchoesTaskEntry,
    EchoesInventoryItem,
} from './echoesMechanicsTypes';
import type { EchoesNovelProfile } from './echoesNovelProfileTypes';
import type {
    EchoesMechanicActionOptions,
    EchoesMechanicActionPreparation,
    EchoesMechanicActionRequest,
    EchoesMechanicActionResult,
} from './echoesMechanicActionsTypes';

const MAX_ID_CHARS = 160;
const MAX_ACTION_TEXT_CHARS = 500;

const cleanId = (value: unknown): string => typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_ID_CHARS)
    : '';

export function normalizeEchoesMechanicActionRequest(raw: unknown): EchoesMechanicActionRequest | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const value = raw as Record<string, unknown>;
    const mechanicId = cleanId(value.mechanicId);
    const actionId = cleanId(value.actionId);
    return mechanicId && actionId ? { mechanicId, actionId } : undefined;
}

const nowValue = (value: number | undefined): number => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : Date.now();

const result = (
    request: EchoesMechanicActionRequest,
    mechanics: EchoesMechanicInstance[],
    fields: Omit<EchoesMechanicActionResult, 'version' | 'request' | 'mechanics'>,
): EchoesMechanicActionResult => ({
    version: 'echoes-mechanic-actions/1',
    request,
    mechanics,
    ...fields,
});

function actionCandidates(mechanic: EchoesMechanicInstance): EchoesMechanicAction[] {
    const actions = [...mechanic.actions];
    if (mechanic.kind === 'event_card' && mechanic.data.kind === 'event_card') {
        actions.push(...mechanic.data.data.choices);
    }
    const seen = new Set<string>();
    return actions.filter(action => {
        if (seen.has(action.id)) return false;
        seen.add(action.id);
        return true;
    });
}

/** Bounded, UI-agnostic action context for the director prompt. */
export function buildEchoesMechanicActionContext(
    currentMechanics: readonly EchoesMechanicInstance[] | null | undefined,
    profile?: EchoesNovelProfile | null,
): { text: string; mechanicIds: string[] } {
    const mechanics = getNovelRuntimeProfileState(profile) === 'invalid'
        ? []
        : sanitizeNovelMechanicSnapshot(currentMechanics, profile, []);
    const lines: string[] = [];
    const mechanicIds: string[] = [];
    for (const mechanic of mechanics.slice(0, 20)) {
        if (mechanic.status !== 'active') continue;
        const definition = getMechanicDefinition(mechanic.kind);
        if (!definition?.interactive) continue;
        const actions = actionCandidates(mechanic).slice(0, 12).map(action =>
            `${action.id}:${action.label}${action.disabled ? `（禁用：${action.disabledReason || '条件不足'}）` : ''}`,
        );
        mechanicIds.push(mechanic.id);
        lines.push(`${mechanic.id} / ${mechanic.kind} / ${mechanic.title}${actions.length ? ` / 可用动作：${actions.join('、')}` : ''}`);
    }
    return { text: lines.join('\n').slice(0, 4_000), mechanicIds };
}

function updateScenario(
    mechanic: EchoesMechanicInstance,
    optionId: string,
    now: number,
): EchoesMechanicInstance | null {
    if (mechanic.kind !== 'scenario_picker' || mechanic.data.kind !== 'scenario_picker') return null;
    const options = mechanic.data.options;
    const selected = options.find(option => option.id === optionId);
    if (!selected || ['locked', 'completed', 'failed'].includes(selected.status)) return null;
    const nextOptions: EchoesScenarioOption[] = options.map(option => ({
        ...option,
        selected: option.id === optionId,
        status: option.id === optionId ? 'selected' : (option.status === 'selected' ? 'available' : option.status),
    }));
    const data: EchoesMechanicData = { kind: 'scenario_picker', options: nextOptions, allowAutoSelect: mechanic.data.allowAutoSelect };
    return normalizeMechanic({ ...mechanic, data }, now);
}

function updateTask(
    mechanic: EchoesMechanicInstance,
    taskId: string,
    status: EchoesTaskEntry['status'] | undefined,
    progress: number | undefined,
    now: number,
): EchoesMechanicInstance | null {
    if (mechanic.kind !== 'task_panel' || mechanic.data.kind !== 'task_panel') return null;
    const task = mechanic.data.tasks.find(item => item.id === taskId);
    if (!task || (status === undefined && progress === undefined)) return null;
    const tasks: EchoesTaskEntry[] = mechanic.data.tasks.map(item => item.id === taskId
        ? { ...item, ...(status ? { status } : {}), ...(progress !== undefined ? { progress } : {}) }
        : item);
    return normalizeMechanic({ ...mechanic, data: { kind: 'task_panel', tasks } }, now);
}

function updateInventory(
    mechanic: EchoesMechanicInstance,
    itemId: string,
    quantity: number | undefined,
    equipped: boolean | undefined,
    now: number,
): EchoesMechanicInstance | null {
    if (mechanic.kind !== 'inventory_grid' || mechanic.data.kind !== 'inventory_grid') return null;
    const item = mechanic.data.items.find(entry => entry.id === itemId);
    if (!item || (quantity === undefined && equipped === undefined)) return null;
    const items: EchoesInventoryItem[] = mechanic.data.items.map(entry => entry.id === itemId
        ? {
            ...entry,
            ...(quantity !== undefined ? { quantity: Math.max(0, Math.min(9999, Math.floor(quantity))) } : {}),
            ...(equipped !== undefined ? { equipped } : {}),
        }
        : entry);
    return normalizeMechanic({ ...mechanic, data: { kind: 'inventory_grid', items } }, now);
}

function effectTarget(
    mechanics: readonly EchoesMechanicInstance[],
    source: EchoesMechanicInstance,
    action: EchoesMechanicAction,
): EchoesMechanicInstance | null {
    const effect = action.effect;
    if (!effect) return source;
    const targetMechanicId = effect.targetMechanicId;
    if (effect.type === 'set_status' && !targetMechanicId) return source;
    const matches = (mechanic: EchoesMechanicInstance): boolean => {
        if (targetMechanicId && mechanic.id !== targetMechanicId) return false;
        if (mechanic.status === 'disabled') return false;
        if (effect.type === 'set_status') return true;
        if (effect.type === 'scenario_select') {
            return mechanic.kind === 'scenario_picker'
                && mechanic.data.kind === 'scenario_picker'
                && mechanic.data.options.some(option => option.id === effect.optionId);
        }
        if (effect.type === 'task_update') {
            return mechanic.kind === 'task_panel'
                && mechanic.data.kind === 'task_panel'
                && mechanic.data.tasks.some(task => task.id === effect.taskId);
        }
        if (effect.type === 'inventory_update') {
            return mechanic.kind === 'inventory_grid'
                && mechanic.data.kind === 'inventory_grid'
                && mechanic.data.items.some(item => item.id === effect.itemId);
        }
        return false;
    };
    // A component may update itself without a target ID. Cross-component
    // effects must name the exact target; never silently choose the first
    // matching task/item/option in the snapshot.
    if (!targetMechanicId) return matches(source) ? source : null;
    return mechanics.find(matches) || null;
}

function applyEffectToMechanics(
    mechanics: readonly EchoesMechanicInstance[],
    source: EchoesMechanicInstance,
    action: EchoesMechanicAction,
    now: number,
): { mechanics: EchoesMechanicInstance[]; target: EchoesMechanicInstance; changed: boolean } | null {
    const target = effectTarget(mechanics, source, action);
    if (!target) return null;
    const effect = action.effect;
    let updated: EchoesMechanicInstance | null = target;
    if (effect?.type === 'set_status') updated = normalizeMechanic({ ...target, status: effect.status }, now);
    if (effect?.type === 'scenario_select') updated = updateScenario(target, effect.optionId, now);
    if (effect?.type === 'task_update') updated = updateTask(target, effect.taskId, effect.status, effect.progress, now);
    if (effect?.type === 'inventory_update') updated = updateInventory(target, effect.itemId, effect.quantity, effect.equipped, now);
    if (!updated) return null;
    const changed = JSON.stringify(updated) !== JSON.stringify(target);
    return {
        mechanics: mechanics.map(item => item.id === target.id ? updated! : item),
        target: updated,
        changed,
    };
}

/**
 * Applies one UI-originated mechanic action without allowing arbitrary state
 * patches. The caller can feed actionText into the normal Echoes turn loop;
 * local effects are limited to the normalized mechanic itself.
 */
export function applyEchoesMechanicAction(
    currentMechanics: readonly EchoesMechanicInstance[] | null | undefined,
    rawRequest: unknown,
    options: EchoesMechanicActionOptions = {},
): EchoesMechanicActionResult {
    const normalizedRequest = normalizeEchoesMechanicActionRequest(rawRequest);
    const request: EchoesMechanicActionRequest = normalizedRequest || { mechanicId: '', actionId: '' };
    const profileState = getNovelRuntimeProfileState(options.profile);
    const mechanics = profileState === 'invalid'
        ? []
        : sanitizeNovelMechanicSnapshot(currentMechanics, options.profile, [], nowValue(options.now));
    if (!request.mechanicId || !request.actionId) {
        return result(request, mechanics, { accepted: false, changed: false, reason: '机制动作请求缺少稳定 ID。' });
    }
    const mechanic = mechanics.find(item => item.id === request.mechanicId);
    if (!mechanic) return result(request, mechanics, { accepted: false, changed: false, reason: '机制不存在或未通过当前 Profile 门控。' });
    if (mechanic.status !== 'active') return result(request, mechanics, { accepted: false, changed: false, mechanic, reason: '机制当前不可交互。' });
    if (!getMechanicDefinition(mechanic.kind)?.interactive) return result(request, mechanics, { accepted: false, changed: false, mechanic, reason: '该机制不是交互组件。' });
    const action = actionCandidates(mechanic).find(item => item.id === request.actionId);
    if (!action) return result(request, mechanics, { accepted: false, changed: false, mechanic, reason: '动作不存在。' });
    if (action.disabled) return result(request, mechanics, { accepted: false, changed: false, mechanic, action, reason: action.disabledReason || '动作当前不可用。' });
    const now = nowValue(options.now);
    const applied = applyEffectToMechanics(mechanics, mechanic, action, now);
    if (!applied) {
        return result(request, mechanics, {
            accepted: !action.effect,
            changed: false,
            mechanic,
            action,
            actionText: `执行组件动作：${action.label}`.slice(0, MAX_ACTION_TEXT_CHARS),
            reason: action.effect ? '动作效果与当前机制数据不匹配，已拒绝本次本地状态变更。' : '动作已记录，由 Echoes 叙事回合处理后续结果。',
        });
    }
    return result(request, applied.mechanics, {
        accepted: true,
        changed: applied.changed,
        ...(applied.changed ? { patch: { op: 'upsert', mechanic: applied.target } } : {}),
        mechanic: applied.target,
        action,
        actionText: `执行组件动作：${action.label}`.slice(0, MAX_ACTION_TEXT_CHARS),
    });
}

/**
 * Prepares a component action before an AI turn. This is the single contract
 * future UI code should call: it sanitizes the current snapshot, applies the
 * local allowlisted effect, and returns a replayable patch without touching
 * narrative state.
 */
export function prepareEchoesMechanicAction(
    currentMechanics: readonly EchoesMechanicInstance[] | null | undefined,
    rawRequest: unknown,
    options: EchoesMechanicActionOptions = {},
): EchoesMechanicActionPreparation {
    const hadRequest = rawRequest !== undefined;
    const now = nowValue(options.now);
    const beforeMechanics = getNovelRuntimeProfileState(options.profile) === 'invalid'
        ? []
        : sanitizeNovelMechanicSnapshot(currentMechanics, options.profile, [], now);
    if (!hadRequest) return {
        accepted: true,
        hadRequest: false,
        beforeMechanics,
        mechanics: beforeMechanics,
        localPatches: [],
    };
    const request = normalizeEchoesMechanicActionRequest(rawRequest);
    if (!request) return {
        accepted: false,
        hadRequest: true,
        beforeMechanics,
        mechanics: beforeMechanics,
        localPatches: [],
        reason: '机制动作请求无效。',
    };
    const actionResult = applyEchoesMechanicAction(beforeMechanics, request, { ...options, now });
    if (!actionResult.accepted) return {
        accepted: false,
        hadRequest: true,
        beforeMechanics,
        mechanics: beforeMechanics,
        localPatches: [],
        request,
        result: actionResult,
        reason: actionResult.reason || '组件动作当前不可用。',
    };
    if (!actionResult.patch) return {
        accepted: true,
        hadRequest: true,
        beforeMechanics,
        mechanics: beforeMechanics,
        localPatches: [],
        request,
        result: actionResult,
        actionText: actionResult.actionText,
        reason: actionResult.reason,
    };
    const gate = filterNovelMechanicPatches([actionResult.patch], options.profile, beforeMechanics);
    if (!gate.patches.length) return {
        accepted: false,
        hadRequest: true,
        beforeMechanics,
        mechanics: beforeMechanics,
        localPatches: [],
        request,
        result: actionResult,
        reason: '组件动作未通过运行时门控。',
    };
    return {
        accepted: true,
        hadRequest: true,
        beforeMechanics,
        mechanics: applyMechanicPatches(beforeMechanics, gate.patches, now),
        localPatches: gate.patches,
        request,
        result: actionResult,
        actionText: actionResult.actionText,
    };
}
