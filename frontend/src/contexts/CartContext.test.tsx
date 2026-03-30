import { renderHook, act } from '@testing-library/react';
import { CartProvider, useCartContext } from './CartContext';
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

// Supabase depende de variables de entorno — mockeamos el cliente
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
  }
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CartProvider>{children}</CartProvider>
);

describe('CartContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('debe inicializar con carrito vacío', () => {
    const { result } = renderHook(() => useCartContext(), { wrapper });
    expect(result.current.items).toEqual([]);
    expect(result.current.count).toBe(0);
    expect(result.current.total).toBe(0);
  });

  it('debe tener funciones disponibles', () => {
    const { result } = renderHook(() => useCartContext(), { wrapper });
    expect(typeof result.current.addItem).toBe('function');
    expect(typeof result.current.removeItem).toBe('function');
    expect(typeof result.current.clearCart).toBe('function');
    expect(typeof result.current.updateQuantity).toBe('function');
  });

  it('no debe fallar al intentar removeItem con id inexistente', () => {
    const { result } = renderHook(() => useCartContext(), { wrapper });
    act(() => {
      result.current.removeItem('non-existent-id');
    });
    expect(result.current.items).toEqual([]);
  });
});
