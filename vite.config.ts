import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              input: {
                main: path.join(__dirname, 'electron/main.ts'),
                'service-process': path.join(__dirname, 'electron/service-process.ts'),
              },
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      renderer: process.env.NODE_ENV === 'test'
        ? undefined
        : {},
    }),
    tailwindcss()
  ],
  test: {
    globals: true,
    environmentMatchGlobs: [
      ['src/**/*.test.ts', 'jsdom'],
      ['src/**/*.test.tsx', 'jsdom'],
      ['electron/**/*.test.ts', 'node'],
    ],
  },
})
