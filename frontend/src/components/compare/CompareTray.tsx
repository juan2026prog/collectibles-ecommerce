import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCollectorCompare } from '../../contexts/CompareContext';
import { supabase } from '../../lib/supabase';
import { X, ArrowRight, Trash2, Scale, Box } from 'lucide-react';

interface TrayItem {
  id: string;
  title: string;
  primary_image?: string | null;
  base_price?: number;
}

export const CompareTray: React.FC = () => {
  const { comparedIds, removeFromCompare, clearCompare, compareCount } = useCollectorCompare();
  const [items, setItems] = useState<TrayItem[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Hide tray on /compare page itself
  const isComparePage = location.pathname.startsWith('/compare');

  useEffect(() => {
    if (comparedIds.length === 0) {
      setItems([]);
      return;
    }

    const fetchTrayItems = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('products')
          .select('id, title, base_price, product_images(url, is_primary)')
          .in('id', comparedIds);

        if (error) throw error;
        if (data) {
          const mapped: TrayItem[] = data.map((p: any) => {
            const primaryImg = p.product_images?.find((img: any) => img.is_primary)?.url || 
                               p.product_images?.[0]?.url || null;
            return {
              id: p.id,
              title: p.title,
              primary_image: primaryImg,
              base_price: p.base_price
            };
          });
          setItems(mapped);
        }
      } catch (err) {
        console.error('Error fetching compare tray items:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTrayItems();
  }, [comparedIds]);

  if (comparedIds.length === 0 || isComparePage) {
    return null;
  }

  const handleCompareNow = () => {
    navigate(`/compare?products=${comparedIds.join(',')}`);
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-2xl animate-fade-in-up">
      <div className="bg-zinc-950/95 backdrop-blur-md border border-amber-500/30 rounded-2xl p-3 sm:p-4 shadow-2xl shadow-black/80 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Header & count */}
        <div className="flex items-center justify-between w-full sm:w-auto gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Scale size={16} />
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-amber-400 block">
                Comparador
              </span>
              <span className="text-xs text-zinc-300 font-medium">
                {compareCount} de 4 piezas
              </span>
            </div>
          </div>

          <button
            onClick={clearCompare}
            className="sm:hidden text-zinc-400 hover:text-red-400 p-1.5 transition text-xs flex items-center gap-1"
            title="Vaciar"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Thumbnails row */}
        <div className="flex items-center gap-2 overflow-x-auto py-1 max-w-full">
          {items.map(item => (
            <div
              key={item.id}
              className="relative group w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-700/60 overflow-hidden flex-shrink-0 flex items-center justify-center"
            >
              {item.primary_image ? (
                <img
                  src={item.primary_image}
                  alt={item.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Box size={16} className="text-zinc-600" />
              )}
              <button
                onClick={() => removeFromCompare(item.id)}
                className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-red-400 transition"
                title="Quitar"
              >
                <X size={14} />
              </button>
            </div>
          ))}

          {/* Empty placeholder slots */}
          {Array.from({ length: 4 - items.length }).map((_, idx) => (
            <div
              key={`empty-${idx}`}
              className="w-12 h-12 rounded-xl border border-dashed border-zinc-800 flex items-center justify-center text-zinc-700 flex-shrink-0"
              title="Slot libre"
            >
              <span className="text-[10px] font-bold">+{idx + 1}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={clearCompare}
            className="hidden sm:flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1.5 transition"
            title="Limpiar bandeja"
          >
            <Trash2 size={14} />
            <span>Limpiar</span>
          </button>

          <button
            onClick={handleCompareNow}
            disabled={compareCount < 2}
            className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition ${
              compareCount >= 2
                ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            <span>Comparar ({compareCount})</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompareTray;
