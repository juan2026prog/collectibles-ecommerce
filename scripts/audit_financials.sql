-- AUDITOR AGENT SQL SCRIPT
-- Purpose: Discover mathematical or logical inconsistencies in the e-commerce ledgers.

-- 1. Inconsistent Order Totals Check
-- Flags any order where the `orders.total_amount` does not explicitly map to the sum of its `order_items` units.
-- Includes coupon discount reconciliation if coupons are active.
SELECT 
    o.id AS order_id, 
    o.total_amount AS recorded_total,
    SUM(oi.quantity * oi.unit_price) AS derived_items_total,
    c.discount_value
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN coupons c ON o.coupon_id = c.id
GROUP BY o.id, c.discount_value
HAVING o.total_amount != (
    -- Mathematical safety: If coupon is percentage, compute it, else subtract fixed amount.
    CASE 
        WHEN c.discount_type = 'percentage' THEN SUM(oi.quantity * oi.unit_price) * (1 - (c.discount_value / 100))
        WHEN c.discount_type = 'fixed' THEN SUM(oi.quantity * oi.unit_price) - c.discount_value
        ELSE SUM(oi.quantity * oi.unit_price)
    END
);

-- 2. Negative Vendor Payout Audit
-- Flags any vendor payout that dipped below 0 unexpectedly (e.g. from an unhandled edge-case refund)
SELECT 
    vp.id AS payout_id, 
    vp.vendor_id, 
    vp.amount
FROM vendor_payouts vp
WHERE vp.amount < 0;

-- 3. Orphaned Affiliate Links
-- Flags affiliates who are generating orders but have a suspended or null status in the `profiles` layer.
SELECT 
    a.id AS affiliate_id, 
    a.status,
    COUNT(o.id) as pending_orders,
    SUM(o.total_amount) as potential_revenue
FROM affiliates a
JOIN orders o ON o.affiliate_id = a.id
WHERE a.status != 'active'
GROUP BY a.id, a.status;

-- Note: A perfectly healthy database will return 0 rows for all of the above queries.
