import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync } from "node:fs";
import { Verifier } from "@pact-foundation/pact";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createInventoryApp } from "../../src/provider/app";
import { InventoryRepository } from "../../src/provider/inventoryRepository";
import { PACT_FILE, PROVIDER, STATES } from "../contract";

/**
 * Verificación del PROVEEDOR REAL: se levanta la API de inventario de verdad
 * (Express + repositorio) y Pact reproduce contra ella cada interacción del
 * contrato generado por el consumidor. Aquí no hay mocks.
 */

// Fecha fija: los estados no dependen del reloj, así cada corrida es idéntica.
const FIXED_UPDATED_AT = new Date("2026-09-01T10:00:00.000Z");

const repository = new InventoryRepository();
let server: Server;
let baseUrl: string;

function paramsOf(parameters: unknown): Record<string, unknown> {
  return (parameters ?? {}) as Record<string, unknown>;
}

describe(`Verificación del proveedor ${PROVIDER}`, () => {
  beforeAll(async () => {
    // Puerto 0 = el sistema operativo asigna uno libre (sin choques en CI).
    server = createInventoryApp(repository).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("satisface todas las interacciones del contrato de ReservationService", async () => {
    // PACT_URL permite verificar un contrato descargado (p. ej. artefacto de CI).
    const pactUrl = process.env.PACT_URL ?? PACT_FILE;
    expect(existsSync(pactUrl), `No se encontró el contrato en ${pactUrl}. Corré primero pnpm test:consumer`).toBe(true);

    await new Verifier({
      provider: PROVIDER,
      providerBaseUrl: baseUrl,
      pactUrls: [pactUrl],
      providerVersion: process.env.GIT_SHA ?? "local",
      providerVersionBranch: process.env.GIT_BRANCH ?? "local",
      publishVerificationResult: false, // sin Pact Broker
      logLevel: "warn",
      stateHandlers: {
        // Cada estado limpia el repositorio y siembra EXACTAMENTE lo que
        // necesita la interacción: nada queda de interacciones anteriores.
        [STATES.IN_STOCK]: async (parameters) => {
          const { sku = "SKU-1001", availableQuantity = 25 } = paramsOf(parameters);
          repository.reset();
          repository.save({
            sku: String(sku),
            name: "Saco de maíz blanco 45 kg",
            availableQuantity: Number(availableQuantity),
            warehouse: "RET-01",
            updatedAt: FIXED_UPDATED_AT,
          });
        },

        [STATES.OUT_OF_STOCK]: async (parameters) => {
          const { sku = "SKU-2002" } = paramsOf(parameters);
          repository.reset();
          repository.save({
            sku: String(sku),
            name: "Fertilizante 20-20-0 quintal",
            availableQuantity: 0,
            warehouse: "RET-01",
            updatedAt: FIXED_UPDATED_AT,
            expectedRestockDate: "2026-10-15",
          });
        },

        [STATES.UNKNOWN_SKU]: async () => {
          // Catálogo vacío: garantiza que el SKU consultado no exista.
          repository.reset();
        },
      },
    }).verifyProvider();
  });
});
