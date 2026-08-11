/**
 * WorldPackage：Echoes 世界观无关引擎的"世界包"协议。
 *
 * 严格遵守 /var/minis/shared/wanxiang/wanxiang-worldpackage-spec.md 第10节确认的范围：
 * 一个世界包只包含三类东西，全部是"开局前该公开的静态配置"：
 *   1. 设定种子（题材、世界观背景、玩家身份、主要角色/势力的公开人设模板）
 *   2. 初始机制面板配置（开局就该显示的机制实例，复用现有 EchoesMechanicKind）
 *   3. writingGuide / protocol 默认值（把创作约束固化成 prompt 文本，不是代码逻辑）
 *
 * 不包含：隐藏骨架、预写的具体真相/副本剧本、规则公式引擎、任何新机制类型、任何 UI 组件代码。
 * 世界包必须保持"纯数据"——不携带函数、HTML、CSS 或任意代码，这样才能安全加载、
 * 优雅降级、版本兼容。视觉变体（见第11节）也只是一个字符串标签，具体样式由渲染层决定。
 *
 * 两套形状，不要混用：
 * - `WorldPackageManifestInput`：世界包作者手写的原始数据（如 ./wanxiang.ts 导出的常量）。
 *   宽松、未校验，字段可以省略容错字段。
 * - `WorldPackageManifest`：经 registry.ts 的 normalizeWorldPackageManifest 校验归一化后
 *   的可信形状，供创建流程等下游代码安全消费。initialMechanics 已经是完整的
 *   EchoesMechanicInstance[]（走过与 AI patch 完全相同的 normalizeMechanic 归一化）。
 */

import type { EchoesMode, EchoesQualityMode, EchoesWritingGuide, EchoesProtocolConfig } from '../types';
import type { EchoesMechanicInstance } from '../utils/echoesMechanicsTypes';

export const WORLD_PACKAGE_SCHEMA_VERSION = 1 as const;

/**
 * 初始机制实例的"作者输入"形状。
 * 世界包作者只需要提供语义字段；id 由作者指定并保持跨加载稳定（用于覆盖式更新，
 * 而不是每次加载都堆叠新实例）。schemaVersion/updatedAt 等运行时字段由加载时
 * 统一通过 normalizeMechanic 生成，作者不必也不应该手填。
 */
export interface WorldPackageMechanicSeed {
    /** 稳定 id；同一世界包多次加载应产生同一个 id。 */
    id: string;
    kind: string;
    title: string;
    description?: string;
    trigger?: string;
    status?: string;
    /** 语义数据，形状取决于 kind；由 normalizeMechanic 按 kind 白名单结构化，非法字段会被丢弃。 */
    data: unknown;
}

export interface WorldPackageSeed {
    /** 世界观背景文本，只含"外壳框架"，不含最终真相。 */
    worldSetting: string;
    /** 玩家的公开身份介绍；不含身世悬案等待运行时重新生成的悬念内容。 */
    playerIdentity: string;
    /** 主要角色/阵营的公开人设文本（自由文本形式，供创建向导展示/编辑；
     * 结构化的人物档案另见 initialMechanics 里的 cast_roster 实例）。 */
    cast: string;
}

/** 世界包作者手写的原始数据形状（未校验）。 */
export interface WorldPackageManifestInput {
    schemaVersion: 1;
    /** 稳定 slug，如 'wanxiang'；只能是小写字母/数字/短横线/下划线。 */
    id: string;
    /** 展示名称，如"万象失控游戏"。 */
    name: string;
    /** 题材标签，用于世界包选择界面的分类/检索。 */
    genreTags: string[];
    /** 一两句话的简介，展示在世界包选择卡片上。 */
    description: string;
    seed: WorldPackageSeed;
    defaultMode: EchoesMode;
    defaultQualityMode: EchoesQualityMode;
    initialMechanics: WorldPackageMechanicSeed[];
    writingGuide: EchoesWritingGuide;
    /** 只覆盖协议里的部分字段（一般是 customInstructions），未列出的字段沿用 App 默认协议。 */
    protocolOverrides?: Partial<EchoesProtocolConfig>;
    /**
     * 可选的视觉变体标签，纯数据（如 'wanxiang_terminal'）。
     * 渲染层（EchoesMechanicRenderer.tsx）预先注册好每个变体的样式选项；
     * 世界包只能"选用哪个变体"，不能携带任何 CSS/HTML 或自定义样式逻辑。
     */
    visualVariant?: string;
}

/** 经 registry.ts 校验归一化后的可信世界包形状。 */
export interface WorldPackageManifest {
    schemaVersion: 1;
    id: string;
    name: string;
    genreTags: string[];
    description: string;
    seed: WorldPackageSeed;
    defaultMode: EchoesMode;
    defaultQualityMode: EchoesQualityMode;
    /** 已归一化的可信机制实例，与 AI patch 走同一套 normalizeMechanic 校验。 */
    initialMechanics: EchoesMechanicInstance[];
    writingGuide: EchoesWritingGuide;
    protocolOverrides?: Partial<EchoesProtocolConfig>;
    visualVariant?: string;
}
