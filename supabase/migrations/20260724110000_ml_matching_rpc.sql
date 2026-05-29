-- Create match_products_by_title RPC function for pg_trgm similarity search
CREATE OR REPLACE FUNCTION public.match_products_by_title(title_query TEXT, similarity_threshold NUMERIC)
RETURNS TABLE (
    id UUID,
    title TEXT,
    similarity REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.title, similarity(p.title, title_query) AS sim
    FROM public.products p
    WHERE similarity(p.title, title_query) >= similarity_threshold
    ORDER BY sim DESC
    LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
