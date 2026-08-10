import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test-setup.ts'],
    include: [
      'utils/**/*.test.ts',
      'worker/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    // 排除 React 组件 / 浏览器集成测 (没装 jsdom)
    exclude: ['node_modules', '**/node_modules/**', '.worktrees', 'dist'],
    // 用 forks pool（每个测试文件在独立子进程里跑，天然隔离 globalThis）。
    //
    // 历史上这里加过 `singleFork: true`，理由是"iSH 不支持 worker_threads/多进程"——但
    // Test Suite workflow 实际跑在 GitHub Actions 的 Ubuntu runner 上，不是 iSH，没有这个限制
    // (iSH 本地跑 vitest 另有 esbuild 二进制缺失问题，已确认不可行，只能靠读 CI 日志验证)。
    // singleFork:true 会强制所有测试文件挤进同一个 OS 进程，这时 isolate:true 只重置模块
    // 注册表，重置不了测试文件里手动 `(globalThis as any).window = {...}` 这种直接改写全局对象
    // 的操作——第一个文件设的残缺 window stub（缺 location/dispatchEvent 等）原样留在内存里，
    // 被同进程里后跑的文件直接读到。这正是"window.xxx is not a function"/"Invalid URL"
    // 那批失败的根因：不是回归，是 singleFork 让本该独立的测试文件共享了同一个 globalThis。
    // 去掉 singleFork：每个测试文件各起一个子进程，globalThis 真正互不干扰。
    pool: 'forks',
    isolate: true,
  },
});
