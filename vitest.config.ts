import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    // Pact levanta servidores reales (mock y proveedor): evitamos paralelismo
    // entre archivos para que no compitan por el mismo archivo de contrato.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
