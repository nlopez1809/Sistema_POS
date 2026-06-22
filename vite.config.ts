import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    // Resolver igual que el build para que los mocks funcionen
    alias: {
      '@':      path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/store/**', 'src/lib/**', 'src/hooks/**'],
      exclude: ['src/lib/supabase.ts'],
    },
  },
  resolve: {
    alias: {
      '@':       path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:   ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          query:    ['@tanstack/react-query'],
          charts:   ['recharts'],
          store:    ['zustand'],
        },
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
  },
});
