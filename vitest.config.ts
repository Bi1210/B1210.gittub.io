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
    // iSH 不支持 worker_threads/多进程，强制单线程（vitest 2.x 用 pool/poolOptions 取代旧版 threads）
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // isolate:false 会让所有测试文件共享同一份 globalThis/模块注册表——多个文件各自用
    // `if (typeof window === 'undefined')`/`??=` 这类"不覆盖"写法 stub window/document，
    // 谁先跑就把不完整的 stub 焊死给后面所有文件（缺 dispatchEvent/addEventListener/location
    // 等属性），这正是 49 个 vitest 失败里一大类"window.xxx is not a function"的根因。
    // 改成 true：每个测试文件独立的模块注册表和全局对象，用 singleFork 保证仍是单进程。
    isolate: true,
  },
});
