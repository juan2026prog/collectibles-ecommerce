import React, { useRef, useState } from 'react';
import { X, Share2, Copy, Check, ShieldCheck, Sparkles, Image as ImageIcon, Star, Heart, MessageCircle } from 'lucide-react';

function InstagramIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export interface ShareItemData {
  id?: string;
  custom_name: string;
  brand_name?: string | null;
  franchise?: string | null;
  scale?: string | null;
  height?: string | null;
  line?: string | null;
  condition: string;
  box_condition?: string;
  status?: string;
  rating?: number;
  is_favorite?: boolean;
  is_featured?: boolean;
  notes?: string | null;
  official_image_url?: string | null;
  custom_image_url?: string | null;
  purchase_date?: string | null;
  collector_handle?: string;
  slug?: string;
}

interface VaultShareCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  item?: ShareItemData | null;
  isFullVault?: boolean;
  vaultData?: {
    collector_handle: string;
    total_items: number;
    total_franchises: number;
    total_brands: number;
    featured_items: ShareItemData[];
  } | null;
}

export function VaultShareCardModal({
  isOpen,
  onClose,
  item,
  isFullVault = false,
  vaultData
}: VaultShareCardModalProps) {
  const [copied, setCopied] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'story' | 'feed'>('story'); // story = 9:16, feed = 4:5
  const [imageSource, setImageSource] = useState<'official' | 'custom'>('official');
  const cardRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const collectorName = vaultData?.collector_handle || item?.collector_handle || '@collector';
  const displayImage = item ? (
    imageSource === 'custom' && item.custom_image_url 
      ? item.custom_image_url 
      : (item.official_image_url || item.custom_image_url || '')
  ) : '';

  const shareUrl = isFullVault
    ? `${window.location.origin}/vault/${collectorName.replace('@', '')}`
    : `${window.location.origin}/vault/${collectorName.replace('@', '')}/${item?.slug || (item?.custom_name ? encodeURIComponent(item.custom_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')) : 'pieza')}`;

  const shareText = isFullVault
    ? `🏆 Mira mi colección completa en My Vault (${vaultData?.total_items || 3} piezas · ${vaultData?.total_franchises || 3} franquicias):\n${shareUrl}`
    : `⭐ ${item?.custom_name || 'Figura'} (${item?.brand_name || 'Colección'} · ${item?.scale || 'Oficial'})\n📦 Estado: ${item?.condition || 'MISB'}\n${item?.notes ? `💬 "${item.notes}"\n` : ''}🏷️ Ver ficha verificada en Collectibles: ${shareUrl}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShareWhatsApp = () => {
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(waUrl, '_blank');
  };

  const handleShareFacebook = () => {
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    window.open(fbUrl, '_blank');
  };

  const handleDownloadCard = () => {
    handleCopyLink();
    alert('¡Enlace copiado! Puedes usar la captura visual directamente para tus historias o feeds de Instagram.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-xl bg-zinc-950 border border-white/10 rounded-3xl overflow-hidden shadow-2xl my-auto">
        
        {/* Top bar */}
        <div className="flex items-center justify-between p-4 px-6 border-b border-white/10 bg-zinc-900/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Share2 size={14} />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">
                {isFullVault ? 'Compartir Mi Vault Completo' : 'Compartir Esta Pieza'}
              </h3>
              <p className="text-[11px] text-zinc-400">Ficha visual optimizada para redes sociales</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Controls: Formato + Foto Selector */}
        <div className="p-4 bg-zinc-900/30 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Format selector */}
          <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setAspectRatio('story')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                aspectRatio === 'story'
                  ? 'bg-amber-500 text-black shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Story 9:16
            </button>
            <button
              type="button"
              onClick={() => setAspectRatio('feed')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                aspectRatio === 'feed'
                  ? 'bg-amber-500 text-black shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Feed / Cuadrado
            </button>
          </div>

          {/* Photo source toggle (only for single item) */}
          {!isFullVault && item?.custom_image_url && item?.official_image_url && (
            <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setImageSource('official')}
                className={`px-3 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                  imageSource === 'official'
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Foto oficial
              </button>
              <button
                type="button"
                onClick={() => setImageSource('custom')}
                className={`px-3 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                  imageSource === 'custom'
                    ? 'bg-amber-500 text-black shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Mi foto real
              </button>
            </div>
          )}
        </div>

        {/* Visual Share Card Canvas Area */}
        <div className="p-4 sm:p-6 flex justify-center bg-zinc-950 overflow-hidden">
          <div
            ref={cardRef}
            className={`w-full max-w-[340px] bg-gradient-to-b from-zinc-900 via-zinc-950 to-black border-2 border-amber-500/40 rounded-3xl p-5 shadow-2xl relative overflow-hidden flex flex-col justify-between transition-all duration-300 ${
              aspectRatio === 'story' ? 'aspect-[9/16] min-h-[490px]' : 'aspect-[4/5] min-h-[420px]'
            }`}
          >
            {/* Ambient gold glow */}
            <div className="absolute top-0 right-0 w-44 h-44 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-36 h-36 bg-amber-600/10 rounded-full blur-2xl pointer-events-none" />

            {/* Card Header */}
            <div className="relative z-10">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-black text-black">
                    C
                  </div>
                  <span className="text-[11px] font-black tracking-widest text-white">MY VAULT</span>
                </div>
                <div className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  {collectorName}
                </div>
              </div>

              {!isFullVault && item?.franchise && (
                <div className="mt-2.5 flex items-center justify-between">
                  <span className="text-[9px] font-black tracking-widest uppercase text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded">
                    {item.franchise}
                  </span>
                  {item.is_favorite && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-black text-rose-400">
                      <Heart size={10} className="fill-rose-400" /> Favorita
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Main Visual Centerpiece */}
            {isFullVault ? (
              /* Full Vault Collage Preview */
              <div className="relative z-10 py-3 space-y-3">
                <div className="text-center space-y-1">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">Colección Privada</span>
                  <h4 className="text-lg font-black text-white leading-tight">La Colección de {collectorName}</h4>
                  <p className="text-[10px] text-amber-300 font-mono font-bold">
                    {vaultData?.total_items || 3} PIEZAS · {vaultData?.total_franchises || 3} FRANQUICIAS · {vaultData?.total_brands || 3} MARCAS
                  </p>
                </div>

                {/* 3 Featured Figures Collage */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {(vaultData?.featured_items || []).slice(0, 3).map((feat, idx) => (
                    <div key={idx} className="bg-zinc-900/90 border border-white/15 rounded-xl p-1.5 flex flex-col items-center text-center">
                      <div className="w-full aspect-square bg-black rounded-lg overflow-hidden flex items-center justify-center p-1 mb-1">
                        {feat.official_image_url || feat.custom_image_url ? (
                          <img src={feat.official_image_url || feat.custom_image_url || ''} alt={feat.custom_name} className="w-full h-full object-contain" />
                        ) : (
                          <ImageIcon size={18} className="text-zinc-600" />
                        )}
                      </div>
                      <span className="text-[8px] font-bold text-zinc-300 truncate w-full">{feat.custom_name}</span>
                      <span className="text-[7px] text-amber-400 font-mono">{feat.brand_name || 'Official'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Single Piece Image Showcase */
              <div className="relative z-10 my-auto py-2 flex flex-col items-center">
                <div className="w-full aspect-square max-h-[210px] bg-gradient-to-b from-zinc-900 to-black rounded-2xl border border-white/10 flex items-center justify-center overflow-hidden relative shadow-inner p-2">
                  {displayImage ? (
                    <img
                      src={displayImage}
                      alt={item?.custom_name}
                      className="w-full h-full object-contain drop-shadow-2xl transition-transform duration-300 hover:scale-105"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-zinc-600 gap-1">
                      <ImageIcon size={36} />
                      <span className="text-[10px] font-mono">Pieza Verificada</span>
                    </div>
                  )}

                  <div className="absolute bottom-2 left-2 bg-black/85 backdrop-blur-md px-2 py-0.5 rounded text-[9px] font-bold text-zinc-300 border border-white/10 flex items-center gap-1">
                    <ShieldCheck size={10} className="text-emerald-400" />
                    <span>{item?.condition || 'MISB'}</span>
                  </div>

                  {item?.scale && (
                    <div className="absolute bottom-2 right-2 bg-amber-500/20 backdrop-blur-md px-2 py-0.5 rounded text-[9px] font-black text-amber-300 border border-amber-500/30">
                      {item.scale}
                    </div>
                  )}
                </div>

                <div className="w-full text-center mt-3 space-y-1">
                  <h4 className="text-sm font-black text-white leading-snug line-clamp-1">
                    {item?.custom_name || 'Darth Vader — Revenge of the Sith'}
                  </h4>
                  <p className="text-[11px] text-zinc-400 font-medium truncate">
                    {item?.brand_name || 'Hot Toys'} {item?.line ? `· ${item.line}` : ''}
                  </p>

                  {/* Rating Stars */}
                  <div className="flex items-center justify-center gap-0.5 pt-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={11}
                        className={star <= (item?.rating || 5) ? 'text-amber-400 fill-amber-400' : 'text-zinc-700'}
                      />
                    ))}
                  </div>

                  {item?.notes && (
                    <p className="text-[10px] text-amber-200/80 italic line-clamp-2 px-2 pt-1 font-serif">
                      "{item.notes}"
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Card Footer Badge */}
            <div className="relative z-10 pt-2 border-t border-white/10 flex items-center justify-between text-[9px] text-zinc-400 font-mono">
              <div className="flex items-center gap-1">
                <Sparkles size={10} className="text-amber-400" />
                <span>⭐ Parte de mi colección</span>
              </div>
              <span className="font-bold text-white tracking-wider">collectibles.uy</span>
            </div>
          </div>
        </div>

        {/* Action Buttons: WhatsApp, Instagram, Copiar Link */}
        <div className="p-4 sm:p-6 border-t border-white/10 bg-zinc-900/60 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="px-3 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <MessageCircle size={14} />
              <span>WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadCard}
              className="px-3 py-2.5 bg-gradient-to-r from-pink-600/20 to-purple-600/20 hover:from-pink-600/30 hover:to-purple-600/30 text-pink-300 border border-pink-500/30 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <InstagramIcon size={14} />
              <span>Instagram</span>
            </button>

            <button
              type="button"
              onClick={handleShareFacebook}
              className="px-3 py-2.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Share2 size={14} />
              <span>Facebook</span>
            </button>

            <button
              type="button"
              onClick={handleCopyLink}
              className="px-3 py-2.5 bg-white/10 hover:bg-white/15 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copied ? '¡Copiado!' : 'Copiar Link'}</span>
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-500 px-1">
            <span>Enlace público: <code className="text-zinc-400 font-mono">{shareUrl.replace(/^https?:\/\//, '')}</code></span>
            <span>Precios e info privada ocultos 🔒</span>
          </div>
        </div>
      </div>
    </div>
  );
}
