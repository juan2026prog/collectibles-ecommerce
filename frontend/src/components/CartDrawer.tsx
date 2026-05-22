import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ShoppingCart, X, Clock, Trash2, Minus, Plus, Tag, FileText, ArrowRight, Sparkles 
} from 'lucide-react';
import { useCartContext } from '../contexts/CartContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { resolveImage } from '../lib/imageUtils';

export default function CartDrawer() {
  const navigate = useNavigate();
  const { 
    items, 
    updateQuantity, 
    removeItem, 
    clearCart, 
    total, 
    count, 
    isDrawerOpen, 
    setIsDrawerOpen 
  } = useCartContext();

  const { formatCurrencyPrice, selectedCurrency } = useCurrency();
  const { settings } = useSiteSettings();
  const freeShippingThreshold = Number(settings['free_shipping_threshold'] || 4000);

  // States for Note
  const [noteText, setNoteText] = useState(() => localStorage.getItem('cart_note') || '');
  const [showNoteInput, setShowNoteInput] = useState(false);

  // States for Reservation Timer
  const [timeLeft, setTimeLeft] = useState(() => {
    const targetTime = sessionStorage.getItem('cart_reservation_ends');
    if (!targetTime) return 300;
    const remaining = Math.max(0, Math.floor((parseInt(targetTime, 10) - Date.now()) / 1000));
    return remaining > 0 ? remaining : 300;
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevCountRef = useRef(count);

  // Handle Note Auto-save
  const handleNoteChange = (text: string) => {
    setNoteText(text);
    localStorage.setItem('cart_note', text);
  };

  // Timer Lifecycle & Extension on item additions
  useEffect(() => {
    if (items.length === 0) {
      sessionStorage.removeItem('cart_reservation_ends');
      return;
    }

    const targetTime = sessionStorage.getItem('cart_reservation_ends');
    let targetTimestamp = targetTime ? parseInt(targetTime, 10) : 0;
    const isNewOrIncremented = !targetTimestamp || count > prevCountRef.current;
    
    // Update the ref to the current count
    prevCountRef.current = count;

    if (isNewOrIncremented) {
      targetTimestamp = Date.now() + 5 * 60 * 1000;
      sessionStorage.setItem('cart_reservation_ends', targetTimestamp.toString());
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((targetTimestamp - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining === 0 && timerRef.current) {
        clearInterval(timerRef.current);
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [items.length, count]);

  // Format Timer to MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const shipping = total >= freeShippingThreshold ? 0 : 350;
  const grandTotal = total + shipping;
  const freeShippingProgress = Math.min(100, (total / freeShippingThreshold) * 100);

  // Close drawer on navigate to checkout
  const handleCheckoutRedirect = () => {
    setIsDrawerOpen(false);
    navigate('/checkout');
  };

  return (
    <div className={`fixed inset-0 z-[200] ${isDrawerOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${
          isDrawerOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={() => setIsDrawerOpen(false)}
      />

      {/* Drawer Panel */}
      <div 
        className={`absolute inset-y-0 right-0 w-full max-w-md bg-[#0a0e1a] border-l border-white/10 shadow-2xl flex flex-col transition-transform duration-300 ease-out transform ${
          isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-[#0e1424]">
          <div className="flex items-center gap-2.5 text-white">
            <ShoppingCart className="w-5 h-5 text-[#f00856]" />
            <h2 className="text-lg font-black tracking-wider uppercase">Carrito</h2>
          </div>
          <button 
            onClick={() => setIsDrawerOpen(false)}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 no-scrollbar">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-20">
              <ShoppingCart className="w-16 h-16 text-slate-700 mb-4 animate-bounce" />
              <h3 className="text-xl font-bold text-slate-400">Tu carrito está vacío</h3>
              <p className="text-slate-500 mt-2 text-sm max-w-[250px]">
                ¡Agregá increíbles figuras de colección para comenzar!
              </p>
              <button
                onClick={() => {
                  setIsDrawerOpen(false);
                  navigate('/shop');
                }}
                className="btn-primary mt-6 text-sm px-6 py-2.5 rounded-full"
              >
                Seguir comprando
              </button>
            </div>
          ) : (
            <>
              {/* Timer Banner */}
              <div className="bg-slate-900/80 border border-white/5 rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 text-xs text-slate-300">
                <Clock className="w-4 h-4 text-[#f00856]" />
                <span>
                  Su carrito está reservado por{' '}
                  <span className="font-extrabold text-[#f00856] text-sm tracking-wide">
                    {formatTime(timeLeft)}
                  </span>{' '}
                  minutos!
                </span>
              </div>

              {/* Free Shipping Promo Banner */}
              <div className="border border-dashed border-blue-500/50 bg-blue-950/10 rounded-2xl p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <span className="text-amber-400 text-lg mt-0.5">⚡</span>
                  <div>
                    <div className="text-xs font-bold text-white uppercase tracking-wider">
                      Envíos GRATIS en compras mayores a {formatCurrencyPrice(freeShippingThreshold)}
                    </div>
                    <div className="text-[10px] text-blue-400 mt-0.5">
                      Aprovechá esta promoción de verano
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-[#f00856] transition-all duration-500"
                      style={{ width: `${freeShippingProgress}%` }}
                    />
                  </div>
                  <div className="text-[10px] flex justify-between">
                    {total >= freeShippingThreshold ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> ¡Tenés envío GRATIS!
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        Te faltan{' '}
                        <span className="text-blue-400 font-bold">
                          {formatCurrencyPrice(freeShippingThreshold - total)}
                        </span>{' '}
                        para el envío gratis.
                      </span>
                    )}
                    <span className="text-slate-500 font-mono">
                      {Math.round(freeShippingProgress)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Product list header */}
              <div className="flex items-center justify-between text-sm">
                <span className="font-black text-white uppercase tracking-wider">
                  {count} {count === 1 ? 'Producto' : 'Productos'}
                </span>
                <button 
                  onClick={clearCart}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold px-3 py-1 rounded-full text-xs transition-colors"
                >
                  Limpiar todo
                </button>
              </div>

              {/* Items Card List */}
              <div className="space-y-3.5">
                {items.map(item => (
                  <div 
                    key={item.variant_id} 
                    className="glass border border-white/5 p-4 rounded-2xl flex gap-3.5 hover:border-white/10 transition-all group"
                  >
                    <img 
                      src={resolveImage(item.image) || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="%230f172a" width="80" height="80" rx="8"/></svg>'} 
                      alt="" 
                      className="w-20 h-20 object-contain rounded-xl bg-white/5 p-1 shrink-0" 
                    />
                    
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-white text-xs leading-normal line-clamp-2 hover:text-[#f00856] transition-colors">
                            {item.title}
                          </h4>
                          {item.variant_name && (
                            <p className="text-[10px] text-slate-500 mt-1 font-semibold">
                              {item.variant_name}
                            </p>
                          )}
                        </div>
                        <button 
                          onClick={() => removeItem(item.variant_id)}
                          className="p-1 rounded-lg text-slate-500 hover:text-red-500 hover:bg-red-500/5 transition-colors shrink-0"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        {/* Quantity Selector */}
                        <div className="flex items-center border border-white/10 rounded-lg bg-black/40 overflow-hidden">
                          <button 
                            onClick={() => updateQuantity(item.variant_id, item.quantity - 1)}
                            className="p-1.5 hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-2.5 text-xs font-bold text-white">
                            {item.quantity}
                          </span>
                          <button 
                            onClick={() => updateQuantity(item.variant_id, item.quantity + 1)}
                            className="p-1.5 hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Price */}
                        <span className="text-sm font-black text-emerald-400">
                          {formatCurrencyPrice(item.price * item.quantity)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Interaction widgets */}
              <div className="grid grid-cols-2 gap-3.5">
                {/* Coupon reminder info */}
                <div className="border border-white/5 bg-white/[0.02] p-3 rounded-xl flex flex-col justify-between items-center text-center">
                  <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
                    <Tag className="w-4 h-4 text-amber-500" />
                  </div>
                  <p className="text-[10px] font-bold text-slate-300 leading-tight">
                    Códigos de descuento
                  </p>
                  <p className="text-[9px] text-slate-500 mt-1">
                    Se aplicarán en el paso final de pago.
                  </p>
                </div>

                {/* Write a note widget */}
                <button 
                  onClick={() => setShowNoteInput(!showNoteInput)}
                  className={`border p-3 rounded-xl flex flex-col items-center text-center transition-all ${
                    showNoteInput || noteText 
                      ? 'border-[#f00856]/40 bg-[#f00856]/5' 
                      : 'border-white/5 bg-white/[0.02] hover:border-white/10'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${
                    showNoteInput || noteText ? 'bg-[#f00856]/10' : 'bg-blue-500/10'
                  }`}>
                    <FileText className={`w-4 h-4 ${showNoteInput || noteText ? 'text-[#f00856]' : 'text-blue-400'}`} />
                  </div>
                  <span className="text-[10px] font-bold text-slate-300">
                    {noteText ? 'Nota guardada' : 'Escribir una nota'}
                  </span>
                  <span className="text-[9px] text-slate-500 mt-1">
                    {noteText ? 'Toca para editar' : 'Dejá tus comentarios'}
                  </span>
                </button>
              </div>

              {/* Notes input panel */}
              {showNoteInput && (
                <div className="bg-slate-950/40 border border-white/5 rounded-xl p-3 space-y-2 animate-fade-in">
                  <label className="text-[10px] font-bold text-slate-400 block">
                    Notas o instrucciones para el pedido:
                  </label>
                  <textarea
                    value={noteText}
                    onChange={(e) => handleNoteChange(e.target.value)}
                    placeholder="Escribí aquí si necesitás envolver para regalo, indicaciones para la entrega, etc..."
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white placeholder-slate-600 focus:border-[#f00856] outline-none resize-none h-20"
                  />
                  <div className="flex justify-end">
                    <button 
                      onClick={() => setShowNoteInput(false)}
                      className="text-[10px] font-extrabold text-[#f00856] hover:underline"
                    >
                      Aceptar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer (Fixed at bottom) */}
        {items.length > 0 && (
          <div className="p-5 border-t border-white/10 bg-[#0e1424]">
            <div className="space-y-2.5 mb-5 text-sm">
              <div className="flex justify-between items-center text-slate-400">
                <span>Subtotal</span>
                <span className="font-bold text-white">{formatCurrencyPrice(total)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Envío estimado</span>
                <span className="font-bold text-white">
                  {shipping === 0 ? (
                    <span className="text-emerald-400 font-black">GRATIS</span>
                  ) : (
                    formatCurrencyPrice(shipping)
                  )}
                </span>
              </div>
              
              <div className="border-t border-white/5 my-2.5" />

              <div className="flex justify-between items-center">
                <span className="font-black text-white uppercase tracking-wider">Total</span>
                <div className="text-right">
                  <span className="text-xl font-black text-[#f00856]">
                    {formatCurrencyPrice(grandTotal)}
                  </span>
                  {selectedCurrency !== 'UYU' && (
                    <p className="text-[9px] text-slate-500 mt-1 leading-none">
                      El cobro final se realiza en pesos uruguayos.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Main checkout button */}
            <button
              onClick={handleCheckoutRedirect}
              className="w-full bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white font-extrabold text-sm uppercase py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
            >
              Finalizar Pago
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsDrawerOpen(false)}
              className="w-full text-center text-xs text-slate-400 hover:text-white mt-3 font-semibold transition-colors"
            >
              ← Continuar comprando
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
