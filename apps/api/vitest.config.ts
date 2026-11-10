import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://rincon:rincon@localhost:5432/rincon_test',
      WEB_ORIGIN: 'http://localhost:3000',
      UPLOAD_DIR: '/tmp/rincon-test-uploads',
    },
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
