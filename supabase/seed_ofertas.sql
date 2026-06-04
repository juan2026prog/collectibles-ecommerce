INSERT INTO product_groups (id, name, slug, description, type, is_active, show_on_home)
VALUES ('00000000-0000-0000-0000-000000000099'::uuid, 'Ofertas Especiales', 'ofertas', 'Todos los productos con descuentos y promociones especiales.', 'manual', true, true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, description = EXCLUDED.description, is_active = EXCLUDED.is_active;

DELETE FROM product_group_items WHERE group_id = '00000000-0000-0000-0000-000000000099'::uuid;

INSERT INTO product_group_items (group_id, product_id)
SELECT DISTINCT '00000000-0000-0000-0000-000000000099'::uuid, p.id
FROM products p
WHERE p.brand_id IN (
  SELECT target_id::uuid FROM promotion_targets WHERE target_type = 'brand' AND promotion_id = 'be441ab7-8332-40a2-ac35-7410a14c4b58'
)
OR p.category_id IN (
  SELECT target_id::uuid FROM promotion_targets WHERE target_type = 'category' AND promotion_id = 'be441ab7-8332-40a2-ac35-7410a14c4b58'
)
OR p.id IN (
  SELECT product_id FROM product_group_items WHERE group_id IN (
    SELECT target_id::uuid FROM promotion_targets WHERE target_type = 'group' AND promotion_id = 'be441ab7-8332-40a2-ac35-7410a14c4b58'
  )
);
