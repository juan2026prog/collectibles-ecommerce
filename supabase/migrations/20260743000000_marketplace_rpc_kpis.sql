-- Create RPC functions for Marketplace KPIs to ensure scalability

-- 1. get_marketplace_kpis
CREATE OR REPLACE FUNCTION get_marketplace_kpis()
RETURNS TABLE (
    total_vendors bigint,
    active_vendors bigint,
    total_gmv numeric,
    total_commissions numeric
) AS $$
DECLARE
    v_total_vendors bigint;
    v_active_vendors bigint;
    v_total_gmv numeric := 0;
    v_total_commissions numeric := 0;
BEGIN
    -- Count vendors
    SELECT count(*), count(*) FILTER (WHERE status = 'active')
    INTO v_total_vendors, v_active_vendors
    FROM vendors;

    -- Sum GMV and commissions from payouts
    -- Only considering payouts that are not cancelled or held
    -- GMV = sum( amount / (1 - fee_percentage / 100) )
    -- Commissions = GMV - sum(amount)
    SELECT 
        COALESCE(SUM(amount / (1 - (fee_percentage / 100.0))), 0),
        COALESCE(SUM((amount / (1 - (fee_percentage / 100.0))) - amount), 0)
    INTO v_total_gmv, v_total_commissions
    FROM vendor_payouts
    WHERE status IN ('pending', 'paid');

    RETURN QUERY SELECT v_total_vendors, v_active_vendors, v_total_gmv, v_total_commissions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. get_top_vendors
CREATE OR REPLACE FUNCTION get_top_vendors(p_limit int DEFAULT 5)
RETURNS TABLE (
    vendor_id uuid,
    store_name text,
    slug text,
    logo_url text,
    gmv numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.id as vendor_id,
        v.store_name,
        v.slug,
        v.logo_url,
        COALESCE(SUM(vp.amount / (1 - (vp.fee_percentage / 100.0))), 0) as gmv
    FROM vendors v
    JOIN vendor_payouts vp ON v.id = vp.vendor_id
    WHERE vp.status IN ('pending', 'paid')
    GROUP BY v.id, v.store_name, v.slug, v.logo_url
    ORDER BY gmv DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
