import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Tauri expects a fixed port and host access for the embedded webview
export default defineConfig({
  plugins: [react()],
  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Allow Tauri's OS webview to connect to the Vite dev server
    host: '127.0.0.1',
    watch: {
      // On Windows, tell Vite to only watch specific extensions
      // to avoid excessive file watcher usage
      ignored: ['**/src-tauri/**'],
    },
  },
  // Produce sourcemaps for better debugging in Tauri
  build: {
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // Tauri supports ES2021
    target: process.env.TAURI_ENV_PLATFORM == 'windows'
      ? 'chrome105'
      : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
  },
})

