import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Archive, Plus, ShieldCheck, Download, Layers, Star, ExternalLink, Lock, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { calculateVaultStats } from '../../plugins/collector-vault/core/statsEngine';
import SEO from '../../components/SEO';

export default function VaultDashboard() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importingOrders, setImportingOrders] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadVault();
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

  const handleImportPastOrders = async () => {
    if (!user) return;
    setImportingOrders(true);
    setImportMessage(null);

    try {
      // 1. Fetch user orders
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

      // 2. Filter products already in vault
      const existingProductIds = new Set(items.map(i => i.product_id).filter(Boolean));
      let importedCount = 0;

      for (const order of orders) {
        if (!order.items || !Array.isArray(order.items)) continue;
        for (const orderItem of order.items) {
          if (orderItem.product_id && existingProductIds.has(orderItem.product_id)) {
            continue; // Already in vault
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
            notes: `Adquirido oficialmente en orden #${order.id.slice(0, 8)} de Collectibles.uy`,
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

  const stats = calculateVaultStats(items);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white space-y-8">
      <SEO
        title="Mi Vault | Collectibles 2026"
        description="Gestión y control de inventario personal de coleccionables y figuras de acción."
        noIndex={true}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Archive size={20} className="text-amber-400" />
            <span className="text-xs font-black uppercase tracking-widest text-amber-400">Collector Vault</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black">Mi Bóveda Personal</h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Inventario privado de piezas adquiridas, listas de deseos y vitrinas digitales.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleImportPastOrders}
            disabled={importingOrders}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 border border-white/10 cursor-pointer disabled:opacity-50"
          >
            <Download size={14} className={importingOrders ? 'animate-bounce' : 'text-amber-400'} />
            <span>{importingOrders ? 'Importando...' : 'Importar Compras Anteriores'}</span>
          </button>

          <Link
            to="/vault/item/new"
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
          >
            <Plus size={15} />
            <span>Agregar Pieza Externa</span>
          </Link>
        </div>
      </div>

      {/* Import Feedback Banner */}
      {importMessage && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between text-xs text-amber-300 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-amber-400 shrink-0" />
            <span>{importMessage}</span>
          </div>
          <button onClick={() => setImportMessage(null)} className="text-zinc-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-4">
          <span className="text-xs text-zinc-400 font-bold uppercase">Total en Bóveda</span>
          <div className="text-3xl font-black text-white mt-1">{stats.total_items || 0}</div>
        </div>
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-4">
          <span className="text-xs text-zinc-400 font-bold uppercase">En Posesión (Owned)</span>
          <div className="text-3xl font-black text-emerald-400 mt-1">{stats.owned_count || 0}</div>
        </div>
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-4">
          <span className="text-xs text-zinc-400 font-bold uppercase">En Pre-order</span>
          <div className="text-3xl font-black text-sky-400 mt-1">{stats.preordered_count || 0}</div>
        </div>
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-4">
          <span className="text-xs text-zinc-400 font-bold uppercase flex items-center gap-1">
            <Lock size={12} className="text-zinc-500" />
            Inversión Privada
          </span>
          <div className="text-3xl font-black text-amber-400 font-mono mt-1">
            ${(stats.amount_spent ?? 0).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Items Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white">Piezas Registradas ({items.length})</h2>
        {loading ? (
          <div className="py-16 text-center text-zinc-500">Cargando inventario...</div>
        ) : items.length === 0 ? (
          <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-8 text-center">
            <p className="text-xs text-zinc-400">Aún no tienes piezas registradas en tu Vault.</p>
            <div className="flex justify-center gap-4 mt-3">
              <button
                onClick={handleImportPastOrders}
                className="text-xs font-bold text-amber-400 hover:underline cursor-pointer"
              >
                Importar compras anteriores de Collectibles →
              </button>
              <Link to="/shop" className="text-xs font-bold text-zinc-400 hover:underline">
                Explorar catálogo →
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <div key={item.id} className="bg-zinc-900/80 border border-white/10 rounded-xl p-4 flex gap-4 hover:border-white/20 transition group">
                <div className="w-16 h-16 bg-zinc-950 rounded-lg border border-white/5 p-1 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {item.custom_image_url ? (
                    <img src={item.custom_image_url} alt={item.custom_name} className="w-full h-full object-contain" />
                  ) : (
                    <Archive size={24} className="text-zinc-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    {item.status}
                  </span>
                  <h4 className="font-bold text-sm text-white truncate mt-1">{item.custom_name || 'Pieza Coleccionable'}</h4>
                  <p className="text-xs text-zinc-400 font-mono mt-0.5">Condición: {item.condition}</p>
                  <Link to={`/vault/item/${item.id}`} className="text-xs text-amber-400 hover:underline mt-2 inline-block font-semibold">
                    Ver ficha & Editar →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
