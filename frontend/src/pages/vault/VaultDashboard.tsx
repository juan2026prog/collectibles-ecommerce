import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Archive, Plus, ShieldCheck, PieChart, Tag, Layers, Star, ExternalLink, Lock } from 'lucide-react';
import { calculateVaultStats } from '../../plugins/collector-vault/core/statsEngine';
import SEO from '../../components/SEO';

export default function VaultDashboard() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
            Inventario privado de piezas adquiridas, listas de deseos y vitrinas públicas.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/vault/item/new"
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
          >
            <Plus size={15} />
            <span>Agregar Pieza Externa</span>
          </Link>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-4">
          <span className="text-xs text-zinc-400 font-bold uppercase">Total en Bóveda</span>
          <div className="text-3xl font-black text-white mt-1">{stats.totalItems}</div>
        </div>
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-4">
          <span className="text-xs text-zinc-400 font-bold uppercase">En Posesión (Owned)</span>
          <div className="text-3xl font-black text-emerald-400 mt-1">{stats.ownedItems}</div>
        </div>
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-4">
          <span className="text-xs text-zinc-400 font-bold uppercase">En Pre-order</span>
          <div className="text-3xl font-black text-sky-400 mt-1">{stats.preorderedItems}</div>
        </div>
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-4">
          <span className="text-xs text-zinc-400 font-bold uppercase flex items-center gap-1">
            <Lock size={12} className="text-zinc-500" />
            Inversión Privada
          </span>
          <div className="text-3xl font-black text-amber-400 font-mono mt-1">
            ${stats.totalSpent.toFixed(2)}
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
            <Link to="/shop" className="text-xs font-bold text-amber-400 hover:underline mt-2 inline-block">
              Explorar catálogo para agregar piezas →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <div key={item.id} className="bg-zinc-900/80 border border-white/10 rounded-xl p-4 flex gap-4">
                <div className="w-16 h-16 bg-zinc-950 rounded-lg border border-white/5 p-1 flex items-center justify-center flex-shrink-0">
                  <Archive size={24} className="text-zinc-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    {item.status}
                  </span>
                  <h4 className="font-bold text-sm text-white truncate mt-1">{item.custom_name || 'Pieza Coleccionable'}</h4>
                  <p className="text-xs text-zinc-400 font-mono mt-0.5">Condición: {item.condition}</p>
                  <Link to={`/vault/item/${item.id}`} className="text-xs text-amber-400 hover:underline mt-2 inline-block font-semibold">
                    Editar detalles →
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
