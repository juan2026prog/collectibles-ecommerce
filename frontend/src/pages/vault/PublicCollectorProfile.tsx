import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Archive, ShieldCheck, Sparkles, Image as ImageIcon, Share2, Star, Heart, ArrowLeft, ArrowRight, ExternalLink, Globe } from 'lucide-react';
import SEO from '../../components/SEO';
import { VaultShareCardModal, type ShareItemData } from './VaultShareCardModal';

// Demo fallback items for public showcase
const PUBLIC_DEMO_ITEMS: Record<string, ShareItemData> = {
  'darth-vader-hot-toys': {
    id: 'demo-vader',
    custom_name: 'Darth Vader — Revenge of the Sith',
    brand_name: 'Hot Toys',
    line: 'Movie Masterpiece Series',
    franchise: 'STAR WARS',
    scale: '1:6',
    height: '35 cm',
    condition: 'MISB',
    box_condition: 'SEALED',
    rating: 5,
    is_favorite: true,
    is_featured: true,
    notes: 'Una de las piezas centrales de mi colección Star Wars.',
    official_image_url: 'https://images.unsplash.com/photo-1585676623547-a006c6460114?auto=format&fit=crop&w=800&q=80',
    slug: 'darth-vader-hot-toys'
  },
  'son-goku-sh-figuarts': {
    id: 'demo-goku',
    custom_name: 'Son Goku — A Saiyan Raised on Earth',
    brand_name: 'Bandai Spirits · S.H.Figuarts',
    line: 'S.H.Figuarts',
    franchise: 'DRAGON BALL Z',
    scale: '14 CM',
    height: '14 cm',
    condition: 'Open / Complete',
    box_condition: 'OPEN_BOX',
    rating: 5,
    is_favorite: false,
    is_featured: true,
    notes: 'Mi Goku definitivo para la línea S.H.Figuarts.',
    official_image_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80',
    slug: 'son-goku-sh-figuarts'
  },
  'batman-1989-funko-die-cast': {
    id: 'demo-batman',
    custom_name: 'Batman 1989 #03',
    brand_name: 'Funko · Pop! Die-Cast',
    line: 'Pop! Die-Cast',
    franchise: 'BATMAN',
    scale: 'DIE-CAST',
    height: '10,2 cm',
    condition: 'Exclusive · MISB',
    box_condition: 'ACRYLIC_CASE',
    rating: 4,
    is_favorite: false,
    is_featured: true,
    notes: 'Batman 1989 es una de mis películas favoritas.',
    official_image_url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=800&q=80',
    slug: 'batman-1989-funko-die-cast'
  }
};

export default function PublicCollectorProfile() {
  const { username, itemSlug } = useParams<{ username: string; itemSlug?: string }>();
  const [profile, setProfile] = useState<any>(null);
  const [publicItems, setPublicItems] = useState<ShareItemData[]>([]);
  const [singleItem, setSingleItem] = useState<ShareItemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [selectedShareItem, setSelectedShareItem] = useState<ShareItemData | null>(null);

  const cleanUsername = (username || 'collector').replace(/^@/, '');
  const handleTag = `@${cleanUsername}`;

  useEffect(() => {
    loadPublicData();
  }, [cleanUsername, itemSlug]);

  const loadPublicData = async () => {
    try {
      setLoading(true);

      // Check if viewing single item
      if (itemSlug) {
        // Check demo map first
        if (PUBLIC_DEMO_ITEMS[itemSlug]) {
          setSingleItem({
            ...PUBLIC_DEMO_ITEMS[itemSlug],
            collector_handle: handleTag
          });
          setProfile({ display_name: handleTag, bio: 'Coleccionista verificado en Collectibles.uy' });
          setLoading(false);
          return;
        }

        // Query Supabase for public item by slug or id
        const { data: itemData } = await supabase
          .from('vault_items')
          .select('*')
          .eq('visibility', 'PUBLIC')
          .or(`id.eq.${itemSlug},slug.eq.${itemSlug}`)
          .maybeSingle();

        if (itemData) {
          setSingleItem({
            id: itemData.id,
            custom_name: itemData.custom_name,
            brand_name: itemData.brand_name,
            franchise: itemData.franchise,
            line: itemData.line,
            scale: itemData.scale,
            height: itemData.height,
            condition: itemData.condition,
            box_condition: itemData.box_condition,
            rating: itemData.rating,
            is_favorite: itemData.is_favorite,
            is_featured: itemData.is_featured,
            notes: itemData.notes,
            official_image_url: itemData.official_image_url || itemData.custom_image_url,
            custom_image_url: itemData.custom_image_url,
            collector_handle: handleTag,
            slug: itemData.slug || itemData.id
          });
        }
      }

      // Query Profile
      const { data: profData } = await supabase
        .from('vault_user_profiles')
        .select('*')
        .eq('display_name', cleanUsername)
        .maybeSingle();

      if (profData) {
        setProfile(profData);
        const { data: itemsData } = await supabase
          .from('vault_items')
          .select('*')
          .eq('user_id', profData.user_id)
          .eq('visibility', 'PUBLIC');

        if (itemsData && itemsData.length > 0) {
          setPublicItems(itemsData.map(i => ({
            id: i.id,
            custom_name: i.custom_name,
            brand_name: i.brand_name,
            franchise: i.franchise,
            line: i.line,
            scale: i.scale,
            condition: i.condition,
            box_condition: i.box_condition,
            rating: i.rating,
            is_favorite: i.is_favorite,
            is_featured: i.is_featured,
            notes: i.notes,
            official_image_url: i.official_image_url || i.custom_image_url,
            custom_image_url: i.custom_image_url,
            collector_handle: handleTag,
            slug: i.slug || i.id
          })));
        } else {
          setPublicItems(Object.values(PUBLIC_DEMO_ITEMS).map(d => ({ ...d, collector_handle: handleTag })));
        }
      } else {
        // Fallback demo showcase profile
        setProfile({
          display_name: handleTag,
          bio: 'Coleccionista verificado de figuras y réplicas oficiales en Collectibles.uy'
        });
        setPublicItems(Object.values(PUBLIC_DEMO_ITEMS).map(d => ({ ...d, collector_handle: handleTag })));
      }
    } catch (err) {
      console.error('Error loading public profile:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="py-28 text-center text-zinc-500">Cargando vitrina de coleccionista...</div>;
  }

  // 1. PUBLIC SINGLE PIECE VIEW (/vault/@collector/:itemSlug)
  if (singleItem) {
    const itemImage = singleItem.custom_image_url || singleItem.official_image_url;

    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-white space-y-8 animate-fade-in">
        <SEO
          title={`${singleItem.custom_name} | Colección de ${handleTag} | Collectibles`}
          description={`Ficha verificada de ${singleItem.custom_name} (${singleItem.brand_name || 'Colección'} · ${singleItem.scale || 'Oficial'}). Estado: ${singleItem.condition}.`}
        />

        {/* Back Link to Collector Full Showcase */}
        <div className="flex items-center justify-between">
          <Link
            to={`/vault/${cleanUsername}`}
            className="inline-flex items-center gap-2 text-xs font-bold text-amber-400 hover:text-amber-300 transition group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            <span>Ver toda la colección de {handleTag}</span>
          </Link>

          <button
            type="button"
            onClick={() => {
              setSelectedShareItem(singleItem);
              setIsShareModalOpen(true);
            }}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-black text-xs rounded-xl flex items-center gap-1.5 transition shadow-lg shadow-amber-500/20 cursor-pointer"
          >
            <Share2 size={14} />
            <span>Compartir Ficha ↗</span>
          </button>
        </div>

        {/* Product Card Details */}
        <div className="bg-gradient-to-b from-zinc-900 via-zinc-950 to-black border-2 border-amber-500/30 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            
            {/* Big Photo */}
            <div className="md:col-span-5">
              <div className="w-full aspect-square bg-zinc-950 rounded-2xl border border-white/10 p-3 flex items-center justify-center overflow-hidden relative shadow-inner">
                {itemImage ? (
                  <img src={itemImage} alt={singleItem.custom_name} className="w-full h-full object-contain drop-shadow-2xl" />
                ) : (
                  <ImageIcon size={48} className="text-zinc-600" />
                )}

                <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-bold text-zinc-300 border border-white/10 flex items-center gap-1">
                  <ShieldCheck size={12} className="text-emerald-400" />
                  <span>{singleItem.condition}</span>
                </div>
              </div>
            </div>

            {/* Spec details */}
            <div className="md:col-span-7 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {singleItem.franchise && (
                  <span className="text-[10px] font-black tracking-widest uppercase bg-amber-500/15 border border-amber-500/30 text-amber-400 px-2.5 py-0.5 rounded-md">
                    {singleItem.franchise}
                  </span>
                )}
                {singleItem.scale && (
                  <span className="text-[10px] font-black tracking-wider uppercase bg-zinc-800 text-zinc-300 px-2.5 py-0.5 rounded-md">
                    {singleItem.scale}
                  </span>
                )}
              </div>

              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                  {singleItem.custom_name}
                </h1>
                <p className="text-sm font-semibold text-zinc-400 mt-1">
                  {singleItem.brand_name} {singleItem.line ? `· ${singleItem.line}` : ''}
                </p>
              </div>

              {/* Collector Profile Badge */}
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-zinc-900/80 border border-white/10">
                <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 text-sm font-black">
                  C
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 uppercase font-bold block">Pieza de la vitrina de</span>
                  <span className="text-xs font-black text-amber-400">{handleTag}</span>
                </div>
              </div>

              {/* Rating stars */}
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={16}
                    className={star <= (singleItem.rating || 5) ? 'text-amber-400 fill-amber-400' : 'text-zinc-700'}
                  />
                ))}
              </div>

              {singleItem.notes && (
                <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-4 font-serif italic text-sm text-zinc-300">
                  "{singleItem.notes}"
                </div>
              )}

              <div className="pt-2">
                <Link
                  to={`/vault/${cleanUsername}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl border border-white/10 transition"
                >
                  <span>Ver colección completa de {handleTag} →</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {isShareModalOpen && selectedShareItem && (
          <VaultShareCardModal
            isOpen={isShareModalOpen}
            onClose={() => setIsShareModalOpen(false)}
            item={selectedShareItem}
            isFullVault={false}
          />
        )}
      </div>
    );
  }

  // 2. PUBLIC FULL COLLECTION SHOWCASE (/vault/@collector)
  const totalItemsCount = publicItems.length;
  const totalFranchisesCount = new Set(publicItems.map(p => p.franchise?.toUpperCase()).filter(Boolean)).size || 1;
  const totalBrandsCount = new Set(publicItems.map(p => p.brand_name?.toUpperCase()).filter(Boolean)).size || 1;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 text-white space-y-10 animate-fade-in">
      <SEO
        title={`La colección de ${handleTag} | My Vault | Collectibles`}
        description={`Explora la vitrina de coleccionables de ${handleTag}: ${totalItemsCount} figuras verificadas, ${totalFranchisesCount} franquicias y ${totalBrandsCount} marcas.`}
      />

      {/* Public Header */}
      <div className="bg-gradient-to-br from-amber-950/40 via-zinc-900 to-zinc-950 border border-amber-500/25 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-black uppercase tracking-widest">
              <Globe size={13} />
              <span>Vitrina Pública de Coleccionista</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black text-white">
              La colección de <span className="text-amber-400">{handleTag}</span>
            </h1>

            <p className="text-sm font-bold text-zinc-300 flex items-center gap-2">
              <span className="text-white font-black">{totalItemsCount} piezas</span>
              <span className="text-zinc-600">·</span>
              <span className="text-white font-black">{totalFranchisesCount} franquicias</span>
              <span className="text-zinc-600">·</span>
              <span className="text-white font-black">{totalBrandsCount} marcas</span>
            </p>

            <p className="text-xs text-zinc-400 max-w-xl leading-relaxed">
              {profile?.bio || 'Colección personal verificada en Collectibles.uy'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsShareModalOpen(true)}
            className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-black text-xs rounded-xl flex items-center gap-2 transition shadow-lg shadow-amber-500/20 cursor-pointer self-start md:self-auto"
          >
            <Share2 size={14} />
            <span>Compartir esta vitrina</span>
          </button>
        </div>
      </div>

      {/* Grid of Public Pieces */}
      <div className="space-y-4">
        <h2 className="text-xl font-black text-white flex items-center gap-2">
          <span>Piezas en Exhibición ({publicItems.length})</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {publicItems.map((piece, idx) => {
            const cardImg = piece.custom_image_url || piece.official_image_url;

            return (
              <div
                key={piece.id || idx}
                className="bg-zinc-900/90 border border-white/10 hover:border-amber-500/40 rounded-3xl p-5 shadow-xl transition-all duration-300 flex flex-col justify-between group"
              >
                <div>
                  <div className="w-full aspect-square bg-zinc-950 rounded-2xl border border-white/10 p-3 mb-4 flex items-center justify-center overflow-hidden relative">
                    {cardImg ? (
                      <img src={cardImg} alt={piece.custom_name} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <ImageIcon size={36} className="text-zinc-600" />
                    )}

                    {piece.is_favorite && (
                      <div className="absolute top-3 right-3 bg-rose-500/20 border border-rose-500/30 text-rose-300 px-2.5 py-1 rounded-full text-[10px] font-black flex items-center gap-1 shadow">
                        <Heart size={11} className="fill-rose-400 text-rose-400" />
                        <span>Favorita</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    {piece.franchise && (
                      <span className="text-[9px] font-black tracking-widest uppercase bg-amber-500/15 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded-md">
                        {piece.franchise}
                      </span>
                    )}
                    {piece.scale && (
                      <span className="text-[9px] font-black uppercase bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-md">
                        {piece.scale}
                      </span>
                    )}
                    {piece.condition && (
                      <span className="text-[9px] font-black uppercase bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-md">
                        {piece.condition}
                      </span>
                    )}
                  </div>

                  <h3 className="font-black text-base text-white line-clamp-1 group-hover:text-amber-400 transition">
                    {piece.custom_name}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5 truncate">
                    {piece.brand_name} {piece.line ? `· ${piece.line}` : ''}
                  </p>

                  <div className="flex items-center gap-1 mt-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={12}
                        className={star <= (piece.rating || 5) ? 'text-amber-400 fill-amber-400' : 'text-zinc-700'}
                      />
                    ))}
                  </div>

                  {piece.notes && (
                    <p className="text-xs text-zinc-400 italic line-clamp-2 mt-2 font-serif bg-zinc-950/40 p-2 rounded-xl border border-white/5">
                      "{piece.notes}"
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 mt-4 border-t border-white/10">
                  <Link
                    to={`/vault/${cleanUsername}/${piece.slug || piece.id}`}
                    className="text-xs font-black text-amber-400 hover:text-amber-300 flex items-center gap-1"
                  >
                    <span>Ver ficha completa</span>
                    <ArrowRight size={13} />
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedShareItem(piece);
                      setIsShareModalOpen(true);
                    }}
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-white/10 cursor-pointer"
                  >
                    <Share2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Share Modal */}
      {isShareModalOpen && (
        <VaultShareCardModal
          isOpen={isShareModalOpen}
          onClose={() => {
            setIsShareModalOpen(false);
            setSelectedShareItem(null);
          }}
          item={selectedShareItem}
          isFullVault={!selectedShareItem}
          vaultData={{
            collector_handle: handleTag,
            total_items: totalItemsCount,
            total_franchises: totalFranchisesCount,
            total_brands: totalBrandsCount,
            featured_items: publicItems.slice(0, 3)
          }}
        />
      )}
    </div>
  );
}

