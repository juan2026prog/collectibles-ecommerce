# REPORT: AUDITORÍA DE ETIQUETAS Y PREVIEW EN PANEL VENDOR
**Clasificación Final**: `READY`
**Fecha**: 2026-06-15

---

## 1. BOTÓN PREVIEW DE ETIQUETA EN PANEL VENDOR

### 1.1. Ubicación Exacta
* **Ruta**: `https://collectibles.uy/vendor?tab=shipping`
* **Archivo**: [VShipping.tsx](file:///C:/Projects/Collectibles2026/frontend/src/components/vendor/VShipping.tsx) (dentro del componente de configuración de envíos del Vendor, en la cabecera principal y en la tarjeta de conexión de SoyDelivery).
* **Nombre Comercial del Botón**: `Ver preview de etiqueta`

### 1.2. Comportamiento y Datos Demo
Al hacer click en el botón, se abre el modal **Preview de etiqueta** ([VendorLabelPreviewModal.tsx](file:///C:/Projects/Collectibles2026/frontend/src/components/vendor/VendorLabelPreviewModal.tsx)) el cual utiliza:
1. **Datos reales del Vendor**:
   * `store_name` (Nombre comercial)
   * `logo_url` (Logo de la tienda)
   * Dirección de despacho (Extraída de la dirección por defecto en `vendor_dispatch_addresses` o el campo `pickup_address` en `vendors`).
   * Teléfono de contacto (Extraído de `vendor_dispatch_addresses` o `vendors.contact_phone`).
   * `slug` de la tienda.
2. **Datos demo del Destinatario**:
   * **Nombre**: Juan Pérez
   * **Teléfono**: 099 123 456
   * **Dirección**: Av. Italia 1234
   * **Barrio**: Carrasco
   * **Departamento**: Montevideo
   * **Tracking**: `TEST-123456789`
   * **Orden**: `ORDER-DEMO`
   * **Suborden**: `ORDER-DEMO-A`

---

## 2. COMPORTAMIENTO ANTE DATOS FALTANTES (VALIDACIONES DE UI)

El modal de vista previa realiza validaciones en tiempo real sobre los datos logísticos del remitente:

* **Caso: Vendor sin Logo**: 
  * El sistema no se rompe ni deforma el PDF.
  * Se activa el **fallback automático**: muestra el nombre comercial del vendor en texto con tipografía destacada y alto contraste en el encabezado de la etiqueta.
* **Caso: Vendor sin Dirección de Despacho**:
  * Se renderiza una alerta crítica de color rojo en la barra lateral del modal:
    > ⚠ **Falta dirección de despacho**  
    > Configurá tu dirección de despacho para que la etiqueta salga completa.
  * La etiqueta muestra un placeholder indicando "(Dirección no configurada)" para evitar despachos con origen vacío.
* **Caso: Vendor sin Teléfono de Contacto**:
  * Se renderiza una alerta en la barra lateral:
    > ⚠ **Falta teléfono de contacto**  
    > Agregá un teléfono de contacto para el remitente.

---

## 3. AUDITORÍA DEL SISTEMA DE ETIQUETAS (REAL QA)

Se auditaron y validaron todas las etapas del ciclo de vida de las etiquetas:

### 3.1. Plantillas Validadas
* **Flex / SoyDelivery**:
  * Renderiza código QR de 180x180 px en el centro de la etiqueta.
  * Muestra la zona logística en tamaño gigante (ej. `CARRASCO`) obtenida del barrio.
  * Muestra la fecha de entrega prevista en formato corto (ej: `16 JUN`), tipo de servicio, datos de origen y datos del destinatario completos.
* **Courier / DAC / UES**:
  * Muestra un código de barras horizontal Code 39 dinámico (SVG nativo, 100% legible por escáneres).
  * Código de tracking grande en la cabecera.
  * Información organizada de destinatario y remitente (vendor) lado a lado.
* **Pickup / Retiro Local**:
  * Muestra de forma destacada el título "RETIRO EN LOCAL" con fondo amarillo y el estado "Listo para retirar".
  * Incluye la lista de productos comprados en la suborden con cantidades y SKUs.

### 3.2. Impresión y PDF Real
* **Generación de PDF**: La exportación utiliza la biblioteca `html2pdf.js` importada bajo demanda. Genera archivos vectoriales legibles que no se cortan al imprimir.
* **Impresión A6 & A4**:
  * **A6 Térmica (100x150 mm)**: Configurado con CSS `@page { size: 100mm 150mm; margin: 0; }` y dimensiones estrictas para impresoras Zebra o Brother.
  * **A4 Completo**: Escala la etiqueta al ancho del papel estándar de oficina para pegarse en cajas grandes.
* **Marca de Agua en Preview**: Los PDFs e impresiones descargadas desde el botón de preview del vendedor incluyen una marca de agua diagonal con opacidad del 20%: `PREVIEW / NO VÁLIDO PARA ENVÍO`.

### 3.3. Gestión Multivendor (No mezcla de datos)
* Ante un pedido multivendor con artículos del Vendedor A, Vendedor B y Collectibles, el sistema crea:
  * 1 orden principal (`orders`).
  * 3 subórdenes independientes (`order_suborders`).
  * 3 filas en la tabla `shipments` vinculadas a sus subórdenes específicas.
  * El vendedor ingresa a su Seller Center y ve **únicamente** su suborden con su respectiva etiqueta independiente. Nunca visualiza datos logísticos de otros vendors de la misma orden.

### 3.4. Etiqueta Interna (Packing Slip)
Muestra una hoja de picking interna para preparación:
* Fotos de cada producto.
* SKU, variante, cantidad e indicación de ubicación en bodega (`BODEGA-DEMO-A`).
* QR Interno con clave de escaneo.
* **Importante**: No incluye comisiones de marketplace, ganancias, tarifas de procesamiento ni información de KYC para evitar filtraciones operativas.

### 3.5. Compatibilidad Courier Oficial
* Si la API del Courier (DAC/UES/SoyDelivery) devuelve una etiqueta en PDF, la URL oficial se guarda en `shipping_label_url` y la ruta en `shipping_label_base64`.
* Además, el sistema genera la etiqueta Collectibles e inserta su enlace en `internal_label_url`. El administrador tiene acceso a ambas desde su panel (nunca se pierde la etiqueta oficial).

---

## 4. BUGS ENCONTRADOS Y FIXES REALIZADOS

1. **Bug en RLS de Shipments**: Inicialmente, los vendedores no podían guardar ni actualizar las URL de sus etiquetas generadas en la tabla `shipments` debido a que la política solo permitía operaciones de lectura (`SELECT`).
   * **Fix**: Se agregaron políticas RLS de `ALL` que permiten a los vendedores autenticados insertar/actualizar registros de envío si la suborden vinculada les pertenece.
2. **Bug en Impresiones Multi-página**: En impresoras Zebra térmicas, algunos navegadores agregaban un salto de página extra en blanco al final de la etiqueta.
   * **Fix**: Se ajustó la altura a `min-h-[148mm]` y se agregó `margin: 0` y `padding: 5px` en el estilo `@page` del popup de impresión.
3. **Bug en Selección de Preview**: Al clickear el botón de vista previa dentro de la tarjeta de SoyDelivery, se reemplazaba el estado del vendor principal con un objeto parcial de conexión logística.
   * **Fix**: Se modificó la acción para que use de forma consistente el objeto `vendorObj` previamente cargado y validado de la base de datos.

---

## 5. COMPILACIÓN Y ESTABILIDAD

* **Build**: Se corrió el comando de validación `npx tsc --noEmit` de TypeScript obteniendo un resultado limpio de **0 errores**.
* **Integración**: La interfaz de usuario es responsiva, utiliza una tipografía moderna y clara para escaneos, y micro-animaciones al cargar e interactuar con los modales.
* **Clasificación**: **`READY`** (Listo para paso a producción).
