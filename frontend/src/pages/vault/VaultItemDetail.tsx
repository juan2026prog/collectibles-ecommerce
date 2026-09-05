import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Archive, ArrowLeft, Save, Lock } from 'lucide-react';
import type { VaultCondition, VaultBoxCondition, VaultStatus } from '../../plugins/collector-vault/types';

export default function VaultItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const isNew = id === 'new';
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    custom_name: '',
    status: 'OWNED' as VaultStatus,
    condition: 'MINT' as VaultCondition,
    box_condition: 'SEALED' as VaultBoxCondition,
    purchase_price: '',
    purchase_date: '',
    notes: ''
  });

  useEffect(() => {
    if (!isNew && id && user) {
      loadItem(id);
    }
  }, [id, user]);

  const loadItem = async (itemId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('vault_items')
        .select('*')
        .eq('id', itemId)
        .eq('user_id', user?.id)
        .single();

      if (!error && data) {
        setForm({
          custom_name: data.custom_name || '',
          status: data.status,
          condition: data.condition,
          box_condition: data.box_condition,
          purchase_price: data.purchase_price ? String(data.purchase_price) : '',
          purchase_date: data.purchase_date || '',
          notes: data.notes || ''
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        custom_name: form.custom_name || 'Pieza Personal',
        status: form.status,
        condition: form.condition,
        box_condition: form.box_condition,
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
        purchase_date: form.purchase_date || null,
        notes: form.notes,
        updated_at: new Date().toISOString()
      };

      if (isNew) {
        await supabase.from('vault_items').insert(payload);
      } else {
        await supabase.from('vault_items').update(payload).eq('id', id);
      }
      navigate('/vault');
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-24 text-center text-zinc-500">Cargando pieza de Vault...</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 text-white space-y-6">
      <Link to="/vault" className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white transition">
        <ArrowLeft size={14} />
        <span>Volver a Mi Vault</span>
      </Link>

      <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-xl">
        <h1 className="text-xl font-bold text-white mb-4">
          {isNew ? 'Registrar Pieza Externa en Vault' : 'Editar Pieza en Bóveda'}
        </h1>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div>
            <label className="block text-zinc-400 font-semibold mb-1">Nombre o Título de la Pieza</label>
            <input
              type="text"
              required
              value={form.custom_name}
              onChange={(e) => setForm({ ...form, custom_name: e.target.value })}
              placeholder="Ej: Mezco One:12 Batman Supreme Knight"
              className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Estado de Posesión</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as VaultStatus })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white"
              >
                <option value="OWNED">OWNED (En propiedad)</option>
                <option value="PREORDERED">PREORDERED (Pre-ordenada)</option>
                <option value="ORDERED">ORDERED (En tránsito / comprada)</option>
                <option value="WISHLIST">WISHLIST (Deseada)</option>
                <option value="WANTED">WANTED (Buscada activamente)</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Condición de la Pieza</label>
              <select
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value as VaultCondition })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white"
              >
                <option value="MINT">MINT (Impecable)</option>
                <option value="NEAR_MINT">NEAR_MINT (Casi perfecto)</option>
                <option value="EXCELLENT">EXCELLENT (Excelente)</option>
                <option value="GOOD">GOOD (Bueno / exhibido)</option>
                <option value="FAIR">FAIR (Detalles menores)</option>
                <option value="DAMAGED">DAMAGED (Con roturas)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Estado del Empaque / Caja</label>
              <select
                value={form.box_condition}
                onChange={(e) => setForm({ ...form, box_condition: e.target.value as VaultBoxCondition })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white"
              >
                <option value="SEALED">SEALED (Sellado de fábrica)</option>
                <option value="OPEN_BOX">OPEN_BOX (Caja abierta completa)</option>
                <option value="DAMAGED_BOX">DAMAGED_BOX (Caja dañada)</option>
                <option value="NO_BOX">NO_BOX (Loose / Sin caja)</option>
                <option value="ACRYLIC_CASE">ACRYLIC_CASE (En protector acrílico)</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 font-semibold mb-1 flex items-center gap-1">
                <Lock size={11} className="text-zinc-500" />
                Precio de Compra (USD - Privado)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.purchase_price}
                onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 font-semibold mb-1">Notas Privadas del Coleccionista</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Detalles sobre accesorios, vendedor original o recuerdos de adquisición..."
              className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={() => navigate('/vault')}
              className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs rounded-xl flex items-center gap-1.5 transition"
            >
              <Save size={14} />
              <span>{saving ? 'Guardando...' : 'Guardar en Vault'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
