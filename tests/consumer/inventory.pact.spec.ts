import { rmSync } from "node:fs";
import { MatchersV3, PactV3 } from "@pact-foundation/pact";
import { beforeAll, describe, expect, it } from "vitest";
import { InventoryClient } from "../../src/consumer/inventoryClient";
import { ReservationService } from "../../src/consumer/reservationService";
import { CONSUMER, PACT_DIR, PACT_FILE, PROVIDER, STATES } from "../contract";

const { like, integer, string, regex, iso8601Date, iso8601DateTimeWithMillis } = MatchersV3;

// ---- Matchers reutilizables -------------------------------------------------
// Formato de SKU del dominio: "SKU-" seguido de 4 dígitos.
const SKU_REGEX = "^SKU-\\d{4}$";
const sku = (example: string) => regex(SKU_REGEX, example);
// Ruta con SKU variable: cualquier /inventory/SKU-XXXX cumple el contrato.
const inventoryPath = (example: string) => regex("^/inventory/SKU-\\d{4}$", `/inventory/${example}`);
// Express responde "application/json; charset=utf-8". Pact exige que la regex
// cubra el valor COMPLETO del header, por eso el charset va como opcional.
const JSON_HEADERS = {
  "Content-Type": regex("^application/json(;\\s?charset=utf-8)?$", "application/json; charset=utf-8"),
};

const provider = new PactV3({
  consumer: CONSUMER,
  provider: PROVIDER,
  dir: PACT_DIR,
  host: "127.0.0.1",
  logLevel: "warn",
});

describe("Contrato ReservationService → InventoryApi", () => {
  beforeAll(() => {
    // Partimos de un contrato limpio: si una interacción desaparece del
    // consumidor, también debe desaparecer del archivo generado.
    rmSync(PACT_FILE, { force: true });
  });

  it("acepta la reservación cuando el producto tiene existencias", async () => {
    provider
      .given(STATES.IN_STOCK, { sku: "SKU-1001", availableQuantity: 25 })
      .uponReceiving("una consulta de inventario de un producto disponible")
      .withRequest({
        method: "GET",
        path: inventoryPath("SKU-1001"),
        headers: { Accept: "application/json" },
      })
      .willRespondWith({
        status: 200,
        headers: JSON_HEADERS,
        body: {
          sku: sku("SKU-1001"),
          name: string("Saco de maíz blanco 45 kg"),
          availableQuantity: integer(25),
          status: "IN_STOCK", // valor literal: es el discriminante que usa el consumidor
          warehouse: like("RET-01"),
          updatedAt: iso8601DateTimeWithMillis("2026-09-01T10:00:00.000Z"),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const client = new InventoryClient(mockServer.url);
      const service = new ReservationService(client);

      const decision = await service.reserve({ sku: "SKU-1001", quantity: 3, customerId: "CLI-77" });

      expect(decision).toEqual({ accepted: true, sku: "SKU-1001", quantity: 3, customerId: "CLI-77" });
    });
  });

  it("rechaza la reservación cuando el producto está agotado", async () => {
    provider
      .given(STATES.OUT_OF_STOCK, { sku: "SKU-2002" })
      .uponReceiving("una consulta de inventario de un producto agotado")
      .withRequest({
        method: "GET",
        path: inventoryPath("SKU-2002"),
        headers: { Accept: "application/json" },
      })
      .willRespondWith({
        status: 200,
        headers: JSON_HEADERS,
        body: {
          sku: sku("SKU-2002"),
          name: string("Fertilizante 20-20-0 quintal"),
          availableQuantity: 0, // literal: "agotado" significa exactamente cero
          status: "OUT_OF_STOCK",
          warehouse: like("RET-01"),
          updatedAt: iso8601DateTimeWithMillis("2026-09-01T10:00:00.000Z"),
          expectedRestockDate: iso8601Date("2026-10-15"),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const client = new InventoryClient(mockServer.url);

      // Primero el cliente: debe interpretar correctamente el cuerpo...
      const lookup = await client.getStock("SKU-2002");
      expect(lookup.kind).toBe("out_of_stock");

      // ...y la decisión de negocio que se deriva de esa interpretación.
      const decision = await new ReservationService(client).reserve({
        sku: "SKU-2002",
        quantity: 1,
        customerId: "CLI-77",
      });
      expect(decision).toMatchObject({ accepted: false, reason: "OUT_OF_STOCK" });
      if (!decision.accepted) expect(decision.message).toContain("2026-10-15");
    });
  });

  it("rechaza la reservación cuando el SKU no existe", async () => {
    provider
      .given(STATES.UNKNOWN_SKU, { sku: "SKU-9999" })
      .uponReceiving("una consulta de inventario de un SKU inexistente")
      .withRequest({
        method: "GET",
        path: inventoryPath("SKU-9999"),
        headers: { Accept: "application/json" },
      })
      .willRespondWith({
        status: 404,
        headers: JSON_HEADERS,
        body: {
          error: "SKU_NOT_FOUND",
          message: string("No existe un producto con SKU SKU-9999"),
          sku: sku("SKU-9999"),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const service = new ReservationService(new InventoryClient(mockServer.url));

      const decision = await service.reserve({ sku: "SKU-9999", quantity: 1, customerId: "CLI-77" });

      expect(decision).toMatchObject({ accepted: false, reason: "SKU_NOT_FOUND" });
    });
  });
});
