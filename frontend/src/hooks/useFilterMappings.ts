import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useFilterMappings() {
  const [mappings, setMappings] = useState<{ category_id: string; brand_id: string }[]>([]);
  
  useEffect(() => {
    async function fetchMappings() {
      // Get all published products' category_ids and brand_ids
      const { data } = await supabase
        .from('products')
        .select('brand_id, product_categories!inner(category_id)')
        .eq('status', 'published')
        .eq('is_active', true);
        
      if (data) {
        const pairs: { category_id: string; brand_id: string }[] = [];
        data.forEach((p: any) => {
          if (p.brand_id && p.product_categories) {
            // product_categories can be an array if multiple categories
            const cats = Array.isArray(p.product_categories) ? p.product_categories : [p.product_categories];
            cats.forEach((c: any) => {
              if (c.category_id) {
                pairs.push({ category_id: c.category_id, brand_id: p.brand_id });
              }
            });
          }
        });
        setMappings(pairs);
      }
    }
    fetchMappings();
  }, []);
  
  return mappings;
}
