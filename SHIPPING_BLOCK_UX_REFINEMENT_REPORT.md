# REPORTE DE REFINAMIENTO UX — BLOQUE DINÁMICO DE ENVÍOS (FASE 2)

**Fecha:** 2 de agosto de 2026  
**Proyecto:** Collectibles.uy (collectibles-ecommerce)  
**Ambiente:** Producción (`collectibles.uy`)

---

## 1. ARCHIVOS MODIFICADOS Y CREADOS

1. **[dispatchCalculator.ts](file:///C:/Projects/Collectibles2026/frontend/src/lib/dispatchCalculator.ts)** `[MODIFICADO]`
   - Incorporación del cálculo dinámico del tiempo restante hacia el horario de corte (cutoff time): `hours_remaining_to_cutoff`, `minutes_remaining_to_cutoff` y `time_remaining_str` (ej. `"2 h 15 min"`).
   - Formateo comercial del mensaje de corte: *"Comprando en las próximas 2 h 15 min, JorgiToys despacha hoy por DAC."*
2. **[ProductShippingBlock.tsx](file:///C:/Projects/Collectibles2026/frontend/src/components/ProductShippingBlock.tsx)** `[MODIFICADO]`
   - Rediseño completo de la experiencia de usuario (UX) para el bloque `ENVÍOS Y RETIRO`.
   - Incorporación de semáforo visual, header unificado de escaneo (5s), clarificación legal permanente despacho vs entrega, bloque exclusivo de Amazon USA, promociones de envío gratis, productos voluminosos y texto de confianza al pie.
3. **[SHIPPING_BLOCK_UX_REFINEMENT_REPORT.md](file:///C:/Projects/Collectibles2026/SHIPPING_BLOCK_UX_REFINEMENT_REPORT.md)** `[NUEVO]`
   - Reporte oficial de refinamiento UX, auditoría legal y QA.

---

## 2. MEJORAS UX IMPLEMENTADAS

### A. Diferenciación Estricta entre Despacho y Entrega
- Se incluyó la **aclaración legal permanente**:
  > *"El despacho corresponde al momento en que el vendedor entrega el paquete al transportista. El tiempo de entrega dependerá del courier seleccionado."*
- Se prohibió de forma absoluta el uso de frases erróneas como *"Llega hoy"* cuando el sistema únicamente conoce la fecha de despacho al courier.

### B. Semáforo Visual de Despacho (Traffic Light Status)
- 🟢 **Verde (`Despacha hoy`)**: Se muestra cuando la compra ocurre en un día de despacho dentro del horario límite (cutoff).
- 🟡 **Amarillo (`Despacho próximo`)**: Se muestra cuando venció el cutoff o es fin de semana (ej. *"Despacho el lunes"*).
- ⚪ **Gris (`Preparación especial`)**: Se muestra cuando el producto requiere días hábiles adicionales de preparación.

### C. Fila Unificada de Resumen (Escaneo en 5 Segundos)
Un header compacto tipo pill en la parte superior del bloque con indicadores limpios:
`[● Despacha hoy]  [✓ DAC disponible]  [✓ Retiro en tienda]`

### D. Contador Dinámico hasta el Cierre de Despacho (Cutoff Countdown)
- Muestra el tiempo exacto restante antes del cierre diario de pedidos:
  *"Comprando en las próximas **2 h 15 min**, JorgiToys despacha hoy por DAC."*

### E. Presentación de Couriers y Retiro en Tienda
- Sección **Métodos disponibles** con lista de checkmarks (`✓`):
  - `✓ DAC` — Entrega a domicilio o retiro en agencia.
  - `✓ UES` — Entrega rápida a domicilio.
  - `✓ SoyDelivery` — Envíos Flex / Express en zonas habilitadas.
  - `✓ Correo Uruguayo` — Cobertura nacional a todo el país.
  - `✓ Retiro en tienda` — Dirección y horario oficial del vendedor.
- Se muestran únicamente los métodos habilitados por el vendedor.

### F. Transparencia en Costos y Envío Gratis
- Si el vendedor configuró tarifa fija: muestra `$230` o `$95`.
- De lo contrario: *"El costo se calcula durante el checkout."*
- Si existe monto mínimo configurado: *"Envío gratis en compras mayores a $XXXX"*.

### G. Contenedor Exclusivo Importación Amazon USA
Para productos internacionales (`source_provider === 'zinc'` / `'amazon'`), se despliega un bloque independiente que omite cualquier mención a DAC, UES, SoyDelivery o Retiros:
- **Título**: `Importación Amazon USA`
- **Condiciones**:
  - Compra inmediata protegida por Collectibles.uy.
  - Se envía a tu casilla courier en Estados Unidos.
  - El envío desde Estados Unidos hasta Uruguay será gestionado por el courier elegido por el cliente.
  - ⚠️ El costo del courier internacional no está incluido en el precio del producto y se calcula según el peso final al ingresar a tu casilla.

### H. Texto Final de Confianza
- Línea discreta al pie del módulo:
  > *"Todos los pedidos se despachan utilizando el método logístico seleccionado durante la compra."*

---

## 3. EJEMPLOS PRÁCTICOS POR TIPO DE VENDEDOR Y PRODUCTO

### 1. Collectibles.uy (Plataforma)
```text
ENVÍOS Y RETIRO                             Despachado por Collectibles.uy
[🟢 Despacha hoy] [✓ DAC disponible] [✓ Retiro en tienda]

Próximo Despacho: hoy
Comprando en las próximas 3 h 45 min, Collectibles.uy despacha hoy por DAC / UES / SoyDelivery.

ℹ️ El despacho corresponde al momento en que el vendedor entrega el paquete al transportista. El tiempo de entrega dependerá del courier seleccionado.

Métodos disponibles
✓ Retiro en tienda — Maldonado 1422, Montevideo (Lun a Vie 10:00 a 19:00, Sáb 10:00 a 14:00) | Sin costo
✓ DAC — Entrega a domicilio o retiro en agencia | En checkout
✓ UES — Entrega rápida a domicilio | En checkout
✓ SoyDelivery — Envíos Flex / Express en zonas habilitadas | En checkout

Todos los pedidos se despachan utilizando el método logístico seleccionado durante la compra.
```

### 2. JorgiToys (Vendor con Cutoff y DAC)
```text
ENVÍOS Y RETIRO                             Despachado por JorgiToys
[🟢 Despacha hoy] [✓ DAC disponible]

Próximo Despacho: hoy
Comprando en las próximas 2 h 15 min, JorgiToys despacha hoy por DAC.

ℹ️ El despacho corresponde al momento en que el vendedor entrega el paquete al transportista. El tiempo de entrega dependerá del courier seleccionado.

Métodos disponibles
✓ DAC — Entrega a domicilio o retiro en agencia | En checkout

Todos los pedidos se despachan utilizando el método logístico seleccionado durante la compra.
```

### 3. Vendor con UES y SoyDelivery
```text
ENVÍOS Y RETIRO                             Despachado por Vendor X
[🟢 Despacha hoy] [✓ UES disponible]

Próximo Despacho: hoy
Comprando en las próximas 4 h 10 min, Vendor X despacha hoy por UES / SoyDelivery.

ℹ️ El despacho corresponde al momento en que el vendedor entrega el paquete al transportista. El tiempo de entrega dependerá del courier seleccionado.

Métodos disponibles
✓ UES — Entrega rápida a domicilio | En checkout
✓ SoyDelivery — Envíos Flex / Express en zonas habilitadas | En checkout

Todos los pedidos se despachan utilizando el método logístico seleccionado durante la compra.
```

### 4. Vendor con Retiro en Tienda Habilitado
```text
ENVÍOS Y RETIRO                             Despachado por MuestrasUY
[🟢 Despacha hoy] [✓ Retiro disponible]

Próximo Despacho: hoy
Comprando en las próximas 1 h 30 min, MuestrasUY despacha hoy por DAC.

ℹ️ El despacho corresponde al momento en que el vendedor entrega el paquete al transportista. El tiempo de entrega dependerá del courier seleccionado.

Métodos disponibles
✓ Retiro en tienda — Av. 18 de Julio 1234, Montevideo | Sin costo
✓ DAC — Entrega a domicilio o retiro en agencia | En checkout

Todos los pedidos se despachan utilizando el método logístico seleccionado durante la compra.
```

### 5. Producto Internacional (Amazon USA)
```text
Importación Amazon USA                      USA ✈ Uruguay
✓ Compra inmediata protegida por Collectibles.uy.
✓ Se envía a tu casilla courier en Estados Unidos.
ℹ️ El envío desde Estados Unidos hasta Uruguay será gestionado por el courier elegido por el cliente.

⚠️ El costo del courier internacional no está incluido en el precio del producto y se calcula según el peso final al ingresar a tu casilla.
```

### 6. Producto en Preventa
```text
ENVÍOS Y RETIRO                             Despachado por Collectibles.uy
[🟡 En preventa] [✓ DAC disponible]

⏰ Producto en Preventa
El despacho o retiro de este producto se realizará una vez recibido en stock en el depósito del vendedor.

ℹ️ El despacho corresponde al momento en que el vendedor entrega el paquete al transportista. El tiempo de entrega dependerá del courier seleccionado.

Métodos disponibles
✓ DAC — Entrega a domicilio o retiro en agencia | En checkout

Todos los pedidos se despachan utilizando el método logístico seleccionado durante la compra.
```

### 7. Producto con Preparación Especial (3 días)
```text
ENVÍOS Y RETIRO                             Despachado por ArtesaníasUY
[⚪ Preparación 3d] [✓ DAC disponible]

⏰ Preparación Especial
Este producto requiere 3 días hábiles de preparación antes del despacho.

ℹ️ El despacho corresponde al momento en que el vendedor entrega el paquete al transportista. El tiempo de entrega dependerá del courier seleccionado.

Métodos disponibles
✓ DAC — Entrega a domicilio o retiro en agencia | En checkout

Todos los pedidos se despachan utilizando el método logístico seleccionado durante la compra.
```

---

## 4. MATRIZ DE QA Y VERIFICACIÓN COMPILADA

| ID | Escenario de Prueba | Resultado |
|:---|:---|:---:|
| 1 | Integridad de checkout, create-order y pagos (0 modificaciones) | PASS |
| 2 | Aclaración legal permanente despacho vs entrega visible | PASS |
| 3 | Ausencia total de promesas erróneas "Llega hoy" | PASS |
| 4 | Fila de resumen de escaneo en 5s con semáforo visual | PASS |
| 5 | Contador dinámico de horas/minutos faltantes al cutoff | PASS |
| 6 | Transición a semáforo amarillo y "Próximo despacho: el lunes" tras cutoff | PASS |
| 7 | Métodos disponibles formateados con checkmarks | PASS |
| 8 | Retiro en tienda mostrando dirección y horario si está activo | PASS |
| 9 | Mención de costo transparente (fijo o "en checkout") | PASS |
| 10 | Banner de Envío Gratis desde $X cuando aplica | PASS |
| 11 | Bloque exclusivo Amazon USA sin couriers locales | PASS |
| 12 | Visualización de Tienda Oficial con badge red pill | PASS |
| 13 | Advertencia de producto voluminoso | PASS |
| 14 | Texto final discreto de confianza | PASS |
| 15 | Compilación ejecutable `npm run build` limpia (0 errores) | PASS |
| 16 | Deploy en producción (`collectibles.uy`) | PASS |

---

## 5. ESTADO DEL DEPLOY A PRODUCCIÓN

La aplicación frontend compiló limpiamente en Vite/Rollup (0 errores) y los cambios fueron commiteados y pusheados a la rama principal (`main`) para ser desplegados en [collectibles.uy](https://collectibles.uy).
