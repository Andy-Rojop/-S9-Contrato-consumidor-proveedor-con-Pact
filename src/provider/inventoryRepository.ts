/**
 * Almacén en memoria del inventario. Es la "base de datos" del proveedor.
 * Se expone reset()/save() para que los estados del proveedor (Pact) puedan
 * dejarlo en una situación conocida y determinista antes de cada interacción.
 */
export interface InventoryRecord {
  sku: string;
  name: string;
  availableQuantity: number;
  warehouse: string;
  updatedAt: Date;
  /** Fecha estimada de reabastecimiento (solo aplica si no hay existencias). */
  expectedRestockDate?: string;
}

export class InventoryRepository {
  private readonly items = new Map<string, InventoryRecord>();

  findBySku(sku: string): InventoryRecord | undefined {
    return this.items.get(sku);
  }

  save(record: InventoryRecord): void {
    this.items.set(record.sku, { ...record });
  }

  reset(): void {
    this.items.clear();
  }
}
