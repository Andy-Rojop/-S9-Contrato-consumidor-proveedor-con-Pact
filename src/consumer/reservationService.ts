import type { InventoryClient } from "./inventoryClient";

export interface ReservationRequest {
  sku: string;
  quantity: number;
  customerId: string;
}

export type RejectionReason = "OUT_OF_STOCK" | "INSUFFICIENT_STOCK" | "SKU_NOT_FOUND";

export type ReservationDecision =
  | { accepted: true; sku: string; quantity: number; customerId: string }
  | { accepted: false; reason: RejectionReason; message: string };

/**
 * Lógica de negocio del consumidor: consulta el inventario ANTES de aceptar
 * una reservación y decide con base en la respuesta del proveedor.
 */
export class ReservationService {
  constructor(private readonly inventory: InventoryClient) {}

  async reserve(request: ReservationRequest): Promise<ReservationDecision> {
    const stock = await this.inventory.getStock(request.sku);

    switch (stock.kind) {
      case "not_found":
        return {
          accepted: false,
          reason: "SKU_NOT_FOUND",
          message: `El producto ${request.sku} no existe en el catálogo`,
        };

      case "out_of_stock":
        return {
          accepted: false,
          reason: "OUT_OF_STOCK",
          message: stock.item.expectedRestockDate
            ? `Producto agotado; reabastecimiento estimado ${stock.item.expectedRestockDate}`
            : "Producto agotado",
        };

      case "available":
        if (stock.item.availableQuantity < request.quantity) {
          return {
            accepted: false,
            reason: "INSUFFICIENT_STOCK",
            message: `Solo hay ${stock.item.availableQuantity} unidades disponibles`,
          };
        }
        return {
          accepted: true,
          sku: request.sku,
          quantity: request.quantity,
          customerId: request.customerId,
        };
    }
  }
}
