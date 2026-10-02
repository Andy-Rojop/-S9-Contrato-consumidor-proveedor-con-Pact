# Reto Pact: Reservaciones ↔ Inventario

Dos aplicaciones pequeñas en TypeScript y un contrato Pact que demuestra que la
**API de inventario (proveedor)** satisface las expectativas reales del
**servicio de reservaciones (consumidor)**.

## Arquitectura

```
┌──────────────────────────────┐          GET /inventory/:sku         ┌──────────────────────────────┐
│  ReservationService          │ ───────────────────────────────────▶ │  InventoryApi                │
│  (consumidor)                │                                       │  (proveedor)                 │
│                              │ ◀─────────────────────────────────── │                              │
│  ReservationService.reserve  │   200 IN_STOCK / 200 OUT_OF_STOCK /   │  Express 5 + repositorio     │
│  └─ InventoryClient (fetch)  │   404 SKU_NOT_FOUND                   │  en memoria                  │
└──────────────────────────────┘                                       └──────────────────────────────┘
              │                                                                       ▲
              │ genera                                                                │ verifica
              ▼                                                                       │
      pacts/ReservationService-InventoryApi.json ─────────────────────────────────────┘
```

**Frontera entre aplicaciones:** `src/consumer` y `src/provider` no se importan
entre sí. El consumidor define sus propios tipos (`StockItem`, `StockLookup`) y
el proveedor los suyos (`InventoryResponse`). Lo único que comparten es el
archivo de contrato en `pacts/`.

- El **consumidor** consulta el inventario antes de aceptar una reservación:
  acepta si hay existencias suficientes, rechaza con `OUT_OF_STOCK`,
  `INSUFFICIENT_STOCK` o `SKU_NOT_FOUND` en caso contrario.
- El **proveedor** expone `GET /inventory/:sku`.

### Contrato de `GET /inventory/:sku`

| Caso | Código | Cuerpo |
|---|---|---|
| Producto disponible | `200` | `{ sku, name, availableQuantity > 0, status: "IN_STOCK", warehouse, updatedAt }` |
| Producto agotado | `200` | `{ sku, name, availableQuantity: 0, status: "OUT_OF_STOCK", warehouse, updatedAt, expectedRestockDate }` |
| SKU inexistente | `404` | `{ error: "SKU_NOT_FOUND", message, sku }` |

El producto agotado responde `200` porque el recurso **sí existe**; lo que
cambia es su estado. El `404` se reserva para un SKU que no está en el catálogo.

## Estructura

```
src/
  consumer/inventoryClient.ts      Cliente HTTP real (fetch) que interpreta la respuesta
  consumer/reservationService.ts   Lógica de reservación que usa el cliente
  provider/inventoryRepository.ts  Almacén en memoria del inventario
  provider/app.ts                  API Express: GET /inventory/:sku
  provider/server.ts               Arranque manual de la API
tests/
  contract.ts                      Nombres de participantes, ruta del pact y estados
  consumer/inventory.pact.spec.ts  Interacciones con PactV3 + MatchersV3
  provider/inventory.verify.spec.ts Verificación contra la API real con stateHandlers
pacts/
  ReservationService-InventoryApi.json   Contrato generado (versionado)
.github/workflows/contract-tests.yml     CI: consumidor → artefacto → proveedor
```

## Comandos

```bash
pnpm install              # instalar dependencias
pnpm test:consumer        # corre el cliente real contra el mock de Pact y genera pacts/*.json
pnpm test:provider        # levanta la API real y verifica el contrato
pnpm test                 # ambos, en orden
pnpm typecheck            # tsc --noEmit
pnpm start:provider       # levanta la API en http://localhost:3000 (curl .../inventory/SKU-1001)
```

`pnpm test:provider` usa `pacts/ReservationService-InventoryApi.json` por
defecto; con la variable `PACT_URL` se puede verificar otro archivo (así lo hace
el CI con el contrato recién generado).

## Matchers utilizados (MatchersV3)

El contrato no queda amarrado a un único ejemplo literal:

- `regex("^/inventory/SKU-\d{4}$")` en la **ruta**: cualquier SKU con el formato válido.
- `regex("^SKU-\d{4}$")` para el `sku` del cuerpo.
- `integer(25)` para `availableQuantity` en el caso disponible.
- `string(...)` / `like(...)` para `name`, `message` y `warehouse` (solo importa el tipo).
- `iso8601DateTimeWithMillis` para `updatedAt` e `iso8601Date` para `expectedRestockDate`.
- `regex` para `Content-Type`, aceptando `application/json` con o sin charset.

Se dejan **literales a propósito** los valores de los que depende la lógica del
consumidor: `status` (`IN_STOCK` / `OUT_OF_STOCK`), `error: "SKU_NOT_FOUND"` y
`availableQuantity: 0` en el caso agotado.

## Estados del proveedor

Los nombres están en `tests/contract.ts` y se implementan como `stateHandlers`
en la verificación. Cada uno **vacía el repositorio y siembra exactamente lo que
necesita**, con fecha fija (`2026-09-01T10:00:00.000Z`), así el resultado no
depende del orden de ejecución ni del reloj.

| Estado | Parámetros | Qué prepara |
|---|---|---|
| `el producto tiene existencias disponibles` | `{ sku: "SKU-1001", availableQuantity: 25 }` | Un producto con 25 unidades en bodega `RET-01`. |
| `el producto está agotado` | `{ sku: "SKU-2002" }` | Un producto con 0 unidades y reabastecimiento estimado `2026-10-15`. |
| `el SKU no existe en el catálogo` | `{ sku: "SKU-9999" }` | Catálogo vacío: garantiza que el SKU consultado no exista. |

## CI (GitHub Actions)

`contract-tests.yml` tiene dos jobs:

1. **consumer**: typecheck, pruebas Pact del consumidor, comprueba que el pact
   versionado en `pacts/` esté al día (`git diff --exit-code`) y lo sube como artefacto.
2. **provider** (`needs: consumer`): descarga ese artefacto y verifica la API
   real contra él. No se usa Pact Broker.

## Versiones

| Herramienta | Versión |
|---|---|
| Node.js | 24 en CI (probado también con 22) |
| pnpm | 10.33.0 |
| TypeScript | 7.0.2 |
| Vitest | 5.0.0 |
| @pact-foundation/pact | 17.1.4 (pact-core 20.2.0) |
| Especificación Pact | V3 (`PactV3` / `MatchersV3`) |
| Express | 5.2.1 |

## Notas

- Durante `test:consumer` puede aparecer el aviso `Existing pact is an older
  specification version (V3), and will be upgraded`. Es interno de pact-core al
  fusionar interacciones en el mismo archivo; el archivo final sigue siendo V3.
- Para comprobar que la verificación sirve de algo, cambiá `res.status(404)` por
  `res.status(200)` en `src/provider/app.ts` y corré `pnpm test:provider`:
  falla con `expected 404 but was 200`.
