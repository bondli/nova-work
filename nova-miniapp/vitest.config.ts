import type { Config } from 'vitest/config'

export default {
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
} satisfies Config
