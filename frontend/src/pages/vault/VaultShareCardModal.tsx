import React, { useRef, useState } from 'react';
import { X, Share2, Copy, Check, ShieldCheck, Sparkles, Image as ImageIcon, Star, Heart, MessageCircle, Layers, Lock, AlertTriangle } from 'lucide-react';

function InstagramIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

// Logo Watermark Badge Component
function CollectiblesWatermark({ isOverlay = false }: { isOverlay?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border backdrop-blur-md select-none pointer-events-none ${
      isOverlay
        ? 'bg-black/80 border-rose-500/40 text-rose-300 shadow-lg shadow-black/60'
        : 'bg-zinc-950/80 border-white/15 text-zinc-300'
    }`}>
      <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-rose-600 to-pink-500 flex items-center justify-center text-[9px] font-black text-white shadow-sm">
        C
      </div>
      <div className="flex flex-col text-left leading-none">
        <span className="text-[9px] font-black tracking-widest text-white">COLLECTIBLES</span>
        <span className="text-[6px] font-mono font-bold tracking-wider text-rose-400">VERIFIED VAULT</span>
      </div>
    </div>
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
  initialMode?: 'full' | 'single';
  collectorNickname?: string;
  collectorAvatarUrl?: string;
  collectorHandle?: string;
  isVaultPublic?: boolean;
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
  initialMode,
  collectorNickname,
  collectorAvatarUrl,
  collectorHandle = '@collector',
  isVaultPublic = true,
  vaultData
}: VaultShareCardModalProps) {
  // Mode: "Mi colección" ('full') vs "Una pieza" ('single')
  const [shareMode, setShareMode] = useState<'full' | 'single'>(
    initialMode || (isFullVault ? 'full' : 'single')
  );
  
  // Available items list for switching individual pieces
  const availableItems: ShareItemData[] = vaultData?.featured_items && vaultData.featured_items.length > 0
    ? vaultData.featured_items
    : item ? [item] : [];

  // Selected piece for single item mode or spotlight hero
  const [selectedPiece, setSelectedPiece] = useState<ShareItemData>(() => {
    return item || (availableItems[0] as ShareItemData) || {
      custom_name: 'Darth Vader — Revenge of the Sith',
      brand_name: 'Hot Toys',
      line: 'Movie Masterpiece Series',
      franchise: 'STAR WARS',
      scale: '1:6',
      height: '35 cm',
      condition: 'MISB',
      rating: 5,
      notes: 'Una de las piezas centrales de mi colección Star Wars.',
      official_image_url: 'https://images.unsplash.com/photo-1608889825205-eebdb9fc5806?auto=format&fit=crop&w=800&q=80',
      slug: 'darth-vader-hot-toys'
    };
  });

  const [copied, setCopied] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'story' | 'feed'>('story'); // story = 9:16, feed = 4:5
  const [imageSource, setImageSource] = useState<'official' | 'custom'>('official');
  const cardRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const currentItem = shareMode === 'single' ? selectedPiece : (item || selectedPiece);
  const primaryHandle = collectorHandle.startsWith('@') ? collectorHandle : `@${collectorHandle}`;
  const displayTitle = collectorNickname ? `${collectorNickname}’s Vault` : `${primaryHandle}’s Vault`;
  const initialLetter = (collectorNickname || primaryHandle.replace('@', '') || 'C').charAt(0).toUpperCase();

  const displayImage = currentItem ? (
    imageSource === 'custom' && currentItem.custom_image_url 
      ? currentItem.custom_image_url 
      : (currentItem.official_image_url || currentItem.custom_image_url || 'https://images.unsplash.com/photo-1608889825205-eebdb9fc5806?auto=format&fit=crop&w=800&q=80')
  ) : '';

  const isCurrentFull = shareMode === 'full';

  const shareUrl = isCurrentFull
    ? `${window.location.origin}/vault/${primaryHandle.replace('@', '')}`
    : `${window.location.origin}/vault/${primaryHandle.replace('@', '')}/${currentItem?.slug || (currentItem?.custom_name ? encodeURIComponent(currentItem.custom_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')) : 'pieza')}`;

  const shareText = isCurrentFull
    ? `🏆 Mira mi colección completa en My Vault (${vaultData?.total_items || availableItems.length || 3} piezas · ${vaultData?.total_franchises || 3} franquicias):\n${shareUrl}`
    : `⭐ ${currentItem?.custom_name || 'Figura'} (${currentItem?.brand_name || 'Colección'} · ${currentItem?.scale || 'Oficial'})\n📦 Estado: ${currentItem?.condition || 'MISB'}\n${currentItem?.notes ? `💬 "${currentItem.notes}"\n` : ''}🏷️ Ver ficha verificada en Collectibles.uy: ${shareUrl}`;

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
    alert('¡Enlace copiado! La ficha visual incluye la marca de agua de Collectibles.uy lista para capturar o compartir en tus historias o feed.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-xl bg-zinc-950 border border-white/10 rounded-3xl overflow-hidden shadow-2xl my-auto">
        
        {/* Top bar */}
        <div className="flex items-center justify-between p-4 px-6 border-b border-white/10 bg-zinc-900/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Share2 size={14} />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">
                Compartir en Redes Sociales
              </h3>
              <p className="text-[11px] text-zinc-400">Ficha visual con identidad y marca de agua Collectibles</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* PRIVACY WARNING IF VAULT IS PRIVATE */}
        {!isVaultPublic && (
          <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/25 flex items-center gap-2 text-xs text-amber-300">
            <AlertTriangle size={15} className="shrink-0 text-amber-400" />
            <span>
              <strong>Bóveda Privada:</strong> Sólo tú podrás ver este enlace a menos que actives la visibilidad pública en tu configuración.
            </span>
          </div>
        )}

        {/* SELECTOR PRINCIPAL: MI COLECCIÓN VS UNA PIEZA */}
        <div className="p-3 bg-zinc-900/40 border-b border-white/5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-zinc-400">¿Qué deseas compartir?</span>
            <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setShareMode('full')}
                className={`px-3 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition cursor-pointer ${
                  shareMode === 'full'
                    ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow font-black'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Layers size={12} />
                <span>Mi colección</span>
              </button>
              <button
                type="button"
                onClick={() => setShareMode('single')}
                className={`px-3 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition cursor-pointer ${
                  shareMode === 'single'
                    ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow font-black'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Star size={12} />
                <span>Una pieza</span>
              </button>
            </div>
          </div>

          {/* PIEZA INDIVIDUAL PICKER TABS */}
          {shareMode === 'single' && availableItems.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-white/5">
              <span className="text-[10px] text-zinc-500 font-bold shrink-0">Elegir pieza:</span>
              {availableItems.map((pi, idx) => {
                const isSelected = selectedPiece.slug === pi.slug || selectedPiece.custom_name === pi.custom_name;
                return (
                  <button
                    key={pi.id || idx}
                    type="button"
                    onClick={() => {
                      setSelectedPiece(pi);
                      setImageSource('official');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0 transition cursor-pointer flex items-center gap-1 border ${
                      isSelected
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm'
                        : 'bg-zinc-900 text-zinc-400 hover:text-white border-white/10'
                    }`}
                  >
                    <span>{pi.custom_name.split('—')[0] || pi.custom_name}</span>
                    {isSelected && <Check size={10} className="text-rose-400" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Controls: Formato + Foto Selector */}
        <div className="px-4 py-2 bg-zinc-900/20 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Format selector */}
          <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setAspectRatio('story')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                aspectRatio === 'story'
                  ? 'bg-zinc-700 text-white shadow'
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
                  ? 'bg-zinc-700 text-white shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Feed 4:5
            </button>
          </div>

          {/* Photo source toggle (only for single item) */}
          {!isCurrentFull && currentItem?.custom_image_url && currentItem?.official_image_url && (
            <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setImageSource('official')}
                className={`px-2.5 py-1 rounded-lg font-bold text-[10px] transition cursor-pointer ${
                  imageSource === 'official'
                    ? 'bg-rose-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Foto catálogo
              </button>
              <button
                type="button"
                onClick={() => setImageSource('custom')}
                className={`px-2.5 py-1 rounded-lg font-bold text-[10px] transition cursor-pointer ${
                  imageSource === 'custom'
                    ? 'bg-rose-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Mi foto vitrina
              </button>
            </div>
          )}
        </div>

        {/* Visual Share Card Canvas Area */}
        <div className="p-4 sm:p-6 flex justify-center bg-zinc-950 overflow-hidden">
          <div
            ref={cardRef}
            className={`w-full max-w-[340px] bg-gradient-to-b from-zinc-900 via-zinc-950 to-black border-2 border-rose-500/40 rounded-3xl p-5 shadow-2xl relative overflow-hidden flex flex-col justify-between transition-all duration-300 ${
              aspectRatio === 'story' ? 'aspect-[9/16] min-h-[500px]' : 'aspect-[4/5] min-h-[420px]'
            }`}
          >
            {/* Ambient rose glow */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-rose-600/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-36 h-36 bg-pink-600/10 rounded-full blur-2xl pointer-events-none" />

            {/* Diagonal subtle watermark background pattern */}
            <div className="absolute inset-0 opacity-[0.03] select-none pointer-events-none flex flex-col justify-around rotate-[-25deg] text-[18px] font-black tracking-widest text-white whitespace-nowrap overflow-hidden">
              <div>COLLECTIBLES.UY · MY VAULT · COLLECTIBLES.UY · MY VAULT</div>
              <div>COLLECTIBLES.UY · MY VAULT · COLLECTIBLES.UY · MY VAULT</div>
              <div>COLLECTIBLES.UY · MY VAULT · COLLECTIBLES.UY · MY VAULT</div>
              <div>COLLECTIBLES.UY · MY VAULT · COLLECTIBLES.UY · MY VAULT</div>
            </div>

            {/* Card Header with Collector Public Identity */}
            <div className="relative z-10">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  {collectorAvatarUrl ? (
                    <img
                      src={collectorAvatarUrl}
                      alt={collectorNickname || primaryHandle}
                      className="w-7 h-7 rounded-full object-cover border border-rose-500/40 shadow"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-rose-600 to-pink-500 flex items-center justify-center text-[11px] font-black text-white shadow">
                      {initialLetter}
                    </div>
                  )}
                  <div className="flex flex-col text-left leading-tight">
                    <span className="text-xs font-black text-white">{displayTitle}</span>
                    {collectorNickname && (
                      <span className="text-[9px] font-mono text-zinc-400">{primaryHandle}</span>
                    )}
                  </div>
                </div>

                <CollectiblesWatermark isOverlay={false} />
              </div>

              {!isCurrentFull && currentItem?.franchise && (
                <div className="mt-2.5 flex items-center justify-between">
                  <span className="text-[9px] font-black tracking-widest uppercase text-rose-300 bg-rose-500/15 border border-rose-500/20 px-2 py-0.5 rounded">
                    {currentItem.franchise}
                  </span>
                  {currentItem.is_favorite && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-black text-rose-400">
                      <Heart size={10} className="fill-rose-400" /> Favorita
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Main Visual Centerpiece */}
            {isCurrentFull ? (
              /* "Mi colección" Layout: Hero Spotlight Figure + Stats */
              <div className="relative z-10 py-2 space-y-3 my-auto flex flex-col items-center">
                <div className="w-full aspect-square max-h-[190px] bg-gradient-to-b from-zinc-900 to-black rounded-2xl border border-white/10 flex items-center justify-center overflow-hidden relative shadow-inner p-2">
                  <img
                    src={displayImage}
                    alt={currentItem?.custom_name}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1608889825205-eebdb9fc5806?auto=format&fit=crop&w=800&q=80';
                    }}
                    className="w-full h-full object-contain drop-shadow-2xl"
                  />
                  <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded text-[8px] font-bold text-rose-300 border border-rose-500/30">
                    ⭐ Pieza Destacada
                  </div>
                </div>

                <div className="text-center space-y-1 w-full">
                  <h4 className="text-sm font-black text-white leading-tight">
                    {currentItem?.custom_name}
                  </h4>
                  
                  {/* Stats Badges */}
                  <div className="bg-rose-500/10 border border-rose-500/25 rounded-xl py-1.5 px-3 flex items-center justify-around text-center text-xs font-mono font-bold text-rose-300">
                    <div>
                      <span className="text-white font-black">{vaultData?.total_items || availableItems.length || 3}</span> piezas
                    </div>
                    <div className="text-rose-500/40">·</div>
                    <div>
                      <span className="text-white font-black">{vaultData?.total_franchises || 3}</span> franquicias
                    </div>
                    <div className="text-rose-500/40">·</div>
                    <div>
                      <span className="text-white font-black">{vaultData?.total_brands || 3}</span> marcas
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* "Una pieza" Layout: 55-60% Photo + Key Specs */
              <div className="relative z-10 my-auto py-1 flex flex-col items-center">
                <div className="w-full aspect-square max-h-[220px] bg-gradient-to-b from-zinc-900 to-black rounded-2xl border border-white/10 flex items-center justify-center overflow-hidden relative shadow-inner p-2">
                  <img
                    src={displayImage}
                    alt={currentItem?.custom_name}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1608889825205-eebdb9fc5806?auto=format&fit=crop&w=800&q=80';
                    }}
                    className="w-full h-full object-contain drop-shadow-2xl"
                  />

                  <div className="absolute bottom-2 left-2 bg-black/85 backdrop-blur-md px-2 py-0.5 rounded text-[9px] font-bold text-zinc-300 border border-white/10 flex items-center gap-1">
                    <ShieldCheck size={10} className="text-rose-400" />
                    <span>{currentItem?.condition || 'MISB'}</span>
                  </div>

                  {currentItem?.scale && (
                    <div className="absolute bottom-2 right-2 bg-rose-500/20 backdrop-blur-md px-2 py-0.5 rounded text-[9px] font-black text-rose-300 border border-rose-500/30">
                      {currentItem.scale}
                    </div>
                  )}
                </div>

                <div className="w-full text-center mt-2.5 space-y-1">
                  <h4 className="text-sm font-black text-white leading-snug line-clamp-1">
                    {currentItem?.custom_name || 'Darth Vader — Revenge of the Sith'}
                  </h4>
                  <p className="text-[11px] text-zinc-400 font-medium truncate">
                    {currentItem?.brand_name || 'Hot Toys'} {currentItem?.line ? `· ${currentItem.line}` : ''}
                  </p>

                  {/* Rating Stars */}
                  <div className="flex items-center justify-center gap-0.5 pt-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={11}
                        className={star <= (currentItem?.rating || 5) ? 'text-rose-400 fill-rose-400' : 'text-zinc-700'}
                      />
                    ))}
                  </div>

                  {currentItem?.notes && (
                    <p className="text-[10px] text-rose-200/80 italic line-clamp-2 px-2 pt-0.5 font-serif">
                      "{currentItem.notes}"
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Card Footer with Verified Badge & Collectibles Logo */}
            <div className="relative z-10 pt-2 border-t border-white/10 flex items-center justify-between text-[9px] text-zinc-400 font-mono">
              <div className="flex items-center gap-1">
                <Sparkles size={10} className="text-rose-400" />
                <span>⭐ Colección Verificada</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white tracking-wider">collectibles.uy</span>
              </div>
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
            <span>Enlace: <code className="text-zinc-400 font-mono">{shareUrl.replace(/^https?:\/\//, '')}</code></span>
            <span>Marca de agua incluida 🔒</span>
          </div>
        </div>
      </div>
    </div>
  );
}

