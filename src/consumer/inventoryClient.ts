/**
 * Cliente HTTP REAL del servicio de reservaciones hacia la API de inventario.
 * Usa fetch nativo de Node (>= 22). Traduce las respuestas HTTP del proveedor
 * a un resultado del dominio del consumidor.
 *
 * Importante: el consumidor define SUS propios tipos; no importa nada del
 * proveedor. La única frontera compartida entre ambas apps es el contrato Pact.
 */

export interface StockItem {
  sku: string;
  name: string;
  availableQuantity: number;
  warehouse: string;
  updatedAt: Date;
  expectedRestockDate?: string;
}

export type StockLookup =
  | { kind: "available"; item: StockItem }
  | { kind: "out_of_stock"; item: StockItem }
  | { kind: "not_found"; sku: string };

export class InventoryServiceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "InventoryServiceError";
  }
}

interface RawInventoryBody {
  sku: string;
  name: string;
  availableQuantity: number;
  status: string;
  warehouse: string;
  updatedAt: string;
  expectedRestockDate?: string;
}

export class InventoryClient {
  constructor(private readonly baseUrl: string) {}

  async getStock(sku: string): Promise<StockLookup> {
    const url = `${this.baseUrl}/inventory/${encodeURIComponent(sku)}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });

    if (response.status === 404) {
      return { kind: "not_found", sku };
    }

    if (response.status !== 200) {
      throw new InventoryServiceError(
        `Respuesta inesperada del inventario: HTTP ${response.status}`,
        response.status,
      );
    }

    const body = (await response.json()) as RawInventoryBody;
    const item: StockItem = {
      sku: body.sku,
      name: body.name,
      availableQuantity: body.availableQuantity,
      warehouse: body.warehouse,
      updatedAt: new Date(body.updatedAt),
      ...(body.expectedRestockDate ? { expectedRestockDate: body.expectedRestockDate } : {}),
    };

    switch (body.status) {
      case "IN_STOCK":
        return { kind: "available", item };
      case "OUT_OF_STOCK":
        return { kind: "out_of_stock", item };
      default:
        throw new InventoryServiceError(`Estado de inventario desconocido: ${body.status}`);
    }
  }
}
