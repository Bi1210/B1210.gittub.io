/**
 * 构建版本相关常量的单一来源。
 *
 * `__BUILD_BRANCH__` / `__BUILD_COMMIT__` / `__BUILD_TIME__`
 * 是 vite.config.ts 注入的全局常量（prod 也有真值），
 * 但「branch@commit」这个 user-facing 标签字符串原本在 BuildBadge / VersionInfo / DevDebugPanel
 * 三处分别现拼，想加 dirty 标、截短 commit 之类要改三处——抽到这里集中维护。
 */

import { CURRENT_VERSION } from './version';

/** "branch@shortCommit" 形式的构建标签；BuildBadge 角标、设置页 VersionInfo、调试面板都用这一份。 */
export const BUILD_LABEL = `${__BUILD_BRANCH__}@${__BUILD_COMMIT__}`;

/** 构建时间标签，固定由 Vite 按 UTC+8 注入，避免受用户本机时区影响。 */
export const BUILD_TIME_LABEL = __BUILD_TIME__;

/** 设置页底部的产品版本名：与构建时 Git 自动生成的版本号保持一致。 */
export const APP_VERSION = `v${CURRENT_VERSION}`;

/** 统计标签使用同一个自动版本号，避免页面显示和埋点各自停在旧版本。 */
export const APP_VERSION_TAG = APP_VERSION.split(' ')[0];
