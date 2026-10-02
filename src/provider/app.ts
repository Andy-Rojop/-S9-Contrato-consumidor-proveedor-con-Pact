import express, { type Express } from "express";
import type { InventoryRecord, InventoryRepository } from "./inventoryRepository";

export type StockStatus = "IN_STOCK" | "OUT_OF_STOCK";

/** Cuerpo de respuesta 200 de GET /inventory/:sku */
export interface InventoryResponse {
  sku: string;
  name: string;
  availableQuantity: number;
  status: StockStatus;
  warehouse: string;
  updatedAt: string;
  expectedRestockDate?: string;
}

/** Cuerpo de respuesta 404 de GET /inventory/:sku */
export interface NotFoundResponse {
  error: "SKU_NOT_FOUND";
  message: string;
  sku: string;
}

function toResponse(record: InventoryRecord): InventoryResponse {
  const inStock = record.availableQuantity > 0;
  const body: InventoryResponse = {
    sku: record.sku,
    name: record.name,
    availableQuantity: record.availableQuantity,
    status: inStock ? "IN_STOCK" : "OUT_OF_STOCK",
    warehouse: record.warehouse,
    updatedAt: record.updatedAt.toISOString(),
  };
  if (!inStock && record.expectedRestockDate) {
    body.expectedRestockDate = record.expectedRestockDate;
  }
  return body;
}

/**
 * Construye la API de inventario. Recibe el repositorio por parámetro
 * (inyección de dependencias) para poder controlarlo desde las pruebas.
 */
export function createInventoryApp(repository: InventoryRepository): Express {
  const app = express();

  app.get("/inventory/:sku", (req, res) => {
    const { sku } = req.params;
    const record = repository.findBySku(sku);

    if (!record) {
      const body: NotFoundResponse = {
        error: "SKU_NOT_FOUND",
        message: `No existe un producto con SKU ${sku}`,
        sku,
      };
      res.status(404).json(body);
      return;
    }

    // Un producto agotado SÍ existe: el recurso se encontró (200) y el
    // cuerpo indica que no hay existencias.
    res.status(200).json(toResponse(record));
  });

  return app;
}
