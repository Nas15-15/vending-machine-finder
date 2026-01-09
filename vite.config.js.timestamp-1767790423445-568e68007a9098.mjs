// vite.config.js
import { defineConfig } from "file:///C:/Users/nasir/OneDrive/Desktop/Projects/vending-machine-finder/node_modules/vite/dist/node/index.js";
import legacy from "file:///C:/Users/nasir/OneDrive/Desktop/Projects/vending-machine-finder/node_modules/@vitejs/plugin-legacy/dist/index.mjs";
var MULTI_PAGE_INPUT = {
  main: "index.html",
  signup: "signup.html"
};
var vite_config_default = defineConfig(({ mode }) => ({
  plugins: [
    legacy({
      targets: ["defaults", "not IE 11"]
    })
  ],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: MULTI_PAGE_INPUT
    },
    copyPublicDir: true
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY ?? "http://localhost:4242",
        changeOrigin: true
      }
    }
  },
  define: {
    __APP_ENV__: JSON.stringify(mode)
  },
  test: {
    environment: "node"
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxuYXNpclxcXFxPbmVEcml2ZVxcXFxEZXNrdG9wXFxcXFByb2plY3RzXFxcXHZlbmRpbmctbWFjaGluZS1maW5kZXJcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXG5hc2lyXFxcXE9uZURyaXZlXFxcXERlc2t0b3BcXFxcUHJvamVjdHNcXFxcdmVuZGluZy1tYWNoaW5lLWZpbmRlclxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvbmFzaXIvT25lRHJpdmUvRGVza3RvcC9Qcm9qZWN0cy92ZW5kaW5nLW1hY2hpbmUtZmluZGVyL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgbGVnYWN5IGZyb20gJ0B2aXRlanMvcGx1Z2luLWxlZ2FjeSc7XG5cbmNvbnN0IE1VTFRJX1BBR0VfSU5QVVQgPSB7XG4gIG1haW46ICdpbmRleC5odG1sJyxcbiAgc2lnbnVwOiAnc2lnbnVwLmh0bWwnXG59O1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHsgbW9kZSB9KSA9PiAoe1xuICBwbHVnaW5zOiBbXG4gICAgbGVnYWN5KHtcbiAgICAgIHRhcmdldHM6IFsnZGVmYXVsdHMnLCAnbm90IElFIDExJ11cbiAgICB9KVxuICBdLFxuICBwdWJsaWNEaXI6ICdwdWJsaWMnLFxuICBidWlsZDoge1xuICAgIG91dERpcjogJ2Rpc3QnLFxuICAgIGVtcHR5T3V0RGlyOiB0cnVlLFxuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIGlucHV0OiBNVUxUSV9QQUdFX0lOUFVUXG4gICAgfSxcbiAgICBjb3B5UHVibGljRGlyOiB0cnVlXG4gIH0sXG4gIHNlcnZlcjoge1xuICAgIGhvc3Q6ICcwLjAuMC4wJyxcbiAgICBwb3J0OiA1MTczLFxuICAgIHN0cmljdFBvcnQ6IGZhbHNlLFxuICAgIHByb3h5OiB7XG4gICAgICAnL2FwaSc6IHtcbiAgICAgICAgdGFyZ2V0OiBwcm9jZXNzLmVudi5WSVRFX0FQSV9QUk9YWSA/PyAnaHR0cDovL2xvY2FsaG9zdDo0MjQyJyxcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlXG4gICAgICB9XG4gICAgfVxuICB9LFxuICBkZWZpbmU6IHtcbiAgICBfX0FQUF9FTlZfXzogSlNPTi5zdHJpbmdpZnkobW9kZSlcbiAgfSxcbiAgdGVzdDoge1xuICAgIGVudmlyb25tZW50OiAnbm9kZSdcbiAgfVxufSkpO1xuXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTZYLFNBQVMsb0JBQW9CO0FBQzFaLE9BQU8sWUFBWTtBQUVuQixJQUFNLG1CQUFtQjtBQUFBLEVBQ3ZCLE1BQU07QUFBQSxFQUNOLFFBQVE7QUFDVjtBQUVBLElBQU8sc0JBQVEsYUFBYSxDQUFDLEVBQUUsS0FBSyxPQUFPO0FBQUEsRUFDekMsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsU0FBUyxDQUFDLFlBQVksV0FBVztBQUFBLElBQ25DLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQSxXQUFXO0FBQUEsRUFDWCxPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixhQUFhO0FBQUEsSUFDYixlQUFlO0FBQUEsTUFDYixPQUFPO0FBQUEsSUFDVDtBQUFBLElBQ0EsZUFBZTtBQUFBLEVBQ2pCO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUEsTUFDTCxRQUFRO0FBQUEsUUFDTixRQUFRLFFBQVEsSUFBSSxrQkFBa0I7QUFBQSxRQUN0QyxjQUFjO0FBQUEsTUFDaEI7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sYUFBYSxLQUFLLFVBQVUsSUFBSTtBQUFBLEVBQ2xDO0FBQUEsRUFDQSxNQUFNO0FBQUEsSUFDSixhQUFhO0FBQUEsRUFDZjtBQUNGLEVBQUU7IiwKICAibmFtZXMiOiBbXQp9Cg==
