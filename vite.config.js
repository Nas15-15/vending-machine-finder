import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

const MULTI_PAGE_INPUT = {
  main: 'index.html',
  login: 'login.html',
  signup: 'signup.html',
  promo: 'promo.html',
  owner: 'owner-control-center.html',
  paySuccess: 'pay-success.html'
};

export default defineConfig(({ mode }) => ({
  plugins: [
    legacy({
      targets: ['defaults', 'not IE 11']
    })
  ],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: MULTI_PAGE_INPUT
    },
    // Copy _redirects file to dist for Netlify
    copyPublicDir: true
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:4242',
        changeOrigin: true
      }
    }
  },
  define: {
    __APP_ENV__: JSON.stringify(mode)
  },
  test: {
    environment: 'node'
  }
}));

