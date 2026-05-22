import { createContext, useContext, ReactNode, useMemo, useState, useCallback } from 'react';
import { useCart as useCartHook } from '../hooks/useData';
import type { CartItem } from '../hooks/useData';

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
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
