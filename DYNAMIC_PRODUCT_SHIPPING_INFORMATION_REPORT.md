# REPORTE DE IMPLEMENTACIÓN: BLOQUE DINÁMICO DE ENVÍOS Y RETIROS POR PRODUCTO Y POR VENDEDOR

**Fecha:** 2 de agosto de 2026  
**Proyecto:** Collectibles.uy (collectibles-ecommerce)  
**Ambiente:** Producción (`collectibles.uy`)

---

## 1. FUENTE Y AUDITORÍA DEL TEXTO ANTIGUO DE MERCADO LIBRE

Se realizó una auditoría exhaustiva en la base de datos Supabase y en la base de código del proyecto para identificar la procedencia exacta de menciones como *Mercado Envíos*, *Retira en domicilio del vendedor*, *Cadetería personalizada* y *Políticas de Mercado Libre*.

### Hallazgos de Auditoría:
1. **Base de Datos (Tabla `products`)**:
   - Múltiples productos importados históricamente desde la API de Mercado Libre almacenaban en la columna `description` bloques de texto fijos como:
     ```text
     ENVIOS:
     MERCADOENVIOS:
     Antes de comprar, debe verificar cuál es la fecha prevista de la entrega y el costo por concepto del envío. Usted podrá hacer el seguimiento del envío desde su compra. El tiempo de demora en la entrega es responsabilidad de la empresa asignada por Mercadoenvios. Las políticas de mercado libre no permiten modificar o cambiar datos del comprador, después que dé comprar.
     CADETERIA PERSONALIZADA:
     Para utilizar éste servicio, cuando dé comprar, debe elegir RETIRA EN DOMICILIO DEL VENDEDOR, así coordinamos nosotros el envío.
     ```
2. **Componentes Frontend**:
   - En `ProductDetail.tsx` no existía sanitización de descripciones importadas ni un bloque dinámico contextual por vendedor.
   - En la ficha pública se mostraban textos fijos genéricos de entrega.

---

## 2. SANITIZACIÓN Y TEXTOS ELIMINADOS DEL STOREFRONT

Se creó una utilidad de sanitización transparente ([descriptionSanitizer.ts](file:///C:/Projects/Collectibles2026/frontend/src/lib/descriptionSanitizer.ts)) que elimina los bloques heredados sin alterar la descripción real ni corromper el registro histórico en la base de datos.

### Textos Filtados y Eliminados:
- `MERCADOENVIOS` / `Mercado Envíos` / `Mercadoenvios`
- `RETIRA EN DOMICILIO DEL VENDEDOR`
- `CADETERIA PERSONALIZADA`
- `Las políticas de mercado libre no permiten modificar...`
- `Usted podrá hacer el seguimiento del envío desde su compra.`
- `El tiempo de demora en la entrega es responsabilidad de la empresa asignada por Mercadoenvios.`

La descripción original permanece preservada en la base de datos, mientras que en el storefront tanto la vista desktop como la vista mobile renderizan la descripción sanitizada limpia.

---

## 3. ARCHIVOS MODIFICADOS Y CREADOS

1. **[descriptionSanitizer.ts](file:///C:/Projects/Collectibles2026/frontend/src/lib/descriptionSanitizer.ts)** `[NUEVO]`
   - Sanitizador puro de descripciones de productos.
2. **[dispatchCalculator.ts](file:///C:/Projects/Collectibles2026/frontend/src/lib/dispatchCalculator.ts)** `[NUEVO]`
   - Algoritmo de próximo despacho basado en la zona horaria `America/Montevideo`.
3. **[ProductShippingBlock.tsx](file:///C:/Projects/Collectibles2026/frontend/src/components/ProductShippingBlock.tsx)** `[NUEVO]`
   - Componente dinámico UI que construye la sección `ENVÍOS Y RETIRO` con couriers activos, retiros y banner dinámico.
4. **[useData.ts](file:///C:/Projects/Collectibles2026/frontend/src/hooks/useData.ts)** `[MODIFICADO]`
   - Incorporación de `shipping_settings` en la consulta `useProduct` para alimentar automáticamente las configuraciones logísticas del vendedor.
5. **[ProductDetail.tsx](file:///C:/Projects/Collectibles2026/frontend/src/pages/ProductDetail.tsx)** `[MODIFICADO]`
   - Integración de `ProductShippingBlock` y sanitización de descripciones en pestañas desktop y acordeón mobile.
6. **[VShipping.tsx](file:///C:/Projects/Collectibles2026/frontend/src/components/vendor/VShipping.tsx)** `[MODIFICADO]`
   - Incorporación del campo `preparation_days` (días de preparación) en el panel de control del vendedor.

---

## 4. MODELO DE CONFIGURACIÓN DE LOGÍSTICA

Cada vendedor (o Collectibles) almacena su configuración en `vendors.shipping_settings` (`jsonb`):

```json
{
  "dac": { "active": true },
  "ues": { "active": false },
  "soydelivery": { "active": false },
  "correo_uruguayo": { "active": false },
  "manual": { "active": false, "method_name": "Cadetería propia" },
  "pickup": { 
    "active": true, 
    "address": "Maldonado 1422, Montevideo", 
    "hours": "Lun a Vie 10:00 a 19:00" 
  },
  "cutoff_time": "15:00",
  "dispatch_days": ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"],
  "preparation_days": 0,
  "holidays": []
}
```

---

## 5. ALGORITMO DE CÁLCULO DE PRÓXIMO DESPACHO (`America/Montevideo`)

La función `getNextDispatchDate` realiza la normalización horaria:
1. Extrae año, mes, día, hora, minuto y día de la semana en la zona horaria `America/Montevideo` mediante `Intl.DateTimeFormat`.
2. Compara la hora actual con el `cutoff_time` del vendedor (ej. `15:00`).
3. Si la compra es en un día de despacho dentro del cutoff y sin días de preparación extra, marca `can_dispatch_today = true`.
4. Si la compra supera el cutoff, es fin de semana, feriado o requiere días de preparación, itera hacia adelante en el calendario hasta encontrar el siguiente día hábil de despacho.
5. Retorna la fecha exacta, etiqueta comercial y mensaje formateado.

---

## 6. EJEMPLOS PRÁCTICOS DE COMPORTAMIENTO

### Ejemplo 1: Collectibles.uy (Plataforma)
**ENVÍOS Y RETIRO**
- *Vendido y enviado por Collectibles.uy*
- Retiro en tienda disponible (Maldonado 1422, Montevideo).
- DAC a todo Uruguay.
- UES.
- SoyDelivery en las zonas disponibles.
- *El costo y plazo se calculan al ingresar tu dirección.*

### Ejemplo 2: JorgiToys — Viernes Antes del Cutoff (Viernes 11:00 AM, Cutoff 15:00)
**ENVÍOS Y RETIRO**
- *Vendido y enviado por JorgiToys*
- **Próximo Despacho: hoy**
- *"Comprando antes de las 15:00, JorgiToys despacha hoy por DAC."*
- Envíos por DAC.

### Ejemplo 3: JorgiToys — Viernes Después del Cutoff (Viernes 16:00 PM, Cutoff 15:00)
**ENVÍOS Y RETIRO**
- *Vendido y enviado por JorgiToys*
- **Próximo Despacho: el lunes**
- *"Las compras realizadas después de las 15:00 del viernes se despachan el lunes por DAC."*
- Envíos por DAC.

### Ejemplo 4: JorgiToys — Fin de semana (Sábado / Domingo)
**ENVÍOS Y RETIRO**
- *Vendido y enviado por JorgiToys*
- **Próximo Despacho: el lunes**
- *"JorgiToys despacha este pedido el lunes por DAC."*
- Envíos por DAC.

### Ejemplo 5: Vendor con UES / SoyDelivery / Retiro
**ENVÍOS Y RETIRO**
- *Vendido y enviado por Vendor X*
- Retiro en tienda disponible.
- UES (Entrega rápida a domicilio).
- SoyDelivery (Envíos Flex / Express).

---

## 7. QA Y VALIDACIÓN COMPILADA

| ID | Escenario QA | Resultado |
|:---|:---|:---:|
| 1 | Collectibles con retiro habilitado | PASS |
| 2 | Collectibles con DAC | PASS |
| 3 | JorgiToys antes del cutoff del viernes (11:00 AM -> Despacha hoy) | PASS |
| 4 | JorgiToys después del cutoff del viernes (16:00 PM -> Despacha el lunes) | PASS |
| 5 | JorgiToys el Sábado (Despacha el lunes) | PASS |
| 6 | JorgiToys el Domingo (Despacha el lunes) | PASS |
| 7 | JorgiToys el Lunes antes del cutoff (Despacha hoy) | PASS |
| 8 | Vendor con UES activo | PASS |
| 9 | Vendor con SoyDelivery activo | PASS |
| 10 | Vendor con retiro activo | PASS |
| 11 | Vendor sin métodos de envío activos | PASS |
| 12 | Producto en Preventa (Muestra aviso sin "Despacho hoy") | PASS |
| 13 | Producto con preparación especial | PASS |
| 14 | Producto Internacional | PASS |
| 15 | Cambio de timezone en el navegador del cliente (Montevideo prevalece) | PASS |
| 16 | Sanitización total de "Mercado Envíos" y "Cadetería personalizada" | PASS |
| 17 | Visualización Responsive (Desktop & Mobile) | PASS |

---

## 8. DEPLOY A PRODUCCIÓN

- Compilación ejecutable verificada mediante `npm run build` con 0 errores TypeScript/Rollup.
- Los cambios fueron desplegados a la plataforma en `collectibles.uy`.
