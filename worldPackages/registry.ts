/**
 * 世界包本地注册表：加载校验 + 安全归一化。
 *
 * 设计原则（与 utils/echoesMechanics.ts 的 fail-closed 归一化风格一致）：
 * - 世界包数据本身是静态本地文件（如 ./wanxiang.ts），不是网络输入，但仍必须走一次
 *   结构校验/归一化，理由有两条：(1) 防止作者手填数据时的低级错误（拼错 kind、漏填必填
 *   字段）在开发期悄悄通过、运行期才炸；(2) 为未来"从 JSON 导入世界包"这类场景预留同一
 *   套校验边界，不需要到时候重新设计一套。
 * - 校验失败的世界包不会让整个注册表崩溃：单个世界包归一化失败时打印警告并从列表中剔除，
 *   不影响其他世界包正常加载（"优雅降级"原则，呼应 spec 第11节对纯数据世界包的要求）。
 * - 本文件不依赖 apps/EchoesApp.tsx 内部未导出的函数（如 normalizeWritingGuide/
 *   normalizeProtocol），因为那些是创建流程接线时（spec 第12节步骤5，本次不做）才会
 *   用到的合并逻辑；这里只保证世界包数据自身结构合法、安全、可被下游安全消费。
 */

import { normalizeMechanic } from '../utils/echoesMechanics';
import type { EchoesMechanicInstance } from '../utils/echoesMechanicsTypes';
import type { EchoesMode, EchoesQualityMode, EchoesWritingGuide, EchoesProtocolConfig } from '../types';
import type { WorldPackageManifest, WorldPackageManifestInput, WorldPackageMechanicSeed, WorldPackageSeed } from './types';
import { WANXIANG_WORLD_PACKAGE } from './wanxiang';

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const MODES: ReadonlySet<EchoesMode> = new Set(['reader', 'interactive', 'immersive', 'sandbox']);
const QUALITY_MODES: ReadonlySet<EchoesQualityMode> = new Set(['standard', 'high', 'maximum']);

function text(value: unknown, max = 4000): string {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function stringArray(value: unknown, max = 20, itemMax = 60): string[] {
    if (!Array.isArray(value)) return [];
    return value.map(item => text(item, itemMax)).filter(Boolean).slice(0, max);
}

/**
 * 校验并归一化 seed 三个字段。三者都是自由文本，唯一的硬约束是非空——
 * 一个没有世界观背景的世界包在创建流程里毫无意义，直接判失败比留一个空字符串
 * 静默进入创建向导更安全。
 */
function normalizeSeed(raw: unknown, errors: string[]): WorldPackageSeed | null {
    const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const worldSetting = text(source.worldSetting, 6000);
    const playerIdentity = text(source.playerIdentity, 4000);
    const cast = text(source.cast, 8000);
    if (!worldSetting) errors.push('seed.worldSetting 不能为空');
    if (!worldSetting) return null;
    return { worldSetting, playerIdentity, cast };
}

function normalizeWritingGuide(raw: unknown): EchoesWritingGuide {
    const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const clampWords = (value: unknown): number => {
        const n = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(n) && n >= 0 ? Math.round(Math.min(n, 20000)) : 0;
    };
    const rounds = typeof source.contextRounds === 'number' ? source.contextRounds : Number(source.contextRounds);
    return {
        style: text(source.style, 200),
        tone: text(source.tone, 200),
        perspective: text(source.perspective, 200),
        minWords: clampWords(source.minWords),
        maxWords: clampWords(source.maxWords),
        contextRounds: Number.isFinite(rounds) && rounds > 0 ? Math.min(Math.round(rounds), 40) : 8,
        // authorInstructions 是世界包 writingGuide 的主体内容（本次万象包的第1-8节约束
        // 都落在这里），允许比创建流程手填场景更长；接入创建流程时如需与 App 侧
        // normalizeWritingGuide 的 2000 字截断对齐，留给第12节步骤5处理。
        authorInstructions: text(source.authorInstructions, 20000),
    };
}

/**
 * 世界包只能提供 EchoesProtocolConfig 的部分覆盖（一般是 customInstructions），
 * 不做完整归一化——完整协议对象的默认值由 App 侧 DEFAULT_PROTOCOL 提供，
 * 世界包不应该、也不需要自己伪造一份"看起来完整"的协议配置。
 */
function normalizeProtocolOverrides(raw: unknown): Partial<EchoesProtocolConfig> {
    const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const out: Partial<EchoesProtocolConfig> = {};
    (['enabled', 'continuityLedger', 'playerAgency', 'characterAutonomy', 'sensoryWriting', 'meaningfulProgress', 'sceneObservation'] as const)
        .forEach(key => { if (typeof source[key] === 'boolean') out[key] = source[key]; });
    if (typeof source.customInstructions === 'string') out.customInstructions = text(source.customInstructions, 6000);
    return out;
}

/**
 * 归一化单条机制种子。复用 utils/echoesMechanics.ts 里同一套 fail-closed 归一化
 * （未注册的 kind 会被安全降级为 'unsupported'，不会抛出或产生非法结构）。
 * 世界包作者填的 id 会被保留（世界包需要稳定 id 才能覆盖式更新，而不是每次
 * 加载都堆叠新实例），只有当作者没填 id 时才回退到 normalizeMechanic 的哈希 id。
 */
function normalizeMechanicSeed(raw: WorldPackageMechanicSeed, now: number): EchoesMechanicInstance {
    return normalizeMechanic({ ...raw, source: 'system' }, now);
}

/**
 * 校验并归一化一个世界包 manifest。失败时返回 null 并把原因写进 errors，
 * 调用方（listWorldPackages）负责决定如何处理失败项（当前策略：跳过并打警告）。
 */
export function normalizeWorldPackageManifest(raw: unknown, now = Date.now()): { manifest: WorldPackageManifest | null; errors: string[] } {
    const errors: string[] = [];
    const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};

    const id = text(source.id, 64);
    if (!id || !ID_PATTERN.test(id)) errors.push(`id 不合法："${id}"，只能是小写字母/数字/短横线/下划线，且至少2位`);

    const name = text(source.name, 100);
    if (!name) errors.push('name 不能为空');

    const description = text(source.description, 400);

    const genreTags = stringArray(source.genreTags, 10, 30);

    const seed = normalizeSeed(source.seed, errors);

    const defaultMode: EchoesMode = MODES.has(source.defaultMode as EchoesMode) ? source.defaultMode as EchoesMode : 'interactive';
    const defaultQualityMode: EchoesQualityMode = QUALITY_MODES.has(source.defaultQualityMode as EchoesQualityMode) ? source.defaultQualityMode as EchoesQualityMode : 'maximum';

    const rawMechanics = Array.isArray(source.initialMechanics) ? source.initialMechanics.slice(0, 50) : [];
    const seenIds = new Set<string>();
    const initialMechanics: EchoesMechanicInstance[] = [];
    rawMechanics.forEach((item, index) => {
        if (!item || typeof item !== 'object') { errors.push(`initialMechanics[${index}] 不是有效对象`); return; }
        const seedItem = item as WorldPackageMechanicSeed;
        const mechanic = normalizeMechanicSeed(seedItem, now);
        if (seenIds.has(mechanic.id)) { errors.push(`initialMechanics 出现重复 id："${mechanic.id}"`); return; }
        seenIds.add(mechanic.id);
        initialMechanics.push(mechanic);
    });

    const writingGuide = normalizeWritingGuide(source.writingGuide);
    if (!writingGuide.authorInstructions) errors.push('writingGuide.authorInstructions 不能为空（世界包的核心约束都应固化在这里）');

    const protocolOverrides = normalizeProtocolOverrides(source.protocolOverrides);

    const visualVariant = text(source.visualVariant, 60) || undefined;

    if (!seed || errors.some(message => message.includes('id 不合法') || message.includes('name 不能为空') || message.includes('authorInstructions 不能为空'))) {
        return { manifest: null, errors };
    }

    const manifest: WorldPackageManifest = {
        schemaVersion: 1,
        id,
        name,
        genreTags,
        description,
        seed,
        defaultMode,
        defaultQualityMode,
        initialMechanics,
        writingGuide,
        ...(Object.keys(protocolOverrides).length ? { protocolOverrides } : {}),
        ...(visualVariant ? { visualVariant } : {}),
    };
    return { manifest, errors };
}

/**
 * 静态本地注册表：新增世界包时，在这里 import 并加入数组即可。
 * 不采用"文件自注册到全局 Map"的副作用式模式——显式列表更容易审查有哪些世界包，
 * 也避免 ESM 场景下副作用导入被摇树优化掉导致漏注册。
 */
const RAW_WORLD_PACKAGES: WorldPackageManifestInput[] = [
    WANXIANG_WORLD_PACKAGE,
];

let cachedPackages: WorldPackageManifest[] | null = null;

/** 返回所有校验通过的世界包；校验失败的世界包会被跳过并在控制台打警告，不影响其余世界包。 */
export function listWorldPackages(): WorldPackageManifest[] {
    if (cachedPackages) return cachedPackages;
    const now = Date.now();
    const seenIds = new Set<string>();
    const result: WorldPackageManifest[] = [];
    for (const raw of RAW_WORLD_PACKAGES) {
        const { manifest, errors } = normalizeWorldPackageManifest(raw, now);
        if (!manifest) {
            console.warn('[worldPackages] 跳过一个校验失败的世界包：', errors);
            continue;
        }
        if (seenIds.has(manifest.id)) {
            console.warn(`[worldPackages] 跳过重复 id 的世界包："${manifest.id}"`);
            continue;
        }
        seenIds.add(manifest.id);
        result.push(manifest);
    }
    cachedPackages = result;
    return result;
}

export function getWorldPackageById(id: string): WorldPackageManifest | undefined {
    return listWorldPackages().find(item => item.id === id);
}

/** 供创建流程（第12节步骤5，本次未接入）复用：从世界包取出可直接使用的初始机制实例列表。 */
export function getInitialMechanicsForPackage(pkg: WorldPackageManifest): EchoesMechanicInstance[] {
    return pkg.initialMechanics;
}
