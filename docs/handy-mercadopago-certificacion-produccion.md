# Certificación de cancelaciones y reembolsos — Handy / Mercado Pago
Fecha de revisión: 12-11-2026

## Alcance
Solo pagos directos de Collectibles con Handy o Mercado Pago.
No incluye ni modifica Mercado Libre; no incluye reembolsos reales de prueba.

## Evidencia automatizada
GitHub Actions run 43276473249: **4/4 jobs exitosos**
- Frontend: Vitest, TypeScript y Vite build.
- Deno: tests del guard y typecheck de las Edge Functions afectadas.
- SQL: validación de sintaxis de todas las migraciones.
- PostgreSQL efímero: transiciones de estados, bloqueo por orden/suborden, pago parcial, límite de devoluciones, RLS simulado, autorización de administrador, comprobante privado, RPC atómica de creación de devolución Handy, RPC de confirmación, idempotencia y privilegios SQL.

## Compatibilidad de esquema de producción (solo lectura)
Se verificaron **13/13 requisitos** en Supabase `cobtsgkwcftvexaarwmo`:
existencia de `auth.jwt`, `auth.uid`, roles `authenticated` y `service_role`,
guard actual `check_fulfillment_allowed`, columnas de tareas/comprobantes,
clave de idempotencia, IP de auditoría, bucket privado `order-dispute-evidence`,
y RLS en `refunds`, `manual_refund_tasks` y `unified_order_requests`.
No se migraron tablas ni ejecutaron cargos.

## Bloqueo de certificación E2E: historia de migraciones de Supabase
Una rama de pruebas creada con autorización de costo USD 0.01344/hora
falló al reconstruir las migraciones del proyecto.
Falló en la migración histórica `20260326000002_storage_schema.sql`,
al ejecutar `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY`:
`42501: must be owner of table objects`.
El error ocurrió antes de ejecutar estas migraciones nuevas. La rama fue eliminada
para cortar la facturación; la instancia de producción NO fue alterada.

Este problema es un *drift* de migraciones/historia respecto del esquema real.
La recomendación de Supabase es reconciliar migraciones con el esquema de
producción o crear un baseline del esquema actual, **sin reejecutar a ciegas
migraciones históricas ni modificar ownership de Supabase Storage**.
Ver:
https://supabase.com/kb/troubleshooting/branch-in-migrations-failed-status
https://supabase.com/docs/guides/deployment/branching/troubleshooting

## Estado y condiciones estrictas para deploy
- El código está preparado en PR #44. Mantener PR en borrador hasta tener
  una rama Supabase completa y pasar las pruebas de permisos/RLS reales.
- No fusionar antes de: staging completo, pruebas de reembolsos MP en sandbox,
  flujo Handy con comprobante verificado, y prueba de notificaciones.
- Orden de despliegue: verificar backup/rollback, migraciones atómicas, validación
  de RPCs, despliegue de Edge Functions, comprobaciones de producción no financieras,
  frontend con prueba funcional y monitoreo; revertir si se detectan errores.
- Ninguna transacción real o estado histórico debe modificarse como parte de QA.
- Nunca modificar Mercadolibre ni habilitar callbacks Handy no autenticados para
  confirmar cobros automáticamente.

**Certificación de código y compatibilidad de esquema: aprobada.
Certificación E2E de Supabase/PSP y despliegue producción: pendiente.**
