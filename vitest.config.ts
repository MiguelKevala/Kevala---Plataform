import path from "node:path";
import "dotenv/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // El servidor local `prisma dev` no tolera con fiabilidad conexiones
    // concurrentes desde múltiples workers de test (corrompe el prepared
    // statement sin nombre entre inserts con distinta forma). Se serializan
    // los archivos de test para evitarlo; no afecta a producción.
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
