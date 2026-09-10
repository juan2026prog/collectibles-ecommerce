import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useFeatures } from '../../contexts/FeatureToggleContext';
import { Archive, Plus, Share2, Star, ExternalLink, Lock, CheckCircle2, Sparkles, Image as ImageIcon, ShoppingBag, Eye, Heart, Globe, Settings, SlidersHorizontal, ArrowRight, Percent, PackagePlus, Search, X, Layers, Check } from 'lucide-react';
import SEO from '../../components/SEO';
import { VaultShareCardModal, type ShareItemData } from './VaultShareCardModal';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useCartContext } from '../../contexts/CartContext';
import { getProductImage } from '../../lib/imageUtils';

// 3 FIGURAS REALES DEMO QUE DAN VIDA A MY VAULT DESDE EL PRIMER MOMENTO
const DEMO_VAULT_PIECES: ShareItemData[] = [
  {
    id: 'demo-vader',
    custom_name: 'Darth Vader — Revenge of the Sith',
    brand_name: 'Hot Toys',
    line: 'Movie Masterpiece Series',
    franchise: 'STAR WARS',
    scale: '1:6',
    height: '35 cm',
    condition: 'MISB',
    box_condition: 'SEALED',
    status: 'OWNED',
    rating: 5,
    is_favorite: true,
    is_featured: true,
    purchase_date: 'Agosto 2026',
    notes: 'Una de las piezas centrales de mi colección Star Wars.',
    official_image_url: 'https://images.unsplash.com/photo-1608889825205-eebdb9fc5806?auto=format&fit=crop&w=800&q=80',
    slug: 'darth-vader-hot-toys'
  },
  {
    id: 'demo-goku',
    custom_name: 'Son Goku — A Saiyan Raised on Earth',
    brand_name: 'Bandai Spirits · S.H.Figuarts',
    line: 'S.H.Figuarts',
    franchise: 'DRAGON BALL Z',
    scale: '14 CM',
    height: '14 cm',
    condition: 'Open / Complete',
    box_condition: 'OPEN_BOX',
    status: 'OWNED',
    rating: 5,
    is_favorite: false,
    is_featured: true,
    purchase_date: 'Marzo 2026',
    notes: 'Mi Goku definitivo para la línea S.H.Figuarts.',
    official_image_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80',
    slug: 'son-goku-sh-figuarts'
  },
  {
    id: 'demo-batman',
    custom_name: 'Batman 1989 #03',
    brand_name: 'Funko · Pop! Die-Cast',
    line: 'Pop! Die-Cast',
    franchise: 'BATMAN',
    scale: 'DIE-CAST',
    height: '10,2 cm',
    condition: 'Exclusive · MISB',
    box_condition: 'ACRYLIC_CASE',
    status: 'OWNED',
    rating: 4,
    is_favorite: false,
    is_featured: true,
    purchase_date: 'Enero 2026',
    notes: 'Batman 1989 es una de mis películas favoritas.',
    official_image_url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=800&q=80',
    slug: 'batman-1989-funko-die-cast'
  }
];

export default function VaultDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { features } = useFeatures();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importingOrders, setImportingOrders] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  
  // Modals state
  const [selectedShareItem, setSelectedShareItem] = useState<ShareItemData | null>(null);
  const [isShareFullVaultOpen, setIsShareFullVaultOpen] = useState(false);
  const [isEditVaultOpen, setIsEditVaultOpen] = useState(false);
  const [isAddPieceModalOpen, setIsAddPieceModalOpen] = useState(false);
  
  // Catalog search modal state
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const [catalogSearchResults, setCatalogSearchResults] = useState<any[]>([]);
  const [searchingCatalog, setSearchingCatalog] = useState(false);
  
  // Collector Profile Identity
  const [collectorNickname, setCollectorNickname] = useState<string>('');
  const [collectorAvatarUrl, setCollectorAvatarUrl] = useState<string>('');
  const [isVaultPublic, setIsVaultPublic] = useState(true);
  const [filterFranchise, setFilterFranchise] = useState<string>('ALL');

  // Configuración de completitud (desde Admin site_settings)
  const [completionEnabled, setCompletionEnabled] = useState(false);
  const [catalogSource, setCatalogSource] = useState('store_catalog');
  const [completionPercent, setCompletionPercent] = useState<number>(0);
  const [missingPieces, setMissingPieces] = useState<any[]>([]);

  const { formatCurrencyPrice } = useCurrency();
  const { addToCart } = useCartContext();

  const userHandle = user?.email ? `@${user.email.split('@')[0]}` : '@collector';
  const displayTitle = collectorNickname.trim() 
    ? `${collectorNickname.trim()}’s Vault` 
    : `${user?.email?.split('@')[0] || 'Coleccionista'}’s Vault`;

  useEffect(() => {
    if (user) {
      loadVault();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadVault = async () => {
    try {
      setLoading(true);
      const [vaultRes, settingsRes, profileRes] = await Promise.all([
        supabase
          .from('vault_items')
          .select('*')
          .eq('user_id', user?.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('site_settings')
          .select('key, value')
          .in('key', ['vault_completion_enabled', 'vault_catalog_source']),
        supabase
          .from('profiles')
          .select('collector_nickname, collector_avatar_url')
          .eq('id', user?.id)
          .single()
      ]);

      if (profileRes.data) {
        setCollectorNickname(profileRes.data.collector_nickname || '');
        setCollectorAvatarUrl(profileRes.data.collector_avatar_url || '');
      }

      const isEnabled = settingsRes.data?.find(s => s.key === 'vault_completion_enabled')?.value === 'true';
      const source = settingsRes.data?.find(s => s.key === 'vault_catalog_source')?.value || 'store_catalog';
      setCompletionEnabled(isEnabled);
      setCatalogSource(source);

      const dbItems = vaultRes.data || [];
      setItems(dbItems);

      // Si está activada la completitud en Admin, calculamos el % y las piezas faltantes
      if (isEnabled && dbItems.length > 0) {
        const userWaveNames = Array.from(new Set(dbItems.map((i: any) => i.line).filter(Boolean)));
        let catalogQuery = supabase.from('products').select('id, title, slug, base_price, brand:brands(name), category_id');
        
        if (source === 'wave_series' && userWaveNames.length > 0) {
          catalogQuery = catalogQuery.limit(50);
        }

        const { data: catalogProducts } = await catalogQuery.limit(50);

        if (catalogProducts && catalogProducts.length > 0) {
          const ownedProductIds = new Set(dbItems.map((i: any) => i.product_id).filter(Boolean));
          const ownedNames = new Set(dbItems.map((i: any) => (i.custom_name || '').toLowerCase().trim()));

          const missing = catalogProducts.filter(p => !ownedProductIds.has(p.id) && !ownedNames.has(p.title.toLowerCase().trim()));
          setMissingPieces(missing.slice(0, 4));

          const totalPossible = Math.max(catalogProducts.length, dbItems.length);
          const percent = Math.min(100, Math.round((dbItems.length / totalPossible) * 100));
          setCompletionPercent(percent);
        }
      }
    } catch (err) {
      console.error('Error loading vault:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchCatalog = async (q: string) => {
    setCatalogSearchQuery(q);
    if (!q.trim()) {
      setCatalogSearchResults([]);
      return;
    }

    setSearchingCatalog(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, title, slug, base_price, brand:brands(name), category:categories(name)')
        .ilike('title', `%${q.trim()}%`)
        .limit(8);

      if (!error && data) {
        setCatalogSearchResults(data);
      }
    } catch (err) {
      console.error('Error searching catalog:', err);
    } finally {
      setSearchingCatalog(false);
    }
  };

  const handleAddPieceClick = () => {
    if (features.collectorVaultCatalogSearchEnabled) {
      setIsAddPieceModalOpen(true);
    } else {
      navigate('/vault/item/new');
    }
  };

  const handleImportPastOrders = async () => {
    if (!user) return;
    setImportingOrders(true);
    setImportMessage(null);

    try {
      const { data: orders, error: ordersErr } = await supabase
        .from('orders')
        .select(`
          id, created_at, status, total_amount,
          items:order_items(id, product_id, title, price, quantity, image_url)
        `)
        .eq('user_id', user.id);

      if (ordersErr || !orders || orders.length === 0) {
        setImportMessage('No encontramos compras anteriores en tu cuenta de Collectibles.');
        return;
      }

      const existingProductIds = new Set(items.map(i => i.product_id).filter(Boolean));
      let importedCount = 0;

      for (const order of orders) {
        if (!order.items || !Array.isArray(order.items)) continue;
        for (const orderItem of order.items) {
          if (orderItem.product_id && existingProductIds.has(orderItem.product_id)) {
            continue;
          }

          const vaultPayload = {
            user_id: user.id,
            product_id: orderItem.product_id || null,
            custom_name: orderItem.title || 'Coleccionable Adquirido',
            purchase_price: orderItem.price || null,
            purchase_date: order.created_at ? order.created_at.split('T')[0] : null,
            official_image_url: orderItem.image_url || null,
            status: 'OWNED',
            condition: 'MINT',
            box_condition: 'SEALED',
            visibility: 'PUBLIC'
          };

          const { error: insErr } = await supabase.from('vault_items').insert(vaultPayload);
          if (!insErr) importedCount++;
        }
      }

      if (importedCount > 0) {
        setImportMessage(`¡Éxito! Se importaron ${importedCount} piezas de tus compras a tu Vault.`);
        loadVault();
      } else {
        setImportMessage('Todas las piezas de tus órdenes ya se encontraban registradas en tu Vault.');
      }
    } catch (err) {
      console.error(err);
      setImportMessage('Ocurrió un error al importar tus órdenes.');
    } finally {
      setImportingOrders(false);
    }
  };

  // Determine active displayed pieces (real database items or lively demo showcase)
  const isDemoMode = items.length === 0;
  const activePieces: ShareItemData[] = isDemoMode
    ? DEMO_VAULT_PIECES
    : items.map((dbItem) => ({
        id: dbItem.id,
        custom_name: dbItem.custom_name || 'Pieza Coleccionable',
        brand_name: dbItem.brand_name || 'Colección',
        franchise: dbItem.franchise || 'GENERAL',
        scale: dbItem.scale || '1:10',
        height: dbItem.height || null,
        line: dbItem.line || null,
        condition: dbItem.condition || 'MINT',
        box_condition: dbItem.box_condition || 'SEALED',
        status: dbItem.status || 'OWNED',
        rating: dbItem.rating || 5,
        is_favorite: !!dbItem.is_favorite,
        is_featured: !!dbItem.is_featured,
        notes: dbItem.notes || null,
        official_image_url: dbItem.official_image_url || dbItem.custom_image_url,
        custom_image_url: dbItem.custom_image_url,
        purchase_date: dbItem.purchase_date,
        collector_handle: collectorNickname.trim() ? `${collectorNickname.trim()}’s Vault` : userHandle,
        slug: dbItem.slug || (dbItem.custom_name ? encodeURIComponent(dbItem.custom_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')) : dbItem.id)
      }));

  // Dynamic Metrics Calculation: X piezas · Y franquicias · Z marcas
  const totalPieces = activePieces.length;
  const uniqueFranchises = new Set(activePieces.map(p => p.franchise?.toUpperCase()).filter(Boolean)).size || 1;
  const uniqueBrands = new Set(activePieces.map(p => p.brand_name?.toUpperCase()).filter(Boolean)).size || 1;

  const filteredPieces = filterFranchise === 'ALL'
    ? activePieces
    : activePieces.filter(p => p.franchise?.toUpperCase() === filterFranchise);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white space-y-8 animate-fade-in">
      <SEO
        title={`${displayTitle} | My Vault | Collectibles`}
        description={`Vitrina digital de coleccionables de ${displayTitle}: ${totalPieces} piezas, ${uniqueFranchises} franquicias y ${uniqueBrands} marcas.`}
      />

      {/* BLOQUE SUPERIOR DE MY VAULT (MAGENTA BRAND THEME) */}
      <div className="bg-gradient-to-br from-rose-950/40 via-zinc-900/90 to-zinc-950 border border-rose-500/25 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start sm:items-center gap-4">
            {/* Avatar 1:1 circular */}
            <div className="relative shrink-0">
              {collectorAvatarUrl ? (
                <img
                  src={collectorAvatarUrl}
                  alt={displayTitle}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-rose-500 shadow-xl shadow-rose-500/20"
                />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-rose-600 to-pink-500 border-2 border-rose-400 flex items-center justify-center text-2xl font-black text-white shadow-xl shadow-rose-500/20">
                  {(collectorNickname.trim() || user?.email?.split('@')[0] || 'C')[0].toUpperCase()}
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-black border border-rose-500 flex items-center justify-center text-[10px]">
                ⭐
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-widest uppercase text-rose-400 bg-rose-500/15 border border-rose-500/30 px-3 py-0.5 rounded-full">
                  My Vault
                </span>
                <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                  isVaultPublic 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                    : 'bg-zinc-800 text-zinc-400 border-white/10'
                }`}>
                  {isVaultPublic ? <Globe size={11} /> : <Lock size={11} />}
                  <span>{isVaultPublic ? 'Vault Público' : 'Vault Privado'}</span>
                </span>
              </div>

              {/* TÍTULO PROTAGONISTA: [Avatar] Juanma’s Vault */}
              <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                {displayTitle}
              </h1>
              <p className="text-xs text-zinc-400 font-mono">
                {userHandle}
              </p>

              {/* Métricas destacadas de coleccionista */}
              <p className="text-xs sm:text-sm font-bold text-zinc-300 flex items-center gap-2 pt-0.5">
                <span className="text-white font-black">{totalPieces} piezas</span>
                <span className="text-zinc-600">·</span>
                <span className="text-white font-black">{uniqueFranchises} franquicias</span>
                <span className="text-zinc-600">·</span>
                <span className="text-white font-black">{uniqueBrands} marcas</span>
              </p>
            </div>
          </div>

          {/* Botones de acción principales */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2 lg:pt-0">
            <button
              type="button"
              onClick={() => setIsEditVaultOpen(true)}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 border border-white/10 cursor-pointer shadow"
            >
              <Settings size={14} className="text-zinc-400" />
              <span>Configurar</span>
            </button>

            <button
              type="button"
              onClick={handleAddPieceClick}
              className="px-4 py-2.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-rose-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5 border border-rose-500/40 cursor-pointer shadow"
            >
              <Plus size={15} />
              <span>＋ Agregar pieza</span>
            </button>

            <button
              type="button"
              onClick={() => setIsShareFullVaultOpen(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-pink-500 hover:from-rose-500 hover:to-pink-400 text-white font-black text-xs rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-rose-500/25 cursor-pointer"
            >
              <Share2 size={14} />
              <span>↗ Compartir</span>
            </button>
          </div>
        </div>

        {/* Feedback Banner */}
        {importMessage && (
          <div className="mt-6 bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-center justify-between text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-rose-400 shrink-0" />
              <span>{importMessage}</span>
            </div>
            <button onClick={() => setImportMessage(null)} className="text-zinc-400 hover:text-white text-xs cursor-pointer">
              ✕
            </button>
          </div>
        )}

        {/* Live Demo Banner Note */}
        {isDemoMode && (
          <div className="mt-6 p-4 rounded-2xl bg-zinc-950/60 border border-dashed border-rose-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-zinc-300">
            <div className="flex items-center gap-2.5">
              <Sparkles size={18} className="text-rose-400 shrink-0" />
              <span>
                <strong>Modo Vitrina Viva:</strong> Estás explorando 3 piezas de demostración con fichas de catálogo oficiales. Podés registrar tus propias figuras o sincronizar tus compras aprobadas.
              </span>
            </div>
            <button
              type="button"
              onClick={handleImportPastOrders}
              disabled={importingOrders}
              className="px-3.5 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold rounded-lg text-[11px] whitespace-nowrap transition cursor-pointer"
            >
              {importingOrders ? 'Importando...' : 'Importar mis compras'}
            </button>
          </div>
        )}
      </div>

      {/* FILTRO RÁPIDO POR FRANQUICIA */}
      <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
          <button
            type="button"
            onClick={() => setFilterFranchise('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
              filterFranchise === 'ALL'
                ? 'bg-gradient-to-r from-rose-600 to-pink-500 text-white shadow'
                : 'bg-zinc-900 text-zinc-400 hover:text-white border border-white/10'
            }`}
          >
            Todas las piezas ({activePieces.length})
          </button>
          {Array.from(new Set(activePieces.map(p => p.franchise).filter(Boolean))).map((fr) => (
            <button
              key={fr}
              type="button"
              onClick={() => setFilterFranchise(fr?.toUpperCase() || 'ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                filterFranchise === fr?.toUpperCase()
                  ? 'bg-gradient-to-r from-rose-600 to-pink-500 text-white shadow'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white border border-white/10'
              }`}
            >
              {fr}
            </button>
          ))}
        </div>

        <span className="text-xs text-zinc-500 font-mono hidden sm:inline-block">
          Mostrando {filteredPieces.length} de {activePieces.length}
        </span>
      </div>

      {/* GRID DE CARDS EN FORMATO 4:5 CONSISTENTE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPieces.map((piece, idx) => {
          const cardImage = piece.official_image_url || piece.custom_image_url;

          return (
            <div
              key={piece.id || idx}
              className="bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 border border-white/10 hover:border-rose-500/40 rounded-3xl p-5 shadow-xl transition-all duration-300 flex flex-col justify-between group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl group-hover:bg-rose-500/15 transition-all pointer-events-none" />

              <div>
                {/* 1. CONTENEDOR VISUAL 4:5 CON OBJECT-CONTAIN */}
                <div className="w-full aspect-[4/5] max-h-64 bg-zinc-950 rounded-2xl border border-white/10 p-3 mb-4 flex items-center justify-center overflow-hidden relative group-hover:border-rose-500/30 transition">
                  {cardImage ? (
                    <img
                      src={cardImage}
                      alt={piece.custom_name}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1608889825205-eebdb9fc5806?auto=format&fit=crop&w=800&q=80';
                      }}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-zinc-600 gap-1">
                      <ImageIcon size={36} />
                      <span className="text-[10px] font-mono">Sin foto</span>
                    </div>
                  )}

                  {/* Watermark Logo Badge */}
                  <div className="absolute bottom-2.5 left-2.5 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-md text-[8px] font-mono font-bold text-white border border-white/20 flex items-center gap-1 shadow-sm">
                    <img src="/images/collectibles-star-white.png" alt="Collectibles" className="w-3 h-3 object-contain" />
                    <span>Collectibles</span>
                  </div>


                  {/* Top-Right Favorite Badge */}
                  {piece.is_favorite && (
                    <div className="absolute top-3 right-3 bg-rose-500/20 border border-rose-500/40 text-rose-300 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-black flex items-center gap-1 shadow">
                      <Heart size={11} className="fill-rose-400 text-rose-400" />
                      <span>Favorita</span>
                    </div>
                  )}
                </div>

                {/* 2. TAGS: FRANQUICIA · ESCALA · ESTADO */}
                <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                  {piece.franchise && (
                    <span className="text-[9px] font-black tracking-widest uppercase bg-rose-500/15 border border-rose-500/30 text-rose-300 px-2 py-0.5 rounded-md">
                      {piece.franchise}
                    </span>
                  )}
                  {piece.scale && (
                    <span className="text-[9px] font-black tracking-wider uppercase bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-md">
                      {piece.scale}
                    </span>
                  )}
                </div>

                {/* 3. TÍTULO DE LA PIEZA */}
                <h3 className="font-black text-base text-white line-clamp-1 group-hover:text-rose-400 transition">
                  {piece.custom_name}
                </h3>

                {/* 4. FABRICANTE Y LÍNEA */}
                <p className="text-xs text-zinc-400 font-medium mt-0.5 truncate">
                  {piece.brand_name} {piece.line ? `· ${piece.line}` : ''}
                </p>

                {/* Rating Stars */}
                <div className="flex items-center gap-1 mt-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={12}
                      className={star <= (piece.rating || 5) ? 'text-rose-400 fill-rose-400' : 'text-zinc-700'}
                    />
                  ))}
                  {piece.purchase_date && (
                    <span className="text-[10px] text-zinc-500 font-mono ml-1.5">
                      · {piece.purchase_date}
                    </span>
                  )}
                </div>

                {piece.notes && (
                  <p className="text-xs text-zinc-400/90 italic line-clamp-2 mt-2 font-serif bg-zinc-950/40 p-2 rounded-xl border border-white/5">
                    "{piece.notes}"
                  </p>
                )}
              </div>

              {/* 5. ACCIONES: Ver pieza · ↗ Compartir */}
              <div className="flex items-center justify-between pt-4 mt-4 border-t border-white/10">
                <Link
                  to={`/vault/item/${piece.id || 'demo'}`}
                  className="text-xs font-black text-rose-400 hover:text-rose-300 flex items-center gap-1 group-hover:underline"
                >
                  <span>Ver ficha</span>
                  <ArrowRight size={13} />
                </Link>

                <button
                  type="button"
                  onClick={() => setSelectedShareItem(piece)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer border border-white/10"
                >
                  <Share2 size={13} className="text-rose-400" />
                  <span>Compartir ↗</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL: ¿CÓMO QUERÉS AGREGAR TU PIEZA? (BUSCAR EN CATÁLOGO VS MANUAL) */}
      {isAddPieceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
          <div className="w-full max-w-xl bg-zinc-950 border border-rose-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 my-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-rose-400 bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 rounded-full">
                  Nuevo Item
                </span>
                <h3 className="text-lg font-black text-white mt-1">¿Cómo querés agregar tu pieza?</h3>
              </div>
              <button
                onClick={() => {
                  setIsAddPieceModalOpen(false);
                  setCatalogSearchQuery('');
                  setCatalogSearchResults([]);
                }}
                className="p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-white/5"
              >
                <X size={18} />
              </button>
            </div>

            {/* OPCIÓN 1: BUSCADOR EN EL CATÁLOGO (OPCIÓN PRINCIPAL) */}
            <div className="space-y-3 bg-zinc-900/60 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Search size={14} className="text-rose-400" />
                  <span>Buscar en el catálogo de Collectibles (Recomendado)</span>
                </label>
                <span className="text-[10px] font-mono text-emerald-400">Autocompletado oficial</span>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={catalogSearchQuery}
                  onChange={(e) => handleSearchCatalog(e.target.value)}
                  placeholder="Escribe el nombre de la figura (ej: Darth Vader, Goku, Batman)..."
                  className="w-full px-4 py-2.5 bg-zinc-950 border border-white/15 rounded-xl text-white text-xs placeholder:text-zinc-500 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                  autoFocus
                />
                {searchingCatalog && (
                  <div className="absolute right-3 top-2.5 text-xs text-zinc-400 animate-pulse">
                    Buscando...
                  </div>
                )}
              </div>

              {/* RESULTADOS DEL CATÁLOGO */}
              {catalogSearchResults.length > 0 && (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1 pt-1">
                  {catalogSearchResults.map((prod) => {
                    const img = getProductImage(prod.images);
                    return (
                      <div
                        key={prod.id}
                        onClick={() => {
                          setIsAddPieceModalOpen(false);
                          navigate(`/vault/item/new?productId=${prod.id}`);
                        }}
                        className="p-2.5 rounded-xl bg-zinc-950 hover:bg-rose-500/10 border border-white/10 hover:border-rose-500/40 flex items-center justify-between gap-3 cursor-pointer transition group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 rounded-lg bg-black p-1 shrink-0 overflow-hidden flex items-center justify-center border border-white/5">
                            <img src={img} alt={prod.title} className="w-full h-full object-contain" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-white group-hover:text-rose-300 truncate">
                              {prod.title}
                            </h4>
                            <p className="text-[10px] text-zinc-400 truncate">
                              {prod.brand?.name || 'Oficial'} · {prod.category?.name || 'Coleccionable'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="px-3 py-1 bg-rose-500/20 text-rose-300 group-hover:bg-rose-500 group-hover:text-white font-bold text-[10px] rounded-lg transition shrink-0"
                        >
                          Vincular →
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {catalogSearchQuery.trim() && !searchingCatalog && catalogSearchResults.length === 0 && (
                <div className="p-4 text-center space-y-2">
                  <p className="text-xs text-zinc-400">No encontramos coincidencias para "{catalogSearchQuery}".</p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddPieceModalOpen(false);
                      navigate('/vault/item/new');
                    }}
                    className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-rose-300 border border-rose-500/30 text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    ¿No encuentras tu figura? Agregar manualmente →
                  </button>
                </div>
              )}
            </div>

            {/* OPCIÓN 2: AGREGAR MANUALMENTE */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between">
              <span className="text-xs text-zinc-400">¿Es una pieza vintage o no listada?</span>
              <button
                type="button"
                onClick={() => {
                  setIsAddPieceModalOpen(false);
                  navigate('/vault/item/new');
                }}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-white/15 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Agregar manualmente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIGURAR MY VAULT (PÚBLICO / PRIVADO) */}
      {isEditVaultOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Settings size={18} className="text-rose-500" />
                Configurar My Vault
              </h3>
              <button
                onClick={() => setIsEditVaultOpen(false)}
                className="text-zinc-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 bg-zinc-900/60 rounded-2xl border border-white/5 space-y-1">
                <span className="text-[10px] text-zinc-400 font-bold block uppercase tracking-wider">Identidad de Coleccionista</span>
                <p className="text-[11px] text-zinc-300">
                  Tu apodo ({collectorNickname || userHandle}) y avatar se administran exclusivamente desde <Link to="/portal?tab=profile" className="text-rose-400 font-bold hover:underline">Mi Perfil</Link>.
                </p>
              </div>

              <div>
                <label className="block text-zinc-300 font-bold mb-2">Visibilidad de tu Vitrina</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsVaultPublic(true)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                      isVaultPublic
                        ? 'bg-rose-500/15 border-rose-500/50 text-rose-300 font-bold'
                        : 'bg-zinc-900 border-white/10 text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Globe size={13} />
                      <span>🌐 Público</span>
                    </div>
                    <p className="text-[10px] text-zinc-400 font-normal">Accesible y compartible con otros coleccionistas.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsVaultPublic(false)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                      !isVaultPublic
                        ? 'bg-rose-500/15 border-rose-500/50 text-rose-300 font-bold'
                        : 'bg-zinc-900 border-white/10 text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Lock size={13} />
                      <span>🔒 Privado</span>
                    </div>
                    <p className="text-[10px] text-zinc-400 font-normal">Sólo tú podés ver tu vitrina.</p>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsEditVaultOpen(false)}
                className="px-5 py-2 bg-gradient-to-r from-rose-600 to-pink-500 text-white font-black text-xs rounded-xl cursor-pointer shadow"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHARE MODAL: PIEZA INDIVIDUAL */}
      {selectedShareItem && (
        <VaultShareCardModal
          isOpen={!!selectedShareItem}
          onClose={() => setSelectedShareItem(null)}
          item={selectedShareItem}
          isFullVault={false}
          initialMode="single"
          collectorNickname={collectorNickname}
          collectorAvatarUrl={collectorAvatarUrl}
          collectorHandle={userHandle}
          isVaultPublic={isVaultPublic}
          vaultData={{
            collector_handle: collectorNickname.trim() ? `${collectorNickname.trim()}’s Vault` : userHandle,
            total_items: totalPieces,
            total_franchises: uniqueFranchises,
            total_brands: uniqueBrands,
            featured_items: activePieces
          }}
        />
      )}

      {/* SHARE MODAL: MI COLECCIÓN */}
      {isShareFullVaultOpen && (
        <VaultShareCardModal
          isOpen={isShareFullVaultOpen}
          onClose={() => setIsShareFullVaultOpen(false)}
          isFullVault={true}
          initialMode="full"
          collectorNickname={collectorNickname}
          collectorAvatarUrl={collectorAvatarUrl}
          collectorHandle={userHandle}
          isVaultPublic={isVaultPublic}
          vaultData={{
            collector_handle: collectorNickname.trim() ? `${collectorNickname.trim()}’s Vault` : userHandle,
            total_items: totalPieces,
            total_franchises: uniqueFranchises,
            total_brands: uniqueBrands,
            featured_items: activePieces
          }}
        />
      )}
    </div>
  );
}


