import React, { useRef, useState } from 'react';
import { X, Share2, Copy, Check, ShieldCheck, Sparkles, Image as ImageIcon } from 'lucide-react';
import type { VaultCondition, VaultBoxCondition, VaultStatus } from '../../plugins/collector-vault/types';

interface VaultShareCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: {
    custom_name: string;
    status: VaultStatus;
    condition: VaultCondition;
    box_condition: VaultBoxCondition;
    custom_image_url?: string | null;
    purchase_date?: string | null;
    brand_name?: string | null;
    scale?: string | null;
  };
}

export function VaultShareCardModal({ isOpen, onClose, item }: VaultShareCardModalProps) {
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handleCopyText = () => {
    const text = `💎 Colección Oficial Collectibles.uy\n` +
      `📦 Pieza: ${item.custom_name}\n` +
      `✨ Condición: ${item.condition} | Caja: ${item.box_condition}\n` +
      `🔒 Estado: ${item.status}\n` +
      `🏷️ Verificada en My Vault: https://collectibles.uy/vault`;
    
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-zinc-950 border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 px-6 border-b border-white/10 bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-amber-400" />
            <h3 className="text-sm font-bold text-white">Ficha de Coleccionista Compartible</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Card Preview */}
        <div className="p-6 flex justify-center bg-zinc-950/80">
          <div
            ref={cardRef}
            className="w-full max-w-sm bg-gradient-to-b from-zinc-900 via-zinc-900 to-black border-2 border-amber-500/30 rounded-2xl p-5 shadow-2xl relative overflow-hidden"
          >
            {/* Holographic accent */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

            {/* Header / Watermark */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-black text-black">
                  C
                </div>
                <span className="text-[11px] font-black tracking-wider text-white">COLLECTIBLES.UY</span>
              </div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                Collector Vault
              </span>
            </div>

            {/* Image Preview */}
            <div className="w-full aspect-square bg-zinc-950 rounded-xl border border-white/10 flex items-center justify-center overflow-hidden mb-4 relative">
              {item.custom_image_url ? (
                <img
                  src={item.custom_image_url}
                  alt={item.custom_name}
                  className="w-full h-full object-contain p-2"
                />
              ) : (
                <div className="flex flex-col items-center text-zinc-600 gap-1">
                  <ImageIcon size={32} />
                  <span className="text-[10px] font-mono">Foto de Pieza Verificada</span>
                </div>
              )}

              <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded text-[9px] font-bold text-zinc-300 border border-white/10 flex items-center gap-1">
                <ShieldCheck size={10} className="text-emerald-400" />
                <span>Verified Piece</span>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2">
              <h4 className="text-base font-black text-white leading-snug line-clamp-2">
                {item.custom_name || 'Pieza Coleccionable'}
              </h4>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[10px]">
                <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                  <span className="text-zinc-500 block uppercase font-bold text-[8px]">Condición</span>
                  <span className="font-bold text-zinc-200">{item.condition}</span>
                </div>
                <div className="bg-white/5 rounded-lg p-2 border border-white/5">
                  <span className="text-zinc-500 block uppercase font-bold text-[8px]">Empaque</span>
                  <span className="font-bold text-zinc-200">{item.box_condition}</span>
                </div>
              </div>

              {item.purchase_date && (
                <div className="text-[10px] text-zinc-500 text-right pt-1 font-mono">
                  Adquirido: {item.purchase_date}
                </div>
              )}
            </div>

            {/* Bottom Watermark */}
            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[9px] text-zinc-500 font-mono">
              <span>VAULT ID: #CL-VERIFIED</span>
              <span>collectibles.uy</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 px-6 border-t border-white/10 bg-zinc-900/50 flex items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-400">
            Los precios e información privada nunca son visibles en la ficha compartida.
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyText}
              className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copied ? '¡Copiado!' : 'Copiar Ficha'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
