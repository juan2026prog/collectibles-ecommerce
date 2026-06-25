# VENDOR_SOYDELIVERY_COVERAGE_HOTFIX_REPORT

## 1. Causa Raíz
Anteriormente, el sistema permitía a los vendedores activar y ofrecer la opción logística **SoyDelivery/Flex** sin validar si su dirección de despacho real (origen) o la dirección de envío del cliente (destino) estaban dentro del rango de cobertura geográfica del courier. Esto permitía la generación incorrecta de etiquetas y cobros para zonas no cubiertas.

---

## 2. Regla de Cobertura Implementada
El método SoyDelivery/Flex solo está disponible bajo la siguiente zonificación logística de cobertura real:
- **Montevideo**: Todas las localidades/barrios están cubiertos.
- **Canelones**: Solo las ciudades en las zonas metropolitanas:
  - *Zonas metropolitanas cubiertas*: Ciudad de la Costa, Colinas de Carrasco, El Pinar, Lagomar, Lomas de Solymar, Parque Carrasco, Paso de Carrasco, Shangrilá, Solymar, La Paz, Las Piedras, Progreso, Barros Blancos, Joaquín Suárez, Pando, Toledo, Ciudad de Canelones, Canelones.
- **San José**: Únicamente la ciudad de `Ciudad del Plata`.
- **Resto del país**: Fuera de cobertura (sin servicio de SoyDelivery).

---

## 3. Lógica de Fallback Ordenado (No forzar DAC automáticamente)
Si SoyDelivery/Flex no está disponible por origen o destino fuera de zona, se evalúan de forma secuencial los métodos del vendor:
1. **DAC**, si está activo para el vendor y disponible globalmente en la plataforma.
2. **UES**, si está activo para el vendor y disponible globalmente en la plataforma.
3. **Correo Uruguayo**, si está activo en la configuración del vendor.
4. **Envío manual**, si está activo en la configuración del vendor.
5. **Bloqueo de Checkout**: Si no hay ningún método válido, se bloquea el checkout para esa suborden mostrando:
   *“Este vendedor no tiene métodos de envío disponibles para tu dirección. Probá coordinar envío manual o contactanos.”*

---

## 4. Validación Compartida Real Frontend y Backend
- **Frontend**: `Checkout.tsx` calcula el fallback adecuado consultando dinámicamente las configuraciones del vendor y la tabla global `delivery_providers`. Si hay un error, deshabilita y bloquea el botón de confirmación en el checkout.
- **Backend**: `create-order` y `soydelivery-sync` aplican la misma lógica server-side con el fin de evitar cualquier evasión o inconsistencia de datos por parte del cliente.

---

## 5. Columna Real de Shipments Confirmada
Se verificó que la tabla utiliza `shipping_status` en lugar de `status`. En caso de que falle la cobertura geográfica al intentar sincronizar, `soydelivery-sync` registra:
- `shipping_status = 'failed'`
- `error_message = 'SoyDelivery no disponible para origen/destino'`

---

## 6. Asistente ML (Wizard) Ajustado
Si Mercado Libre detecta Flex activo pero la dirección de despacho del vendedor está fuera de zona:
- **No se activa** SoyDelivery/Flex automáticamente en las sugerencias del Wizard.
- **No se guarda** `soydelivery.active = true` (se fuerza a `false` o se desactiva).
- Se sugiere explícitamente activar **DAC, UES o Correo Uruguayo** como alternativas en la interfaz de usuario.

---

## 7. Archivos Modificados
1. **[uruguayLocations.ts](file:///c:/Projects/Collectibles2026/frontend/src/utils/uruguayLocations.ts)**: Helper centralizado de validación de zonas.
2. **[VShipping.tsx](file:///c:/Projects/Collectibles2026/frontend/src/components/vendor/VShipping.tsx)**: Panel de configuración de envíos para vendors.
3. **[Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx)**: Cálculo de costos y validación en checkout.
4. **[create-order/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/create-order/index.ts)**: Creación server-side de la orden con fallbacks y validación.
5. **[soydelivery-sync/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/soydelivery-sync/index.ts)**: Sincronización final registrando `shipping_status = 'failed'` y `error_message` en la base de datos.

---

## 8. Verificaciones y Despliegues
- **Compilación de TypeScript**: Ejecución exitosa de `npx tsc --noEmit`.
- **Bundling**: Generación del build de producción exitosa mediante `npm run build`.
- **Supabase Deploy**: Despliegue completado con éxito de las Edge Functions `create-order` y `soydelivery-sync`.
