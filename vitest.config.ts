import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Vitest configuration for the test safety net.
// Two projects: `core` (jsdom) for the platform-agnostic package, and
// `node` for the Electron main/preload process code.
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
      '@test': resolve(__dirname, 'test'),
      '@music-player/core/platform': resolve(__dirname, 'packages/core/src/platform.ts'),
      '@music-player/core': resolve(__dirname, 'packages/core/src'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'core',
          environment: 'jsdom',
          globals: true,
          include: ['packages/core/src/**/*.{test,spec}.{ts,tsx}'],
          setupFiles: ['./test/setup.core.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          globals: true,
          include: ['src/**/*.{test,spec}.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      // Files measured by the coverage gate. Grow this list as new layers are
      // brought under test (e.g. individual React components).
      include: [
        'packages/core/src/services/**',
        'packages/core/src/stores/**',
        'src/main/**',
        'src/preload/**',
      ],
      exclude: ['**/*.d.ts', '**/*.{test,spec}.*'],
      // Raised from the initial 80% baseline once the safety net reached full
      // line/function coverage. statements/functions/lines are held at 100% so any
      // new untested code fails CI; branches allow a small buffer for defensive
      // optional-chaining/fallback expressions in the service layer.
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 90,
        statements: 100,
      },
    },
  },
})
