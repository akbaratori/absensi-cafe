import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Conditionally load basicSsl only in development
const plugins = [react()];

// https://vitejs.dev/config/
export default defineConfig({
  plugins,
  esbuild: {
    drop: ["console", "debugger"], // Remove console.logs and debugger in production
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Enable source maps for production debugging (optional)
    sourcemap: false,

    // Minify bundle
    minify: "esbuild",

    // Optimize chunk splitting
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate TensorFlow into its own chunk (lazy loaded)
          "tensorflow": ["@tensorflow/tfjs", "@tensorflow-models/blazeface"],

          // Separate React ecosystem
          "react-vendor": ["react", "react-dom", "react-router-dom"],

          // Separate UI libraries
          "ui-vendor": ["lucide-react", "recharts", "react-webcam"],

          // Separate form & utilities
          "utils-vendor": ["axios", "date-fns", "react-hook-form", "react-hot-toast"],
        },
        // Optimize chunk file naming
        chunkFileNames: "assets/js/[name]-[hash].js",
        entryFileNames: "assets/js/[name]-[hash].js",
        assetFileNames: "assets/[ext]/[name]-[hash].[ext]",
      },
    },

    // Chunk size warnings
    chunkSizeWarningLimit: 1000,
  },

  // Optimize dependencies pre-bundling
  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom", "axios", "date-fns"],
  },

  server: {
    host: true, // Enable external access
    port: 3101,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3100",
        changeOrigin: true,
        secure: false,
      },
      "/uploads": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
