import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/db/migrate.ts', 'src/db/seed.ts', 'src/db/create-owner.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  // El paquete compartido es TypeScript fuente: se empaqueta dentro del build.
  noExternal: ['@rincon/shared'],
  sourcemap: true,
});
