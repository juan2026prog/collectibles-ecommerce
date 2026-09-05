import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Archive, Plus, ShieldCheck, Download, Share2, Layers, Star, ExternalLink, Lock, CheckCircle2, Sparkles, Image as ImageIcon, ShoppingBag, Eye } from 'lucide-react';
import { calculateVaultStats } from '../../plugins/collector-vault/core/statsEngine';
import SEO from '../../components/SEO';
import { VaultShareCardModal } from './VaultShareCardModal';

export default function VaultDashboard() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [recommendedProducts, setRecommendedProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importingOrders, setImportingOrders] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [selectedShareItem, setSelectedShareItem] = useState<any | null>(null);
  const [copiedProfileLink, setCopiedProfileLink] = useState(false);

  useEffect(() => {
    if (user) {
      loadVault();
      loadRecommendations();
    } else {
      setLoading(false);
      loadRecommendations();
    }
  }, [user]);

  const loadVault = async () => {
    try {
      setLoading(true);
      const [itemsRes, colRes] = await Promise.all([
        supabase.from('vault_items').select('*').eq('user_id', user?.id),
        supabase.from('vault_collections').select('*').eq('user_id', user?.id)
      ]);

      setItems(itemsRes.data || []);
      setCollections(colRes.data || []);
    } catch (err) {
      console.error('Error loading vault:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRecommendations = async () => {
    try {
      const { data } = await supabase
        .from('products')
        .select('id, title, slug, price, base_price, images')
        .eq('status', 'active')
        .limit(4);
      if (data) setRecommendedProducts(data);
    } catch (e) {
      console.error(e);
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
        setImportMessage('No encontramos pedidos anteriores asociados a tu cuenta.');
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
            custom_name: orderItem.title || 'Figura Collectibles',
            custom_image_url: orderItem.image_url || null,
            status: 'OWNED',
            condition: 'MINT',
            box_condition: 'SEALED',
            purchase_price: orderItem.price || null,
            purchase_date: order.created_at ? order.created_at.split('T')[0] : null,
            notes: `Adquirido en orden #${order.id.slice(0, 8)} de Collectibles.uy`,
            visibility: 'PRIVATE',
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
      setImportMessage('Ocurrió un error al importar tus compras. Inténtalo nuevamente.');
    } finally {
      setImportingOrders(false);
    }
  };

  const handleCopyPublicProfile = () => {
    const link = window.location.origin + `/vault`;
    navigator.clipboard.writeText(link);
    setCopiedProfileLink(true);
    setTimeout(() => setCopiedProfileLink(false), 2500);
  };

  const stats = calculateVaultStats(items);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white space-y-10">
      <SEO
        title="The Vault | Mi Bóveda & Vitrina de Colección | Collectibles 2026"
        description="Gestiona tu inventario privado de coleccionables, exporta fichas de tus piezas para redes sociales y completa tus colecciones."
        noIndex={true}
      />

      {/* Header */}
      <div className="bg-gradient-to-br from-amber-950/40 via-zinc-900 to-zinc-950 border border-amber-500/20 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-black uppercase tracking-widest">
              <Archive size={14} />
              <span>The Collector Vault</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">
              Mi Bóveda Personal de Coleccionables
            </h1>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              Tu vitrina digital privada: registra tus figuras adquiridas, fotos reales del estado de conservación, y genera fichas con marca de agua para compartir en Instagram Stories, Facebook o WhatsApp sin revelar precios de compra.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleImportPastOrders}
              disabled={importingOrders}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-2 border border-white/10 cursor-pointer disabled:opacity-50 shadow-md"
            >
              <Download size={14} className={importingOrders ? 'animate-bounce text-amber-400' : 'text-amber-400'} />
              <span>{importingOrders ? 'Sincronizando...' : 'Importar mis compras de Collectibles'}</span>
            </button>

            <Link
              to="/vault/item/new"
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
            >
              <Plus size={16} />
              <span>Registrar Pieza Externa</span>
            </Link>
          </div>
        </div>

        {/* Feedback Banner */}
        {importMessage && (
          <div className="mt-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between text-xs text-amber-300 animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-amber-400 shrink-0" />
              <span>{importMessage}</span>
            </div>
            <button onClick={() => setImportMessage(null)} className="text-zinc-400 hover:text-white text-xs">
              ✕
            </button>
          </div>
        )}
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-4">
          <span className="text-xs text-zinc-400 font-bold uppercase">Piezas en Bóveda</span>
          <div className="text-3xl font-black text-white mt-1">{stats.total_items || 0}</div>
        </div>
        <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-4">
          <span className="text-xs text-zinc-400 font-bold uppercase">En Posesión (Owned)</span>
          <div className="text-3xl font-black text-emerald-400 mt-1">{stats.owned_count || 0}</div>
        </div>
        <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-4">
          <span className="text-xs text-zinc-400 font-bold uppercase">En Pre-order</span>
          <div className="text-3xl font-black text-sky-400 mt-1">{stats.preordered_count || 0}</div>
        </div>
        <div className="bg-zinc-900/80 border border-white/10 rounded-2xl p-4">
          <span className="text-xs text-zinc-400 font-bold uppercase flex items-center gap-1">
            <Lock size={12} className="text-zinc-500" />
            Inversión Privada
          </span>
          <div className="text-3xl font-black text-amber-400 font-mono mt-1">
            ${(stats.amount_spent ?? 0).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Main Content Section */}
      {loading ? (
        <div className="py-20 text-center text-zinc-500">Cargando inventario de Vault...</div>
      ) : items.length === 0 ? (
        /* VITRINA DEMO / EJEMPLO ATRACTIVO CUANDO ESTÁ VACÍO */
        <div className="space-y-6">
          <div className="bg-zinc-900/50 border border-white/10 rounded-3xl p-8 text-center max-w-3xl mx-auto space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
              <Archive size={32} />
            </div>
            <h2 className="text-2xl font-black text-white">Tu Vitrina Digital aún está esperando sus piezas</h2>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-lg mx-auto leading-relaxed">
              The Vault te permite organizar tu colección personal (tanto compras de Collectibles como piezas externas), llevar registro de estado y compartir fotos oficiales con tus amigos.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <button
                onClick={handleImportPastOrders}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl transition cursor-pointer shadow-lg"
              >
                Sincronizar mis compras anteriores →
              </button>
              <Link
                to="/vault/item/new"
                className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl transition border border-white/10"
              >
                Agregar mi primera pieza manualmente
              </Link>
            </div>
          </div>

          {/* Ejemplo de cómo luce una vitrina */}
          <div className="space-y-3 pt-4">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-amber-400" />
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">
                Ejemplo: Así se visualizan tus figuras en The Vault
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 opacity-75">
              {[
                { title: 'Batman Supreme Knight (One:12 Collective)', brand: 'Mezco Toyz', scale: '1:12', condition: 'MINT', box: 'SEALED' },
                { title: 'Michael Myers Ultimate (Halloween 2018)', brand: 'NECA', scale: '1:10', condition: 'NEAR_MINT', box: 'OPEN_BOX' },
                { title: 'Spider-Man Advanced Suit (Movie Masterpiece)', brand: 'Hot Toys', scale: '1:6', condition: 'MINT', box: 'ACRYLIC_CASE' },
              ].map((demo, idx) => (
                <div key={idx} className="bg-zinc-900/60 border border-dashed border-white/15 rounded-2xl p-4 flex gap-3">
                  <div className="w-16 h-16 bg-zinc-950 rounded-xl border border-white/10 flex items-center justify-center text-zinc-600 shrink-0">
                    <ImageIcon size={24} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      EJEMPLO • {demo.scale}
                    </span>
                    <h4 className="font-bold text-xs text-zinc-200 truncate mt-1">{demo.title}</h4>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{demo.brand} • {demo.condition}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* LISTADO DE PIEZAS REALES */
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Piezas Registradas ({items.length})</span>
            </h2>

            <button
              onClick={handleCopyPublicProfile}
              className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-amber-300 border border-amber-500/20 flex items-center gap-1.5 transition cursor-pointer"
            >
              <Share2 size={13} />
              <span>{copiedProfileLink ? '¡Enlace Copiado!' : 'Compartir mi Bóveda'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-zinc-900/80 border border-white/10 rounded-2xl p-4 flex gap-4 hover:border-amber-500/30 transition-all group shadow-lg"
              >
                <div className="w-20 h-20 bg-zinc-950 rounded-xl border border-white/10 p-1 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                  {item.custom_image_url ? (
                    <img src={item.custom_image_url} alt={item.custom_name} className="w-full h-full object-contain" />
                  ) : (
                    <Archive size={28} className="text-zinc-600" />
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                        {item.status}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {item.condition}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-white truncate mt-1.5">{item.custom_name || 'Pieza Coleccionable'}</h4>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <Link
                      to={`/vault/item/${item.id}`}
                      className="text-xs text-amber-400 hover:underline font-semibold"
                    >
                      Editar Ficha →
                    </Link>
                    <span className="text-zinc-600">•</span>
                    <button
                      type="button"
                      onClick={() => setSelectedShareItem(item)}
                      className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer font-semibold"
                    >
                      <Share2 size={11} />
                      <span>Compartir</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CROSS-SELL: Recomendaciones para Completar Colección */}
      {recommendedProducts.length > 0 && (
        <div className="pt-8 border-t border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag size={18} className="text-amber-400" />
              <h3 className="text-base font-bold text-white">Piezas recomendadas para completar tu Vault</h3>
            </div>
            <Link to="/shop" className="text-xs text-amber-400 hover:underline font-bold">
              Ver catálogo completo →
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {recommendedProducts.map((p) => {
              const img = p.images?.[0] || '';
              return (
                <Link
                  key={p.id}
                  to={`/producto/${p.slug}`}
                  className="bg-zinc-900/60 border border-white/10 rounded-2xl p-3 hover:border-amber-500/30 transition flex flex-col justify-between group shadow-sm"
                >
                  <div className="aspect-square bg-zinc-950 rounded-xl overflow-hidden mb-2 p-2 flex items-center justify-center">
                    {img ? <img src={img} alt={p.title} className="w-full h-full object-contain group-hover:scale-105 transition" /> : <Archive size={24} className="text-zinc-700" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white line-clamp-1 group-hover:text-amber-400 transition">{p.title}</h4>
                    <span className="text-xs font-black text-amber-400 font-mono mt-1 block">$ {p.base_price || p.price}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Share Card Modal */}
      {selectedShareItem && (
        <VaultShareCardModal
          isOpen={!!selectedShareItem}
          onClose={() => setSelectedShareItem(null)}
          item={{
            custom_name: selectedShareItem.custom_name,
            status: selectedShareItem.status,
            condition: selectedShareItem.condition,
            box_condition: selectedShareItem.box_condition,
            custom_image_url: selectedShareItem.custom_image_url,
            purchase_date: selectedShareItem.purchase_date
          }}
        />
      )}
    </div>
  );
}
