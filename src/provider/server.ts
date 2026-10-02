import { createInventoryApp } from "./app";
import { InventoryRepository } from "./inventoryRepository";

// Punto de entrada para levantar la API manualmente: pnpm start:provider
const repository = new InventoryRepository();
repository.save({
  sku: "SKU-1001",
  name: "Saco de maíz blanco 45 kg",
  availableQuantity: 25,
  warehouse: "RET-01",
  updatedAt: new Date(),
});
repository.save({
  sku: "SKU-2002",
  name: "Fertilizante 20-20-0 quintal",
  availableQuantity: 0,
  warehouse: "RET-01",
  updatedAt: new Date(),
  expectedRestockDate: "2026-10-15",
});

const port = Number(process.env.PORT ?? 3000);
createInventoryApp(repository).listen(port, () => {
  console.log(`Inventory API escuchando en http://localhost:${port}`);
});
