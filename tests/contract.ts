import path from "node:path";

/** Nombres de los participantes del contrato. */
export const CONSUMER = "ReservationService";
export const PROVIDER = "InventoryApi";

export const PACT_DIR = path.resolve(import.meta.dirname, "..", "pacts");
export const PACT_FILE = path.join(PACT_DIR, `${CONSUMER}-${PROVIDER}.json`);

/**
 * Estados del proveedor, con nombres del dominio de inventario.
 * El consumidor los declara con .given(...) y el proveedor los implementa
 * en sus stateHandlers. Deben coincidir exactamente.
 */
export const STATES = {
  IN_STOCK: "el producto tiene existencias disponibles",
  OUT_OF_STOCK: "el producto está agotado",
  UNKNOWN_SKU: "el SKU no existe en el catálogo",
} as const;
