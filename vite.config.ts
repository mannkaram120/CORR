import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      // FRED: /fred-api?series_id=X → https://api.stlouisfed.org/fred/series/observations?series_id=X
      '/fred-api': {
        target: 'https://api.stlouisfed.org',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/fred-api/, '/fred/series/observations'),
      },
      // Twelve Data: /td-api/time_series → https://api.twelvedata.com/time_series
      '/td-api': {
        target: 'https://api.twelvedata.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/td-api/, ''),
      },
      // Yahoo Finance: /yf-api/EURUSD=X → https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X
      '/yf-api': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/yf-api/, '/v8/finance/chart'),
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
