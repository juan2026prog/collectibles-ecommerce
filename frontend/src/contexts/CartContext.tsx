import { createContext, useContext, ReactNode, useMemo, useState, useCallback } from 'react';
import { useCart as useCartHook } from '../hooks/useData';
import type { CartItem } from '../hooks/useData';
import { trackAddToCart, generateMetaEventId } from '../lib/meta/metaPixel';
interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  updateQuantity: (variantId: string, vendorId: string | undefined, quantity: number) => void;
  removeItem: (variantId: string, vendorId?: string) => void;
  clearCart: () => void;
  total: number;
  count: number;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const cart = useCartHook();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const addItem = useCallback((item: CartItem) => {
    cart.addItem(item);
    setIsDrawerOpen(true);

    try {
      const eventId = generateMetaEventId('AddToCart', item.product_id);
      trackAddToCart(eventId, {
        content_ids: [item.product_id],
        contents: [{ id: item.product_id, quantity: item.quantity }],
        value: (item.price || 0) * (item.quantity || 1),
        currency: 'UYU'
      });
    } catch (e) {
      console.warn("Meta tracking error", e);
    }
  }, [cart]);

  const value = useMemo(() => ({
    ...cart,
    addItem,
    isDrawerOpen,
    setIsDrawerOpen
  }), [cart, addItem, isDrawerOpen]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCartContext() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCartContext must be used within CartProvider');
  return context;
}
