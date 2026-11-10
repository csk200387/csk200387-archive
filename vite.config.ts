import { defineConfig } from "vite";

export default defineConfig({
  base: "/csk200387-archive/",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/three/src/renderers") ||
            id.includes("three/build/three.module")
          )
            return "three-renderer";
          if (id.includes("three/build/three.core")) return "three-core";
        },
      },
    },
  },
});
