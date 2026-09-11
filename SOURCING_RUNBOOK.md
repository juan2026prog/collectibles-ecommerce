# SOURCING INTELLIGENCE — OPERATIONAL RUNBOOK (FASE 7)

## 1. Verificación del Sistema (Healthcheck)
Para verificar la salud operacional del ecosistema de Sourcing:
1. Acceder a Backoffice Admin: `/admin/sourcing`
2. Ir a la pestaña **Estado de Conexiones & Servicios**.
3. Hacer clic en **Verificar Conexiones**.
4. Confirmar que los 10 componentes del ecosistema muestren estado `OPERATIVE`.
   - Database (Supabase PostgreSQL)
   - Catalog Center
   - Sourcing Intelligence Core
   - Import Engine & Landed Cost UY
   - Collectibles Radar
   - AI Search (Natural Language Interpreter)
   - Collector DNA / Personalization Engine
   - Zinc Purchasing Adapter
   - Closed-Loop Learning Engine

---

## 2. Refresco Forzado de Ofertas y Mercado
1. En `/admin/sourcing`, hacer clic en **Refrescar Ofertas**.
2. Para reevaluar gaps del catálogo contra tendencias de usuario, ir a la pestaña **Adaptive Sourcing** y hacer clic en **Procesar Gaps Qualified**.

---

## 3. Investigación de Oportunidades y Ficha de Producto
1. Ir a `/admin/sourcing` -> Pestaña **Oportunidades** o **Grid de Productos**.
2. Hacer clic sobre cualquier producto o presionar **Ver Análisis**.
3. Inspeccionar:
   - Ofertas de Retailers (Amazon, eBay, Best Buy)
   - "Nuevo Desde" / "Usado Desde"
   - Landed Cost Puesto Uruguay & Desglose (Flete + Aduanas + Fees)
   - Comparación Mercado Libre UY (Market Gap Score)
   - Scoring Explicable (Demand, Trust, Margin, Stock)
   - Autenticidad Gate (Verified Official / Evidence)

---

## 4. Pausar / Modificar Autopilot (Kill Switch)
1. En `/admin/sourcing`, hacer clic en **Autopilot**.
2. Para pausar inmediatamente todas las acciones automáticas de publicación y actualización:
   - Activar el **Kill Switch de Autopilot**.
   - El estado visual cambiará a `PAUSED_SAFETY`. Ninguna publicación automática se ejecutará.
3. Para ajustar parámetros:
   - Modificar `Margen Mínimo (%)`, `Score Mínimo (0-100)`, o `Reputación de Vendedor`.
   - Guardar Regla de Autopilot.

---

## 5. Gestión de Retailers y Proveedores
Si un retailer (ej. eBay o Amazon) presenta alta volatilidad o errores de scraping:
1. Ir a `/admin/sourcing` -> **Estado de Conexiones**.
2. Seleccionar el adaptador de retailer correspondiente.
3. Cambiar estado a `DEGRADED` o `DISABLED`.
4. El Sourcing Orchestrator conmutará automáticamente al proveedor secundario disponible para ese producto.

---

## 6. Verificación de Compras y Adapter de Zinc
1. Ir a `/admin/zinc` (o `/admin/sourcing` -> Zinc Status).
2. Verificar el modo activo:
   - `PURCHASE_SANDBOX`: Activo para pruebas seguras de compra sin cobro real en origen.
   - `PRODUCTION_LIVE`: Solo activo previa autorización explícita.
3. Ante un error de compra por cambio de precio fuera de tolerancia (Price Slippage > 5%):
   - El sistema detiene la compra automáticamente y envía el pedido a la cola de revisión manual en `/admin/orders`.
