import { createContext, useContext, ReactNode, useState, useEffect } from 'react';

export interface InternationalCartItem {
  product_id: string;
  variant_id: string;
  title: string;
  price_usd: number;
  image_url: string;
  quantity: number;
  weight_lb?: number;
  weight_kg?: number;
  raw_data?: any;
  international_data?: any;
}

interface InternationalCartContextType {
  items: InternationalCartItem[];
  addItem: (item: InternationalCartItem) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  clearCart: () => void;
  totalUsd: number;
  count: number;
}

const InternationalCartContext = createContext<InternationalCartContextType | undefined>(undefined);

export function InternationalCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<InternationalCartItem[]>(() => {
    try {
      const saved = localStorage.getItem('collectibles_international_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('collectibles_international_cart', JSON.stringify(items));
  }, [items]);

  const addItem = (item: InternationalCartItem) => {
    setItems(prev => {
      const existing = prev.find(i => i.variant_id === item.variant_id);
      if (existing) {
        return prev.map(i => i.variant_id === item.variant_id ? { ...i, quantity: i.quantity + item.quantity } : i);
      }
      return [...prev, item];
    });
  };

  const updateQuantity = (variantId: string, quantity: number) => {
    if (quantity < 1) return;
    setItems(prev => prev.map(i => i.variant_id === variantId ? { ...i, quantity } : i));
  };

  const removeItem = (variantId: string) => {
    setItems(prev => prev.filter(i => i.variant_id !== variantId));
  };

  const clearCart = () => setItems([]);

  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalUsd = items.reduce((sum, i) => sum + (i.price_usd * i.quantity), 0);

  return (
    <InternationalCartContext.Provider value={{ items, addItem, updateQuantity, removeItem, clearCart, totalUsd, count }}>
      {children}
    </InternationalCartContext.Provider>
  );
}

export function useInternationalCartContext() {
  const context = useContext(InternationalCartContext);
  if (!context) throw new Error('useInternationalCartContext must be used within InternationalCartProvider');
  return context;
}
