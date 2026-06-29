-- Recreate get_vendor_sales_metrics RPC function with updated confirmed_gmv definition
CREATE OR REPLACE FUNCTION public.get_vendor_sales_metrics(p_vendor_id uuid DEFAULT NULL)
RETURNS TABLE (
    vendor_id uuid,
    vendor_name text,
    confirmed_gmv numeric,
    pending_gmv numeric,
    liquidated_gmv numeric,
    refunded_amount numeric,
    disputed_amount numeric,
    marketplace_fees numeric,
    net_to_vendor numeric,
    order_count bigint,
    suborder_count bigint,
    last_sale_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    WITH real_sales AS (
        SELECT 
            s.id as suborder_id,
            s.vendor_id,
            s.vendor_gross_amount,
            s.marketplace_fee,
            s.vendor_net_amount,
            s.status as suborder_status,
            s.liquidation_status,
            s.created_at,
            o.id as order_id
        FROM public.order_suborders s
        JOIN public.orders o ON s.parent_order_id = o.id
        WHERE s.is_collectibles_order = false
          AND s.vendor_id IS NOT NULL
          AND o.is_test_order = false
          AND o.payment_status IN ('approved', 'paid', 'accredited')
          AND o.status NOT IN ('failed', 'rejected', 'pending')
          AND COALESCE(o.payment_provider_reference, '') NOT ILIKE '%MOCK%'
          AND COALESCE(o.payment_provider_reference, '') NOT ILIKE '%TEST%'
          AND COALESCE(o.payment_provider_reference, '') NOT ILIKE '%DEMO%'
          AND COALESCE(o.payment_provider_reference, '') NOT ILIKE '%SANDBOX%'
          AND COALESCE(o.payment_provider, '') NOT ILIKE '%MOCK%'
          AND COALESCE(o.payment_provider, '') NOT ILIKE '%TEST%'
          AND COALESCE(o.payment_method, '') NOT ILIKE '%MOCK%'
          AND COALESCE(o.payment_method, '') NOT ILIKE '%TEST%'
          AND COALESCE(o.payment_id, '') NOT ILIKE '%MOCK%'
          AND COALESCE(o.payment_id, '') NOT ILIKE '%TEST%'
          AND NOT EXISTS (
              SELECT 1 FROM public.payments pay 
              WHERE pay.order_id = o.id 
                AND (
                  pay.status NOT IN ('approved', 'paid', 'accredited')
                  OR pay.transaction_external_id ILIKE '%MOCK%'
                  OR pay.transaction_external_id ILIKE '%TEST%'
                  OR pay.transaction_external_id ILIKE '%DEMO%'
                  OR pay.transaction_external_id ILIKE '%SANDBOX%'
                )
          )
    ),
    refund_totals AS (
        SELECT 
            suborder_id,
            COALESCE(SUM(amount), 0) as total_refunded
        FROM public.refunds
        WHERE status = 'completed'
        GROUP BY suborder_id
    )
    SELECT 
        v.id as r_vendor_id,
        v.store_name::text as r_vendor_name,
        
        -- confirmed_gmv: all paid, not cancelled/refunded/disputed (regardless of delivery status)
        COALESCE(SUM(
            CASE WHEN rs.suborder_status NOT IN ('cancelled', 'refunded', 'claim_open')
                      AND NOT EXISTS (SELECT 1 FROM public.payment_disputes d WHERE d.suborder_id = rs.suborder_id AND d.status = 'open')
                 THEN rs.vendor_gross_amount - COALESCE(rf.total_refunded, 0)
                 ELSE 0 
            END
        ), 0) as confirmed_gmv,
        
        -- pending_gmv: paid but not yet delivered
        COALESCE(SUM(
            CASE WHEN rs.suborder_status NOT IN ('cancelled', 'refunded', 'claim_open', 'delivered')
                      AND rs.liquidation_status != 'paid'
                      AND NOT EXISTS (SELECT 1 FROM public.payment_disputes d WHERE d.suborder_id = rs.suborder_id AND d.status = 'open')
                 THEN rs.vendor_gross_amount - COALESCE(rf.total_refunded, 0)
                 ELSE 0 
            END
        ), 0) as pending_gmv,
        
        -- liquidated_gmv: liquidation_status = 'paid'
        COALESCE(SUM(
            CASE WHEN rs.liquidation_status = 'paid'
                      AND rs.suborder_status NOT IN ('cancelled', 'refunded')
                 THEN rs.vendor_gross_amount - COALESCE(rf.total_refunded, 0)
                 ELSE 0 
            END
        ), 0) as liquidated_gmv,
        
        -- refunded_amount: total refunded on this vendor's suborders
        COALESCE(SUM(
            CASE WHEN rs.suborder_status = 'refunded' THEN rs.vendor_gross_amount 
                 ELSE COALESCE(rf.total_refunded, 0)
            END
        ), 0) as refunded_amount,
        
        -- disputed_amount: total amount of suborders in dispute
        COALESCE(SUM(
            CASE WHEN rs.suborder_status = 'claim_open' OR EXISTS (SELECT 1 FROM public.payment_disputes d WHERE d.suborder_id = rs.suborder_id AND d.status = 'open')
                 THEN rs.vendor_gross_amount
                 ELSE 0 
            END
        ), 0) as disputed_amount,
        
        -- marketplace_fees: platform fees on confirmed suborders
        COALESCE(SUM(
            CASE WHEN rs.suborder_status NOT IN ('cancelled', 'refunded', 'claim_open')
                      AND NOT EXISTS (SELECT 1 FROM public.payment_disputes d WHERE d.suborder_id = rs.suborder_id AND d.status = 'open')
                 THEN rs.marketplace_fee
                 ELSE 0 
            END
        ), 0) as marketplace_fees,
        
        -- net_to_vendor: net payout to vendor on confirmed suborders
        COALESCE(SUM(
            CASE WHEN rs.suborder_status NOT IN ('cancelled', 'refunded', 'claim_open')
                      AND NOT EXISTS (SELECT 1 FROM public.payment_disputes d WHERE d.suborder_id = rs.suborder_id AND d.status = 'open')
                 THEN rs.vendor_net_amount - COALESCE(rf.total_refunded, 0)
                 ELSE 0 
            END
        ), 0) as net_to_vendor,
        
        -- order_count: count of unique real orders
        COUNT(DISTINCT rs.order_id) as order_count,
        
        -- suborder_count: count of unique real suborders
        COUNT(DISTINCT rs.suborder_id) as suborder_count,
        
        -- last_sale_at: latest sale date
        MAX(rs.created_at) as last_sale_at
    FROM public.vendors v
    LEFT JOIN real_sales rs ON rs.vendor_id = v.id
    LEFT JOIN refund_totals rf ON rf.suborder_id = rs.suborder_id
    WHERE (p_vendor_id IS NULL OR v.id = p_vendor_id)
    GROUP BY v.id, v.store_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
