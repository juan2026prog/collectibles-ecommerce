import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Percent, Plus, Trash2, Save, X, Calendar, CreditCard, Tag, Building2, ChevronDown } from 'lucide-react';

// ═══ URUGUAYAN BANK CARDS ═══
const UY_CARDS = [
  { id: 'oca', name: 'OCA', color: '#E31937', textColor: '#fff', bins: ['603199'] },
  { id: 'oca_blue', name: 'OCA Blue', color: '#1A73E8', textColor: '#fff', bins: ['650501'] },
  { id: 'mi_dinero', name: 'Mi Dinero', color: '#00B140', textColor: '#fff', bins: ['603693'] },
  { id: 'visa', name: 'Visa', color: '#1A1F71', textColor: '#fff', bins: ['4'] },
  { id: 'mastercard', name: 'Mastercard', color: '#EB001B', textColor: '#fff', bins: ['51','52','53','54','55','2221'] },
  { id: 'amex', name: 'American Express', color: '#006FCF', textColor: '#fff', bins: ['34','37'] },
  { id: 'santander', name: 'Santander', color: '#EC0000', textColor: '#fff', bins: [] },
  { id: 'bbva', name: 'BBVA', color: '#004481', textColor: '#fff', bins: [] },
  { id: 'itau', name: 'Itaú', color: '#FF6600', textColor: '#fff', bins: [] },
  { id: 'brou', name: 'BROU', color: '#003366', textColor: '#fff', bins: [] },
  { id: 'scotiabank', name: 'Scotiabank', color: '#D92231', textColor: '#fff', bins: [] },
  { id: 'prex', name: 'Prex', color: '#6C2DC7', textColor: '#fff', bins: [] },
  { id: 'anda', name: 'Anda', color: '#FF8C00', textColor: '#fff', bins: [] },
  { id: 'cabal', name: 'Cabal', color: '#004D40', textColor: '#fff', bins: ['604'] },
  { id: 'creditel', name: 'Creditel', color: '#8B0000', textColor: '#fff', bins: [] },
  { id: 'passcard', name: 'PassCard', color: '#2E7D32', textColor: '#fff', bins: [] },
  { id: 'lider', name: 'Líder', color: '#F4511E', textColor: '#fff', bins: ['606'] },
];

interface Promo {
  id?: string;
  name: string;
  discount_type: string;
  discount_value: number;
  target_type: string;
  target_id: string | null;
  min_quantity: number | null;
  is_stackable: boolean;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
  bank_name: string;
  card_bins: string[];
  min_purchase: number;
  max_discount: number;
  promo_label: string;
}

const emptyPromo: Promo = {
  name: '', discount_type: 'percentage', discount_value: 10, target_type: 'all', target_id: null,
  min_quantity: null, is_stackable: false, is_active: true, starts_at: '', ends_at: '',
  bank_name: '', card_bins: [], min_purchase: 0, max_discount: 0, promo_label: '',
};

export default function AdminPromotions() {
  const [promos, setPromos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Promo | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { fetchPromos(); }, []);

  async function fetchPromos() {
    setLoading(true);
    const { data } = await supabase.from('promotions').select('*').order('created_at', { ascending: false });
    setPromos(data || []);
    setLoading(false);
  }

  function startNew() { setEditing({ ...emptyPromo }); }

  function selectCard(cardId: string) {
    if (!editing) return;
    const card = UY_CARDS.find(c => c.id === cardId);
    if (!card) return;
    setEditing({
      ...editing,
      bank_name: card.name,
      card_bins: card.bins,
      promo_label: `${editing.discount_value}% OFF con ${card.name}`,
    });
  }

  async function savePromo() {
    if (!editing || !editing.name) return;
    const payload: any = {
      name: editing.name,
      discount_type: editing.discount_type,
      discount_value: editing.discount_value,
      target_type: editing.target_type,
      target_id: editing.target_id || null,
      min_quantity: editing.min_quantity,
      is_stackable: editing.is_stackable,
      is_active: editing.is_active,
      starts_at: editing.starts_at || null,
      ends_at: editing.ends_at || null,
      bank_name: editing.bank_name || null,
      card_bins: editing.card_bins?.length ? editing.card_bins : null,
      min_purchase: editing.min_purchase || 0,
      max_discount: editing.max_discount || 0,
      promo_label: editing.promo_label || null,
    };
    if (editing.id) {
      await supabase.from('promotions').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('promotions').insert(payload);
    }
    setSaved(true); setTimeout(() => setSaved(false), 2000);
    setEditing(null); fetchPromos();
  }

  async function deletePromo(id: string) {
    if (!confirm('¿Eliminar esta promoción?')) return;
    await supabase.from('promotions').delete().eq('id', id);
    fetchPromos();
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('promotions').update({ is_active: !current }).eq('id', id);
    setPromos(prev => prev.map(p => p.id === id ? { ...p, is_active: !current } : p));
  }

  const typeLabels: Record<string, string> = {
    percentage: 'Descuento %', fixed: 'Monto Fijo', '2x1': '2x1', buy_x_get_y: 'Lleva X, Paga Y', bank_discount: 'Promo Bancaria',
  };

  const getCardColor = (bankName: string) => {
    const card = UY_CARDS.find(c => c.name === bankName);
    return card?.color || '#6B7280';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Percent className="w-6 h-6 text-primary-600" /> Promociones</h2>
          <p className="text-sm text-gray-500 mt-1">Descuentos porcentuales, 2x1, promos bancarias y por cantidad</p>
        </div>
        <div className="flex gap-2">
          {saved && <span className="text-sm font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 flex items-center gap-1"><Save className="w-4 h-4" /> Guardado</span>}
          <button onClick={startNew} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Nueva Promoción</button>
        </div>
      </div>

      {/* Editor */}
      {editing && (
        <div className="bg-white rounded-xl border-2 border-primary-200 shadow-lg p-6 space-y-5">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-lg">{editing.id ? 'Editar' : 'Nueva'} Promoción</h3>
            <button onClick={() => setEditing(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5 text-gray-400" /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Nombre</label>
              <input className="form-input w-full" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Hot Sale 2026" />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Tipo</label>
              <select className="form-input w-full" value={editing.discount_type} onChange={e => setEditing({ ...editing, discount_type: e.target.value })}>
                <option value="percentage">Descuento Porcentual (%)</option>
                <option value="fixed">Monto Fijo ($)</option>
                <option value="2x1">2x1</option>
                <option value="buy_x_get_y">Lleva X, Paga Y</option>
                <option value="bank_discount">Promoción Bancaria</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Valor {editing.discount_type === 'percentage' || editing.discount_type === 'bank_discount' ? '(%)' : '($)'}</label>
              <input type="number" className="form-input w-full" value={editing.discount_value} onChange={e => {
                const val = +e.target.value;
                setEditing({ ...editing, discount_value: val, promo_label: editing.bank_name ? `${val}% OFF con ${editing.bank_name}` : editing.promo_label });
              }} />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Compra Mínima ($)</label>
              <input type="number" className="form-input w-full" value={editing.min_purchase} onChange={e => setEditing({ ...editing, min_purchase: +e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Tope Descuento ($)</label>
              <input type="number" className="form-input w-full" value={editing.max_discount} onChange={e => setEditing({ ...editing, max_discount: +e.target.value })} placeholder="0 = sin tope" />
            </div>
          </div>

          {/* ═══ BANK CARD SELECTOR ═══ */}
          {editing.discount_type === 'bank_discount' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">
                  <Building2 className="w-3.5 h-3.5 inline mr-1" />
                  Tarjeta / Banco / Emisor
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {UY_CARDS.map(card => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => selectCard(card.id)}
                      className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all duration-200 hover:scale-[1.02] ${
                        editing.bank_name === card.name
                          ? 'border-blue-500 shadow-lg shadow-blue-100 ring-2 ring-blue-200'
                          : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
                      }`}
                    >
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0"
                        style={{ backgroundColor: card.color, color: card.textColor }}
                      >
                        {card.name.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="text-xs font-bold text-gray-800 leading-tight">{card.name}</span>
                      {editing.bank_name === card.name && (
                        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {editing.bank_name && (
                <div className="bg-gradient-to-r from-gray-50 to-blue-50/30 rounded-xl p-4 border border-blue-100">
                  <div className="flex items-center gap-3 mb-3">
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black"
                      style={{ backgroundColor: getCardColor(editing.bank_name), color: '#fff' }}
                    >
                      {editing.bank_name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{editing.bank_name}</p>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Seleccionado</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Etiqueta visible al cliente</label>
                    <input 
                      className="form-input w-full" 
                      value={editing.promo_label} 
                      onChange={e => setEditing({ ...editing, promo_label: e.target.value })} 
                      placeholder={`${editing.discount_value}% OFF con ${editing.bank_name}`} 
                    />
                  </div>
                </div>
              )}

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <strong>💡 ¿Cómo funciona?</strong> El cliente verá las promociones bancarias activas en el checkout. Al pagar con <strong>dLocal Go</strong>, 
                el sistema identifica la tarjeta por su BIN (primeros dígitos). Si coincide con la tarjeta de la promo, el descuento se aplica automáticamente al total.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Fecha Inicio</label>
              <input type="datetime-local" className="form-input w-full" value={editing.starts_at} onChange={e => setEditing({ ...editing, starts_at: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Fecha Fin</label>
              <input type="datetime-local" className="form-input w-full" value={editing.ends_at} onChange={e => setEditing({ ...editing, ends_at: e.target.value })} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} className="w-5 h-5 rounded" />
                <span className="text-sm font-bold">Promoción Activa</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setEditing(null)} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={savePromo} className="btn-primary text-sm flex items-center gap-2"><Save className="w-4 h-4" /> Guardar</button>
          </div>
        </div>
      )}

      {/* Promos List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 animate-pulse">Cargando promociones...</div>
      ) : promos.length === 0 && !editing ? (
        <div className="bg-white p-12 rounded-xl border border-dashed border-gray-300 text-center">
          <Tag className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p className="font-bold text-gray-500">No hay promociones activas</p>
          <button onClick={startNew} className="mt-4 btn-primary text-sm">Crear primera promoción</button>
        </div>
      ) : (
        <div className="space-y-3">
          {promos.map(p => {
            const now = new Date();
            const start = p.starts_at ? new Date(p.starts_at) : null;
            const end = p.ends_at ? new Date(p.ends_at) : null;
            const isExpired = end && end < now;
            const isUpcoming = start && start > now;
            const isBank = p.discount_type === 'bank_discount';

            return (
              <div key={p.id} className={`bg-white rounded-xl border shadow-sm p-5 flex items-center justify-between hover:shadow-md transition-shadow ${isExpired ? 'opacity-60 border-gray-200' : 'border-gray-200'}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm ${
                    isBank ? '' :
                    p.discount_type === 'percentage' ? 'bg-green-100 text-green-700' :
                    'bg-purple-100 text-purple-700'
                  }`}
                    style={isBank ? { backgroundColor: getCardColor(p.bank_name || ''), color: '#fff' } : {}}
                  >
                    {isBank ? (p.bank_name || 'BK').substring(0, 2).toUpperCase() :
                     p.discount_type === 'percentage' ? `${p.discount_value}%` : 
                     p.discount_type === '2x1' ? '2x1' : `$${p.discount_value}`}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-gray-900">{p.name}</h4>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${p.is_active && !isExpired ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
                        {isExpired ? 'Expirada' : isUpcoming ? 'Próxima' : p.is_active ? 'Activa' : 'Pausada'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-600">{typeLabels[p.discount_type] || p.discount_type}</span>
                      {isBank && p.bank_name && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black text-white" style={{ backgroundColor: getCardColor(p.bank_name) }}>
                          <CreditCard className="w-3 h-3" /> {p.bank_name} — {p.discount_value}% OFF
                        </span>
                      )}
                      {p.promo_label && !isBank && <span>· {p.promo_label}</span>}
                      {p.min_purchase > 0 && <span className="text-gray-400">· Mín: ${p.min_purchase}</span>}
                      {p.max_discount > 0 && <span className="text-gray-400">· Tope: ${p.max_discount}</span>}
                      {start && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {start.toLocaleDateString('es')}</span>}
                      {end && <span>→ {end.toLocaleDateString('es')}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => toggleActive(p.id, p.is_active)} className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-colors ${p.is_active ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>
                    {p.is_active ? 'Pausar' : 'Activar'}
                  </button>
                  <button onClick={() => setEditing({
                    ...emptyPromo,
                    ...p,
                    starts_at: p.starts_at ? new Date(p.starts_at).toISOString().slice(0, 16) : '',
                    ends_at: p.ends_at ? new Date(p.ends_at).toISOString().slice(0, 16) : '',
                    card_bins: p.card_bins || [],
                    bank_name: p.bank_name || '',
                    promo_label: p.promo_label || '',
                  })} className="btn-secondary text-xs py-1.5 px-3">Editar</button>
                  <button onClick={() => deletePromo(p.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
