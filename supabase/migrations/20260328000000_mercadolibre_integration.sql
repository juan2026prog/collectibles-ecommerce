-- Agregando el identificador único de Mercado Libre para sincronización de inventario
ALTER TABLE products ADD COLUMN ml_item_id text UNIQUE;

-- Actualizamos el schema y damos permisos a la aplicación o roles autenticados (si es necesario)
-- Los endpoints de Edge Functions usando SERVICE_ROLE tienen todos los permisos.
