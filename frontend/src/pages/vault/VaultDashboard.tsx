import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Archive, Plus, Share2, Star, ExternalLink, Lock, CheckCircle2, Sparkles, Image as ImageIcon, ShoppingBag, Eye, Heart, Globe, Settings, SlidersHorizontal, ArrowRight } from 'lucide-react';
import SEO from '../../components/SEO';
import { VaultShareCardModal, type ShareItemData } from './VaultShareCardModal';

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
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importingOrders, setImportingOrders] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  
  // Modals state
  const [selectedShareItem, setSelectedShareItem] = useState<ShareItemData | null>(null);
  const [isShareFullVaultOpen, setIsShareFullVaultOpen] = useState(false);
  const [isEditVaultOpen, setIsEditVaultOpen] = useState(false);
  
  // Collector Profile settings
  const [collectorHandle, setCollectorHandle] = useState<string>(() => {
    return user?.email ? `@${user.email.split('@')[0]}` : '@collector';
  });
  const [isVaultPublic, setIsVaultPublic] = useState(true);
  const [filterFranchise, setFilterFranchise] = useState<string>('ALL');

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
      const { data: dbItems, error } = await supabase
        .from('vault_items')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (!error && dbItems && dbItems.length > 0) {
        setItems(dbItems);
      } else {
        // Inicializamos con las 3 figuras de referencia vivas
        setItems([]);
      }
    } catch (err) {
      console.error('Error loading vault:', err);
    } finally {
      setLoading(false);
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
            custom_name: orderItem.title || 'Figura Coleccionable',
            custom_image_url: orderItem.image_url || null,
            status: 'OWNED',
            condition: 'MINT',
            box_condition: 'SEALED',
            purchase_price: orderItem.price || null,
            purchase_date: order.created_at ? order.created_at.split('T')[0] : null,
            notes: `Adquirido en orden #${order.id.slice(0, 8)} de Collectibles.uy`,
            visibility: 'PUBLIC',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          const { error: insertErr } = await supabase.from('vault_items').insert(vaultPayload);
          if (!insertErr) {
            importedCount++;
            if (orderItem.product_id) existingProductIds.add(orderItem.product_id);
          }
        }
      }

      if (importedCount > 0) {
        setImportMessage(`🎉 ¡Listo! Se agregaron ${importedCount} piezas nuevas de tus compras anteriores.`);
        await loadVault();
      } else {
        setImportMessage('Todas tus compras anteriores ya estaban registradas en tu Vault.');
      }
    } catch (err: any) {
      console.error('Error importing past orders:', err);
      setImportMessage('Ocurrió un error al importar tus compras.');
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
        collector_handle: collectorHandle,
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
        title={`My Vault | La colección de ${collectorHandle} | Collectibles`}
        description={`Vitrina digital de coleccionables de ${collectorHandle}: ${totalPieces} piezas, ${uniqueFranchises} franquicias y ${uniqueBrands} marcas.`}
      />

      {/* BLOQUE SUPERIOR DE MY VAULT */}
      <div className="bg-gradient-to-br from-amber-950/40 via-zinc-900/90 to-zinc-950 border border-amber-500/25 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-widest uppercase text-amber-400 bg-amber-500/15 border border-amber-500/30 px-3 py-1 rounded-full">
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

            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              La colección de <span className="text-amber-400">{collectorHandle}</span>
            </h1>

            {/* Métricas destacadas de coleccionista */}
            <p className="text-sm sm:text-base font-bold text-zinc-300 flex items-center gap-2">
              <span className="text-white font-black">{totalPieces} piezas</span>
              <span className="text-zinc-600">·</span>
              <span className="text-white font-black">{uniqueFranchises} franquicias</span>
              <span className="text-zinc-600">·</span>
              <span className="text-white font-black">{uniqueBrands} marcas</span>
            </p>
          </div>

          {/* Botones de acción principales */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2 lg:pt-0">
            <button
              type="button"
              onClick={() => setIsEditVaultOpen(true)}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 border border-white/10 cursor-pointer shadow"
            >
              <Settings size={14} className="text-zinc-400" />
              <span>Editar Vault</span>
            </button>

            <Link
              to="/vault/item/new"
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-amber-400 hover:text-amber-300 font-bold text-xs rounded-xl transition flex items-center gap-1.5 border border-amber-500/30 cursor-pointer shadow"
            >
              <Plus size={15} />
              <span>＋ Agregar pieza</span>
            </Link>

            <button
              type="button"
              onClick={() => setIsShareFullVaultOpen(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-black text-xs rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              <Share2 size={14} />
              <span>↗ Compartir mi Vault</span>
            </button>
          </div>
        </div>

        {/* Feedback Banner */}
        {importMessage && (
          <div className="mt-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-amber-400 shrink-0" />
              <span>{importMessage}</span>
            </div>
            <button onClick={() => setImportMessage(null)} className="text-zinc-400 hover:text-white text-xs cursor-pointer">
              ✕
            </button>
          </div>
        )}

        {/* Live Demo Banner Note */}
        {isDemoMode && (
          <div className="mt-6 p-4 rounded-2xl bg-zinc-950/60 border border-dashed border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-zinc-300">
            <div className="flex items-center gap-2.5">
              <Sparkles size={18} className="text-amber-400 shrink-0" />
              <span>
                <strong>Modo Vitrina Viva:</strong> Estás explorando 3 piezas de demostración con fichas de catálogo reales. Puedes modificarlas, registrar tus propias figuras o sincronizar tus compras.
              </span>
            </div>
            <button
              type="button"
              onClick={handleImportPastOrders}
              disabled={importingOrders}
              className="px-3.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-bold rounded-lg text-[11px] whitespace-nowrap transition cursor-pointer"
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
                ? 'bg-amber-500 text-black shadow'
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
                  ? 'bg-amber-500 text-black shadow'
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

      {/* GRID DE CARDS DE FIGURAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPieces.map((piece, idx) => {
          const cardImage = piece.custom_image_url || piece.official_image_url;

          return (
            <div
              key={piece.id || idx}
              className="bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 border border-white/10 hover:border-amber-500/40 rounded-3xl p-5 shadow-xl transition-all duration-300 flex flex-col justify-between group relative overflow-hidden"
            >
              {/* Gold light reflection on hover */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/15 transition-all pointer-events-none" />

              <div>
                {/* 1. IMAGEN GRANDE */}
                <div className="w-full aspect-square bg-zinc-950 rounded-2xl border border-white/10 p-3 mb-4 flex items-center justify-center overflow-hidden relative group-hover:border-amber-500/20 transition">
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

                  {/* Watermark Mini Badge */}
                  <div className="absolute bottom-2.5 left-2.5 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded-md text-[8px] font-mono font-bold text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <span>⚡ Collectibles</span>
                  </div>

                  {/* Top-Right Favorite / Featured Badge */}
                  {piece.is_favorite && (
                    <div className="absolute top-3 right-3 bg-rose-500/20 border border-rose-500/30 text-rose-300 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-black flex items-center gap-1 shadow">
                      <Heart size={11} className="fill-rose-400 text-rose-400" />
                      <span>Favorita</span>
                    </div>
                  )}
                </div>

                {/* 2. TAGS: FRANQUICIA · ESCALA · ESTADO */}
                <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                  {piece.franchise && (
                    <span className="text-[9px] font-black tracking-widest uppercase bg-amber-500/15 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded-md">
                      {piece.franchise}
                    </span>
                  )}
                  {piece.scale && (
                    <span className="text-[9px] font-black tracking-wider uppercase bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-md">
                      {piece.scale}
                    </span>
                  )}
                  {piece.condition && (
                    <span className="text-[9px] font-black tracking-wider uppercase bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-md">
                      {piece.condition}
                    </span>
                  )}
                </div>

                {/* 3. TÍTULO DE LA PIEZA */}
                <h3 className="font-black text-base text-white line-clamp-1 group-hover:text-amber-400 transition">
                  {piece.custom_name}
                </h3>

                {/* 4. FABRICANTE Y LÍNEA */}
                <p className="text-xs text-zinc-400 font-medium mt-0.5 truncate">
                  {piece.brand_name} {piece.line ? `· ${piece.line}` : ''}
                </p>

                {/* Rating Stars & Notes */}
                <div className="flex items-center gap-1 mt-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={12}
                      className={star <= (piece.rating || 5) ? 'text-amber-400 fill-amber-400' : 'text-zinc-700'}
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
                  className="text-xs font-black text-amber-400 hover:text-amber-300 flex items-center gap-1 group-hover:underline"
                >
                  <span>Ver pieza</span>
                  <ArrowRight size={13} />
                </Link>

                <button
                  type="button"
                  onClick={() => setSelectedShareItem(piece)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer border border-white/10"
                >
                  <Share2 size={13} className="text-amber-400" />
                  <span>Compartir ↗</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL EDITAR VAULT (Handle, Bio, Public/Private) */}
      {isEditVaultOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Settings size={18} className="text-amber-400" />
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
              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Nombre de Coleccionista / Handle</label>
                <input
                  type="text"
                  value={collectorHandle}
                  onChange={(e) => setCollectorHandle(e.target.value.startsWith('@') ? e.target.value : `@${e.target.value}`)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-white font-mono"
                  placeholder="@collector"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-semibold mb-1">Visibilidad del Vault</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsVaultPublic(true)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                      isVaultPublic
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 font-bold'
                        : 'bg-zinc-900 border-white/10 text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Globe size={13} />
                      <span>🌐 Público</span>
                    </div>
                    <p className="text-[10px] text-zinc-400">Accesible y compartible con tus amigos.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsVaultPublic(false)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                      !isVaultPublic
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 font-bold'
                        : 'bg-zinc-900 border-white/10 text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Lock size={13} />
                      <span>🔒 Privado</span>
                    </div>
                    <p className="text-[10px] text-zinc-400">Sólo tú puedes ver tus figuras.</p>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsEditVaultOpen(false)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl cursor-pointer"
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
          item={{
            ...selectedShareItem,
            collector_handle: collectorHandle
          }}
          isFullVault={false}
        />
      )}

      {/* SHARE MODAL: VAULT COMPLETO */}
      {isShareFullVaultOpen && (
        <VaultShareCardModal
          isOpen={isShareFullVaultOpen}
          onClose={() => setIsShareFullVaultOpen(false)}
          isFullVault={true}
          vaultData={{
            collector_handle: collectorHandle,
            total_items: totalPieces,
            total_franchises: uniqueFranchises,
            total_brands: uniqueBrands,
            featured_items: activePieces.filter(p => p.is_featured || p.is_favorite).slice(0, 3)
          }}
        />
      )}
    </div>
  );
}

