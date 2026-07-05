import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { trackAddToWishlist, generateMetaEventId } from '../lib/meta/metaPixel';
import { trackGA4Event } from '../lib/analyticsTracker';

interface WishlistContextType {
  wishlist: string[];
  toggleWishlist: (product: any) => Promise<void>;
  isInWishlist: (productId: string) => boolean;
  clearWishlist: () => void;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load initial state
  useEffect(() => {
    let isMounted = true;
    async function loadWishlist() {
      // 1. Read Local Storage
      const localWishlistStr = localStorage.getItem('guest_wishlist');
      let localWishlist: string[] = [];
      if (localWishlistStr) {
        try {
          localWishlist = JSON.parse(localWishlistStr);
        } catch {
          localWishlist = [];
        }
      }

      if (!user) {
        // Guest mode
        if (isMounted) {
          setWishlist(localWishlist);
          setIsLoaded(true);
        }
      } else {
        // Logged in mode
        const { data } = await supabase
          .from('wishlists')
          .select('product_id')
          .eq('user_id', user.id);
        
        const dbWishlist = (data || []).map(w => w.product_id);

        // Migración de guest a usuario registrado
        const toMigrate = localWishlist.filter(id => !dbWishlist.includes(id));
        if (toMigrate.length > 0) {
          const insertData = toMigrate.map(id => ({ user_id: user.id, product_id: id }));
          await supabase.from('wishlists').insert(insertData);
          dbWishlist.push(...toMigrate);
          // Limpiar local
          localStorage.removeItem('guest_wishlist');
        }

        if (isMounted) {
          setWishlist(dbWishlist);
          setIsLoaded(true);
        }
      }
    }

    loadWishlist();

    return () => { isMounted = false; };
  }, [user]);

  const toggleWishlist = useCallback(async (product: any) => {
    if (!product || !product.id) return;
    
    const productId = product.id;
    const isAdding = !wishlist.includes(productId);

    // Optimistic Update
    setWishlist(prev => 
      isAdding ? [...prev, productId] : prev.filter(id => id !== productId)
    );

    if (isAdding) {
      // GA4 standard Add To Wishlist event
      try {
        const finalPrice = Number(product.base_price || 0) + Number(product.variants?.[0]?.price_adjustment || 0);
        trackGA4Event('add_to_wishlist', {
          currency: 'UYU',
          value: finalPrice,
          items: [{
            item_id: String(productId),
            item_name: String(product.title),
            item_brand: product.brand?.name || undefined,
            item_category: product.category?.name || undefined,
            price: Number(finalPrice),
            quantity: 1
          }]
        });
      } catch (e) {
        console.warn('GA4 Wishlist Error', e);
      }

      // Meta Pixel
      try {
        const finalPrice = Number(product.base_price || 0) + Number(product.variants?.[0]?.price_adjustment || 0);
        const eventId = generateMetaEventId('AddToWishlist', productId);
        trackAddToWishlist(eventId, {
          content_name: product.title,
          content_ids: [productId],
          value: finalPrice,
          currency: 'UYU'
        });
      } catch (e) {
        console.warn('Meta Pixel Wishlist Error', e);
      }
    }

    if (!user) {
      // Guest
      const newLocal = isAdding 
        ? [...wishlist, productId] 
        : wishlist.filter(id => id !== productId);
      localStorage.setItem('guest_wishlist', JSON.stringify(newLocal));
    } else {
      // Logged in
      if (isAdding) {
        await supabase.from('wishlists').insert({ user_id: user.id, product_id: productId }).select().single();
      } else {
        await supabase.from('wishlists').delete().eq('user_id', user.id).eq('product_id', productId);
      }
    }
  }, [wishlist, user]);

  const isInWishlist = useCallback((productId: string) => {
    return wishlist.includes(productId);
  }, [wishlist]);

  const clearWishlist = useCallback(() => {
    setWishlist([]);
    localStorage.removeItem('guest_wishlist');
    if (user) {
      supabase.from('wishlists').delete().eq('user_id', user.id).then();
    }
  }, [user]);

  return (
    <WishlistContext.Provider value={{ wishlist, toggleWishlist, isInWishlist, clearWishlist }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlistContext() {
  const context = useContext(WishlistContext);
  if (context === undefined) {
    throw new Error('useWishlistContext must be used within a WishlistProvider');
  }
  return context;
}
