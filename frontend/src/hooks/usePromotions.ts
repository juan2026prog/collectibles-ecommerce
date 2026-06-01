import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface AutoPromo {
  id: string;
  name: string;
  discount_type: string;
  discount_value: number;
  min_quantity: number | null;
  is_stackable: boolean;
  priority: number;
  badge_text: string | null;
  badge_color: string | null;
  badge_bg: string | null;
  targets: any[];
  exclusions: any[];
  tiers: any[];
}

export function usePromotions() {
  const [promotions, setPromotions] = useState<AutoPromo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPromos() {
      try {
        const now = new Date().toISOString();
        const { data: promos, error } = await supabase
          .from('promotions')
          .select('id, name, discount_type, discount_value, min_quantity, is_stackable, priority, badge_text, badge_color, badge_bg')
          .neq('discount_type', 'bank_discount')
          .eq('is_active', true)
          .or(`starts_at.is.null,starts_at.lte.${now}`)
          .or(`ends_at.is.null,ends_at.gte.${now}`)
          .order('priority', { ascending: false });

        if (error || !promos || promos.length === 0) {
          setPromotions([]);
          setLoading(false);
          return;
        }

        const promoIds = promos.map(p => p.id);
        const [{ data: targets }, { data: exclusions }, { data: tiers }] = await Promise.all([
          supabase.from('promotion_targets').select('*').in('promotion_id', promoIds),
          supabase.from('promotion_exclusions').select('*').in('promotion_id', promoIds),
          supabase.from('promotion_tiers').select('*').in('promotion_id', promoIds)
        ]);

        const groupIds = new Set<string>();
        (targets || []).filter(t => t.target_type === 'group').forEach(t => groupIds.add(t.target_id));
        (exclusions || []).filter(e => e.target_type === 'group').forEach(e => groupIds.add(e.target_id));

        let groupItems: any[] = [];
        if (groupIds.size > 0) {
          const { data } = await supabase.from('product_group_items').select('product_group_id, product_id').in('product_group_id', Array.from(groupIds));
          groupItems = data || [];
        }

        const fullPromos = promos.map(p => {
          const pTargets = (targets || []).filter(t => t.promotion_id === p.id).map(t => ({
            ...t,
            group_product_ids: t.target_type === 'group' ? groupItems.filter(gi => gi.product_group_id === t.target_id).map(gi => gi.product_id) : []
          }));
          const pExclusions = (exclusions || []).filter(e => e.promotion_id === p.id).map(e => ({
            ...e,
            group_product_ids: e.target_type === 'group' ? groupItems.filter(gi => gi.product_group_id === e.target_id).map(gi => gi.product_id) : []
          }));
          return {
            ...p,
            targets: pTargets,
            exclusions: pExclusions,
            tiers: (tiers || []).filter(t => t.promotion_id === p.id).sort((a,b) => b.min_quantity - a.min_quantity),
          };
        });

        setPromotions(fullPromos);
      } catch (e) {
        console.warn('Could not fetch promotions (tables may not exist):', e);
        setPromotions([]);
      }
      setLoading(false);
    }
    fetchPromos();
  }, []);

  return { promotions, loading };
}

export function evaluateItemDiscount(item: { product_id: string, category_id?: string, brand_id?: string, vendor_id?: string, tag_ids?: string[], price: number, quantity: number }, promotions: AutoPromo[]) {
  let itemDiscount = 0;
  for (const promo of promotions) {
    let isExcluded = false;
    for (const exc of promo.exclusions) {
      if (exc.target_type === 'product' && exc.target_id === item.product_id) isExcluded = true;
      if (exc.target_type === 'category' && item.category_id === exc.target_id) isExcluded = true;
      if (exc.target_type === 'brand' && item.brand_id === exc.target_id) isExcluded = true;
      if (exc.target_type === 'vendor' && item.vendor_id === exc.target_id) isExcluded = true;
      if (exc.target_type === 'tag' && item.tag_ids?.includes(exc.target_id)) isExcluded = true;
      if (exc.target_type === 'group' && exc.group_product_ids?.includes(item.product_id)) isExcluded = true;
    }
    if (isExcluded) continue;

    let isIncluded = false;
    if (promo.targets.length === 0) {
      isIncluded = true;
    } else {
      for (const tgt of promo.targets) {
        if (tgt.target_type === 'product' && tgt.target_id === item.product_id) isIncluded = true;
        if (tgt.target_type === 'category' && item.category_id === tgt.target_id) isIncluded = true;
        if (tgt.target_type === 'brand' && item.brand_id === tgt.target_id) isIncluded = true;
        if (tgt.target_type === 'vendor' && item.vendor_id === tgt.target_id) isIncluded = true;
        if (tgt.target_type === 'tag' && item.tag_ids?.includes(tgt.target_id)) isIncluded = true;
        if (tgt.target_type === 'group' && tgt.group_product_ids?.includes(item.product_id)) isIncluded = true;
      }
    }
    if (!isIncluded) continue;

    if (promo.min_quantity && item.quantity < promo.min_quantity) continue;

    let currentDiscount = 0;
    if (promo.discount_type === 'percentage') {
       currentDiscount = (item.price * item.quantity) * (Number(promo.discount_value) / 100);
    } else if (promo.discount_type === 'fixed') {
       currentDiscount = Number(promo.discount_value) * item.quantity;
    } else if (promo.discount_type === '2x1') {
       const freeItems = Math.floor(item.quantity / 2);
       currentDiscount = item.price * freeItems;
    } else if (promo.discount_type === 'buy_x_get_y') {
       const freeItems = Math.floor(item.quantity / (promo.min_quantity || 2));
       currentDiscount = item.price * freeItems;
    } else if (promo.discount_type === 'tiered' && promo.tiers) {
       const activeTier = promo.tiers.find((t: any) => item.quantity >= t.min_quantity);
       if (activeTier) {
         if (activeTier.discount_type === 'percentage') {
           currentDiscount = (item.price * item.quantity) * (Number(activeTier.discount_value) / 100);
         } else if (activeTier.discount_type === 'fixed') {
           currentDiscount = Number(activeTier.discount_value) * item.quantity;
         }
       }
    }

    if (currentDiscount > 0) {
       if (!promo.is_stackable && itemDiscount > 0) {
         continue;
       }
       itemDiscount += currentDiscount;
       if (!promo.is_stackable) break;
    }
  }
  return Math.min(itemDiscount, item.price * item.quantity);
}

export function evaluateItemDiscountDetailed(item: { product_id: string, category_id?: string, brand_id?: string, vendor_id?: string, tag_ids?: string[], price: number, quantity: number }, promotions: AutoPromo[]) {
  let itemDiscount = 0;
  let nonStackableApplied = false;
  
  for (const promo of promotions) {
    let isExcluded = false;
    for (const exc of promo.exclusions) {
      if (exc.target_type === 'product' && exc.target_id === item.product_id) isExcluded = true;
      if (exc.target_type === 'category' && item.category_id === exc.target_id) isExcluded = true;
      if (exc.target_type === 'brand' && item.brand_id === exc.target_id) isExcluded = true;
      if (exc.target_type === 'vendor' && item.vendor_id === exc.target_id) isExcluded = true;
      if (exc.target_type === 'tag' && item.tag_ids?.includes(exc.target_id)) isExcluded = true;
      if (exc.target_type === 'group' && exc.group_product_ids?.includes(item.product_id)) isExcluded = true;
    }
    if (isExcluded) continue;

    let isIncluded = false;
    if (promo.targets.length === 0) {
      isIncluded = true;
    } else {
      for (const tgt of promo.targets) {
        if (tgt.target_type === 'product' && tgt.target_id === item.product_id) isIncluded = true;
        if (tgt.target_type === 'category' && item.category_id === tgt.target_id) isIncluded = true;
        if (tgt.target_type === 'brand' && item.brand_id === tgt.target_id) isIncluded = true;
        if (tgt.target_type === 'vendor' && item.vendor_id === tgt.target_id) isIncluded = true;
        if (tgt.target_type === 'tag' && item.tag_ids?.includes(tgt.target_id)) isIncluded = true;
        if (tgt.target_type === 'group' && tgt.group_product_ids?.includes(item.product_id)) isIncluded = true;
      }
    }
    if (!isIncluded) continue;

    if (promo.min_quantity && item.quantity < promo.min_quantity) continue;

    let currentDiscount = 0;
    if (promo.discount_type === 'percentage') {
       currentDiscount = (item.price * item.quantity) * (Number(promo.discount_value) / 100);
    } else if (promo.discount_type === 'fixed') {
       currentDiscount = Number(promo.discount_value) * item.quantity;
    } else if (promo.discount_type === '2x1') {
       const freeItems = Math.floor(item.quantity / 2);
       currentDiscount = item.price * freeItems;
    } else if (promo.discount_type === 'buy_x_get_y') {
       const freeItems = Math.floor(item.quantity / (promo.min_quantity || 2));
       currentDiscount = item.price * freeItems;
    } else if (promo.discount_type === 'tiered' && promo.tiers) {
       const activeTier = promo.tiers.find((t: any) => item.quantity >= t.min_quantity);
       if (activeTier) {
         if (activeTier.discount_type === 'percentage') {
           currentDiscount = (item.price * item.quantity) * (Number(activeTier.discount_value) / 100);
         } else if (activeTier.discount_type === 'fixed') {
           currentDiscount = Number(activeTier.discount_value) * item.quantity;
         }
       }
    }

    if (currentDiscount > 0) {
       if (!promo.is_stackable && itemDiscount > 0) {
         continue;
       }
       itemDiscount += currentDiscount;
       if (!promo.is_stackable) {
         nonStackableApplied = true;
         break;
       }
    }
  }
  return { 
    discount: Math.min(itemDiscount, item.price * item.quantity),
    nonStackableApplied
  };
}

export function getApplicablePromotions(item: { product_id: string, category_id?: string, brand_id?: string, vendor_id?: string, tag_ids?: string[] }, promotions: AutoPromo[]): AutoPromo[] {
  const applicable: AutoPromo[] = [];
  
  for (const promo of promotions) {
    let isExcluded = false;
    for (const exc of promo.exclusions) {
      if (exc.target_type === 'product' && exc.target_id === item.product_id) isExcluded = true;
      if (exc.target_type === 'category' && item.category_id === exc.target_id) isExcluded = true;
      if (exc.target_type === 'brand' && item.brand_id === exc.target_id) isExcluded = true;
      if (exc.target_type === 'vendor' && item.vendor_id === exc.target_id) isExcluded = true;
      if (exc.target_type === 'tag' && item.tag_ids?.includes(exc.target_id)) isExcluded = true;
    }
    if (isExcluded) continue;

    let isIncluded = false;
    if (promo.targets.length === 0) {
      isIncluded = true;
    } else {
      for (const tgt of promo.targets) {
        if (tgt.target_type === 'product' && tgt.target_id === item.product_id) isIncluded = true;
        if (tgt.target_type === 'category' && item.category_id === tgt.target_id) isIncluded = true;
        if (tgt.target_type === 'brand' && item.brand_id === tgt.target_id) isIncluded = true;
        if (tgt.target_type === 'vendor' && item.vendor_id === tgt.target_id) isIncluded = true;
        if (tgt.target_type === 'tag' && item.tag_ids?.includes(tgt.target_id)) isIncluded = true;
      }
    }
    if (!isIncluded) continue;

    applicable.push(promo);
  }
  
  return applicable;
}
