import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Percent, Plus, Pencil, Trash2, Save, X, Calendar, CreditCard, Tag, Building2, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

// ═══ URUGUAYAN BANK CARDS ═══
const UY_CARDS = [
  { id: 'oca', name: 'OCA', color: '#E31937', textColor: '#fff', bins: ['603199'] },
  { id: 'oca_blue', name: 'OCA Blue', color: '#1A73E8', textColor: '#fff', bins: ['650501'] },
  { id: 'mi_dinero', name: 'Mi Dinero', color: '#00B140', textColor: '#fff', bins: ['603693'] },
  { id: 'visa', name: 'Visa', color: '#1A1F71', textColor: '#fff', bins: ['4'] },
  { id: 'mastercard', name: 'Mastercard', color: '#EB001B', textColor: '#fff', bins: ['51', '52', '53', '54', '55', '2221'] },
  { id: 'amex', name: 'American Express', color: '#006FCF', textColor: '#fff', bins: ['34', '37'] },
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
  priority: number;
  badge_text: string;
  badge_color: string;
  badge_bg: string;
  inclusions_brand_ids: string[];
  inclusions_category_ids: string[];
  inclusions_group_ids: string[];
  inclusions_product_ids: string;
  inclusions_tag_ids: string[];
  exclusions_brand_ids: string[];
  exclusions_category_ids: string[];
  exclusions_group_ids: string[];
  exclusions_product_ids: string;
  exclusions_tag_ids: string[];
  tiers: { min_quantity: number, discount_type: string, discount_value: number }[];
}

const emptyPromo: Promo = {
  name: '', discount_type: 'percentage', discount_value: 10, target_type: 'all', target_id: null,
  min_quantity: null, is_stackable: false, is_active: true, starts_at: '', ends_at: '',
  bank_name: '', card_bins: [], min_purchase: 0, max_discount: 0, promo_label: '',
  priority: 0, badge_text: '', badge_color: '#ffffff', badge_bg: '#E31937',
  inclusions_brand_ids: [], inclusions_category_ids: [], inclusions_group_ids: [], inclusions_product_ids: '', inclusions_tag_ids: [],
  exclusions_brand_ids: [], exclusions_category_ids: [], exclusions_group_ids: [], exclusions_product_ids: '', exclusions_tag_ids: [],
  tiers: []
};

const MultiSelectCheckbox = ({ title, items, selectedIds, onChange, className = '' }: any) => {
  return (
    <div className={className}>
      <label className="block text-xs font-bold text-gray-600 mb-1">{title}</label>
      <div className="border border-gray-200 rounded-lg max-h-32 overflow-y-auto p-2 bg-white space-y-1">
        {items.map((item: any) => (
          <label key={item.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 p-1 rounded">
            <input 
              type="checkbox" 
              className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              checked={selectedIds.includes(item.id)}
              onChange={(e) => {
                const newIds = e.target.checked
                  ? [...selectedIds, item.id]
                  : selectedIds.filter((id: string) => id !== item.id);
                onChange(newIds);
              }}
            />
            <span className="truncate">{item.name}</span>
          </label>
        ))}
        {items.length === 0 && <span className="text-xs text-gray-400 italic">No hay opciones disponibles</span>}
      </div>
    </div>
  );
};

export default function VPromotions() {
  const { user } = useAuth();
  const [promos, setPromos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Promo | null>(null);
  const [saved, setSaved] = useState(false);
  
  const [brands, setBrands] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => { 
    if (user) {
      fetchPromos();
      fetchMetadata();
    }
  }, [user]);

  async function fetchMetadata() {
    try {
      const [{ data: b }, { data: c }, { data: t }, { data: g }] = await Promise.all([
        supabase.from('brands').select('id, name').eq('owner_vendor_id', user!.id),
        supabase.from('categories').select('id, name').or(`owner_vendor_id.eq.${user!.id},owner_vendor_id.is.null`),
        supabase.from('tags').select('id, name'),
        supabase.from('product_groups').select('id, name').eq('owner_vendor_id', user!.id)
      ]);
      setBrands(b || []);
      setCategories(c || []);
      setTags(t || []);
      setGroups(g || []);
    } catch(e) {
      console.warn("Could not fetch metadata", e);
    }
  }

  async function fetchPromos() {
    setLoading(true);
    const { data } = await supabase.from('promotions').select('*').eq('owner_vendor_id', user!.id).order('created_at', { ascending: false });
    
    if (data && data.length > 0) {
      const promoIds = data.map(p => p.id);
      const [{ data: targets }, { data: exclusions }, { data: tiers }] = await Promise.all([
        supabase.from('promotion_targets').select('*').in('promotion_id', promoIds),
        supabase.from('promotion_exclusions').select('*').in('promotion_id', promoIds),
        supabase.from('promotion_tiers').select('*').in('promotion_id', promoIds)
      ]);

      const fullPromos = data.map(p => {
        const pTargets = (targets || []).filter(t => t.promotion_id === p.id);
        const pExclusions = (exclusions || []).filter(e => e.promotion_id === p.id);
        const pTiers = (tiers || []).filter(t => t.promotion_id === p.id).sort((a,b) => b.min_quantity - a.min_quantity);
        return {
          ...p,
          inclusions_brand_ids: pTargets.filter(t => t.target_type === 'brand').map(t => t.target_id),
          inclusions_category_ids: pTargets.filter(t => t.target_type === 'category').map(t => t.target_id),
          inclusions_tag_ids: pTargets.filter(t => t.target_type === 'tag').map(t => t.target_id),
          inclusions_group_ids: pTargets.filter(t => t.target_type === 'group').map(t => t.target_id),
          inclusions_product_ids: pTargets.filter(t => t.target_type === 'product').map(t => t.target_id).join(', '),
          exclusions_brand_ids: pExclusions.filter(t => t.target_type === 'brand').map(t => t.target_id),
          exclusions_category_ids: pExclusions.filter(t => t.target_type === 'category').map(t => t.target_id),
          exclusions_tag_ids: pExclusions.filter(t => t.target_type === 'tag').map(t => t.target_id),
          exclusions_group_ids: pExclusions.filter(t => t.target_type === 'group').map(t => t.target_id),
          exclusions_product_ids: pExclusions.filter(t => t.target_type === 'product').map(t => t.target_id).join(', '),
          tiers: pTiers
        };
      });
      setPromos(fullPromos);
    } else {
      setPromos([]);
    }
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
      priority: editing.priority || 0,
      badge_text: editing.badge_text || null,
      badge_color: editing.badge_color || null,
      badge_bg: editing.badge_bg || null,
      owner_vendor_id: user!.id
    };
    
    let promoId = editing.id;
    try {
      if (editing.id) {
        await supabase.from('promotions').update(payload).eq('id', editing.id);
      } else {
        const { data, error } = await supabase.from('promotions').insert(payload).select('id').single();
        if (error) throw error;
        promoId = data.id;
      }

      if (promoId) {
        try {
          if (editing.id) {
            await supabase.from('promotion_targets').delete().eq('promotion_id', promoId);
            await supabase.from('promotion_exclusions').delete().eq('promotion_id', promoId);
          }

          const targets = [];
          editing.inclusions_brand_ids.forEach(id => targets.push({ promotion_id: promoId, target_type: 'brand', target_id: id }));
          editing.inclusions_category_ids.forEach(id => targets.push({ promotion_id: promoId, target_type: 'category', target_id: id }));
          editing.inclusions_tag_ids.forEach(id => targets.push({ promotion_id: promoId, target_type: 'tag', target_id: id }));
          editing.inclusions_group_ids.forEach(id => targets.push({ promotion_id: promoId, target_type: 'group', target_id: id }));
          if (editing.inclusions_product_ids) {
            editing.inclusions_product_ids.split(',').map(s=>s.trim()).filter(Boolean).forEach(id => targets.push({ promotion_id: promoId, target_type: 'product', target_id: id }));
          }
          // Siempre incluimos solo los productos de este vendor
          targets.push({ promotion_id: promoId, target_type: 'vendor', target_id: user!.id });

          const exclusions = [];
          editing.exclusions_brand_ids.forEach(id => exclusions.push({ promotion_id: promoId, target_type: 'brand', target_id: id }));
          editing.exclusions_category_ids.forEach(id => exclusions.push({ promotion_id: promoId, target_type: 'category', target_id: id }));
          editing.exclusions_tag_ids.forEach(id => exclusions.push({ promotion_id: promoId, target_type: 'tag', target_id: id }));
          editing.exclusions_group_ids.forEach(id => exclusions.push({ promotion_id: promoId, target_type: 'group', target_id: id }));
          if (editing.exclusions_product_ids) {
            editing.exclusions_product_ids.split(',').map(s=>s.trim()).filter(Boolean).forEach(id => exclusions.push({ promotion_id: promoId, target_type: 'product', target_id: id }));
          }

          if (targets.length > 0) await supabase.from('promotion_targets').insert(targets);
          if (exclusions.length > 0) await supabase.from('promotion_exclusions').insert(exclusions);
          
          if (editing.discount_type === 'tiered') {
             await supabase.from('promotion_tiers').delete().eq('promotion_id', promoId);
             const validTiers = editing.tiers.filter(t => t.min_quantity > 0 && t.discount_value > 0);
             if (validTiers.length > 0) {
               await supabase.from('promotion_tiers').insert(validTiers.map(t => ({ ...t, promotion_id: promoId })));
             }
          }
        } catch (e) {
          console.warn("[Promotions Engine] Could not save targets/exclusions:", e);
        }
      }
    } catch(e) {
      console.error(e);
      alert('Error guardando la promoción');
      return;
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
    percentage: 'Descuento %', fixed: 'Monto Fijo', '2x1': '2x1', buy_x_get_y: 'Lleva X, Paga Y', bank_discount: 'Promo Bancaria', tiered: 'Tiers'
  };

  const getCardColor = (bankName: string) => {
    const card = UY_CARDS.find(c => c.name === bankName);
    return card?.color || '#6B7280';
  };

  return (
    <div className="space-y-6 text-gray-900 animation-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Percent className="w-6 h-6 text-blue-600" /> Mis Promociones</h2>
          <p className="text-sm text-gray-500 mt-1">Crea descuentos aplicables exclusivamente a tu catálogo</p>
        </div>
        <div className="flex gap-2">
          {saved && <span className="text-sm font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 flex items-center gap-1"><Save className="w-4 h-4" /> Guardado</span>}
          <button onClick={startNew} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors"><Plus className="w-4 h-4" /> Nueva Promoción</button>
        </div>
      </div>

      {editing && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 space-y-6 max-h-[85vh] overflow-y-auto">
          <div className="flex justify-between items-center pb-4 border-b">
            <h3 className="font-bold text-xl">{editing.id ? 'Editar' : 'Nueva'} Promoción</h3>
            <button onClick={() => setEditing(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Nombre Interno</label>
              <input className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Ej. Cyber Lunes" />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Tipo de Descuento</label>
              <select className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={editing.discount_type} onChange={e => setEditing({ ...editing, discount_type: e.target.value })}>
                <option value="percentage">Descuento Porcentual (%)</option>
                <option value="fixed">Monto Fijo ($)</option>
                <option value="2x1">2x1</option>
                <option value="buy_x_get_y">Lleva X, Paga Y</option>
                <option value="bank_discount">Promoción Bancaria</option>
                <option value="tiered">Tiers (Descuento por Cantidad)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Valor {editing.discount_type === 'percentage' || editing.discount_type === 'bank_discount' ? '(%)' : '($)'}</label>
              <input type="number" className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={editing.discount_value} onChange={e => {
                const val = +e.target.value;
                setEditing({ ...editing, discount_value: val, promo_label: editing.bank_name ? `${val}% OFF con ${editing.bank_name}` : editing.promo_label });
              }} />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Compra Mínima ($)</label>
              <input type="number" className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={editing.min_purchase} onChange={e => setEditing({ ...editing, min_purchase: +e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Tope Descuento ($)</label>
              <input type="number" className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={editing.max_discount} onChange={e => setEditing({ ...editing, max_discount: +e.target.value })} placeholder="0 = sin tope" />
            </div>
          </div>

          {editing.discount_type === 'tiered' && (
            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
              <h4 className="text-sm font-bold text-blue-800 mb-3">Niveles de Descuento (Tiers)</h4>
              <p className="text-xs text-blue-600 mb-3">Añade los diferentes niveles de descuento según la cantidad comprada. El nivel aplicable será el de mayor "Cantidad Mínima" alcanzado.</p>
              
              <div className="space-y-2 mb-3">
                {editing.tiers.map((tier, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input type="number" placeholder="Cant. Min." className="w-24 bg-white border border-gray-200 rounded px-2 py-1.5 text-sm outline-none" value={tier.min_quantity} onChange={e => {
                      const newTiers = [...editing.tiers];
                      newTiers[idx].min_quantity = +e.target.value;
                      setEditing({ ...editing, tiers: newTiers });
                    }} />
                    <select className="w-32 bg-white border border-gray-200 rounded px-2 py-1.5 text-sm outline-none" value={tier.discount_type} onChange={e => {
                      const newTiers = [...editing.tiers];
                      newTiers[idx].discount_type = e.target.value;
                      setEditing({ ...editing, tiers: newTiers });
                    }}>
                      <option value="percentage">% OFF</option>
                      <option value="fixed">$ Fijo</option>
                    </select>
                    <input type="number" placeholder="Valor" className="w-24 bg-white border border-gray-200 rounded px-2 py-1.5 text-sm outline-none" value={tier.discount_value} onChange={e => {
                      const newTiers = [...editing.tiers];
                      newTiers[idx].discount_value = +e.target.value;
                      setEditing({ ...editing, tiers: newTiers });
                    }} />
                    <button onClick={() => {
                      const newTiers = editing.tiers.filter((_, i) => i !== idx);
                      setEditing({ ...editing, tiers: newTiers });
                    }} className="px-2 py-1.5 bg-red-100 text-red-700 rounded text-xs font-bold hover:bg-red-200">
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => setEditing({ ...editing, tiers: [...editing.tiers, { min_quantity: 0, discount_type: 'percentage', discount_value: 0 }] })} className="px-3 py-1.5 bg-white border border-blue-200 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-50 shadow-sm">
                + Añadir Nivel
              </button>
            </div>
          )}

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
                      className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all duration-200 hover:scale-[1.02] ${editing.bank_name === card.name
                          ? 'border-blue-500 shadow-md bg-blue-50/50'
                          : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                        }`}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0"
                        style={{ backgroundColor: card.color, color: card.textColor }}
                      >
                        {card.name.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="text-xs font-bold text-gray-800 leading-tight">{card.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {editing.bank_name && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shadow-sm"
                      style={{ backgroundColor: getCardColor(editing.bank_name), color: '#fff' }}
                    >
                      {editing.bank_name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{editing.bank_name}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Etiqueta visible al cliente</label>
                    <input
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      value={editing.promo_label}
                      onChange={e => setEditing({ ...editing, promo_label: e.target.value })}
                      placeholder={`${editing.discount_value}% OFF con ${editing.bank_name}`}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Fecha Inicio</label>
              <input type="datetime-local" className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={editing.starts_at} onChange={e => setEditing({ ...editing, starts_at: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Fecha Fin</label>
              <input type="datetime-local" className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={editing.ends_at} onChange={e => setEditing({ ...editing, ends_at: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Prioridad (Mayor Gana)</label>
              <input type="number" className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={editing.priority} onChange={e => setEditing({ ...editing, priority: +e.target.value })} placeholder="Ej. 100" />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                <span className="text-sm font-bold text-gray-900">Activa</span>
              </label>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
            <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><Tag className="w-4 h-4 text-gray-500"/> Etiqueta Visual (Badge)</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Texto (Ej: HOT SALE)</label>
                <input className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={editing.badge_text} onChange={e => setEditing({ ...editing, badge_text: e.target.value })} placeholder="Dejar vacío si no aplica" />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Color Fondo</label>
                <div className="flex gap-2">
                  <input type="color" className="w-10 h-10 p-1 rounded-lg border border-gray-200 cursor-pointer bg-white" value={editing.badge_bg || '#E31937'} onChange={e => setEditing({ ...editing, badge_bg: e.target.value })} />
                  <input className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono uppercase" value={editing.badge_bg} onChange={e => setEditing({ ...editing, badge_bg: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1.5">Color Texto</label>
                <div className="flex gap-2">
                  <input type="color" className="w-10 h-10 p-1 rounded-lg border border-gray-200 cursor-pointer bg-white" value={editing.badge_color || '#ffffff'} onChange={e => setEditing({ ...editing, badge_color: e.target.value })} />
                  <input className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono uppercase" value={editing.badge_color} onChange={e => setEditing({ ...editing, badge_color: e.target.value })} />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
            <div className="bg-green-50/50 p-5 rounded-xl border border-green-200 shadow-sm">
              <h4 className="text-sm font-bold text-green-800 mb-3 flex items-center gap-2">✅ Inclusiones</h4>
              <p className="text-xs text-green-600 mb-4 bg-green-100 p-2 rounded-lg">Aplica solo a los productos que cumplan con estas condiciones. Si dejas vacío, aplica a todo tu catálogo.</p>
              <div className="space-y-4">
                <MultiSelectCheckbox title="Marcas" items={brands} selectedIds={editing.inclusions_brand_ids} onChange={(ids: string[]) => setEditing({ ...editing, inclusions_brand_ids: ids })} />
                <MultiSelectCheckbox title="Categorías" items={categories} selectedIds={editing.inclusions_category_ids} onChange={(ids: string[]) => setEditing({ ...editing, inclusions_category_ids: ids })} />
                <MultiSelectCheckbox title="Tags" items={tags} selectedIds={editing.inclusions_tag_ids} onChange={(ids: string[]) => setEditing({ ...editing, inclusions_tag_ids: ids })} />
                <MultiSelectCheckbox title="Grupos de Productos" items={groups} selectedIds={editing.inclusions_group_ids} onChange={(ids: string[]) => setEditing({ ...editing, inclusions_group_ids: ids })} />
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">IDs de Productos específicos (comas)</label>
                  <textarea className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 outline-none resize-none" rows={2} value={editing.inclusions_product_ids} onChange={e => setEditing({ ...editing, inclusions_product_ids: e.target.value })} placeholder="uuid-1, uuid-2..."></textarea>
                </div>
              </div>
            </div>

            <div className="bg-red-50/50 p-5 rounded-xl border border-red-200 shadow-sm">
              <h4 className="text-sm font-bold text-red-800 mb-3 flex items-center gap-2">❌ Exclusiones</h4>
              <p className="text-xs text-red-600 mb-4 bg-red-100 p-2 rounded-lg">Tiene prioridad sobre las inclusiones. Estos elementos NUNCA tendrán el descuento.</p>
              <div className="space-y-4">
                <MultiSelectCheckbox title="Excluir Marcas" items={brands} selectedIds={editing.exclusions_brand_ids} onChange={(ids: string[]) => setEditing({ ...editing, exclusions_brand_ids: ids })} />
                <MultiSelectCheckbox title="Excluir Categorías" items={categories} selectedIds={editing.exclusions_category_ids} onChange={(ids: string[]) => setEditing({ ...editing, exclusions_category_ids: ids })} />
                <MultiSelectCheckbox title="Excluir Tags" items={tags} selectedIds={editing.exclusions_tag_ids} onChange={(ids: string[]) => setEditing({ ...editing, exclusions_tag_ids: ids })} />
                <MultiSelectCheckbox title="Excluir Grupos de Productos" items={groups} selectedIds={editing.exclusions_group_ids} onChange={(ids: string[]) => setEditing({ ...editing, exclusions_group_ids: ids })} />
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Excluir IDs de Productos específicos</label>
                  <textarea className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 outline-none resize-none" rows={2} value={editing.exclusions_product_ids} onChange={e => setEditing({ ...editing, exclusions_product_ids: e.target.value })} placeholder="uuid-1, uuid-2..."></textarea>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t">
            <button onClick={() => setEditing(null)} className="px-6 py-2 bg-white text-gray-700 font-bold border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancelar</button>
            <button onClick={savePromo} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-md"><Save className="w-4 h-4" /> Guardar Promoción</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400 animate-pulse font-medium">Cargando tus promociones...</div>
      ) : promos.length === 0 && !editing ? (
        <div className="bg-white p-12 rounded-xl border border-dashed border-gray-300 text-center shadow-sm">
          <Tag className="w-12 h-12 mx-auto mb-4 text-blue-200" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">No tienes promociones activas</h3>
          <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">Atrae más clientes ofreciendo descuentos porcentuales, montos fijos o promociones bancarias aplicables solo a tus productos.</p>
          <button onClick={startNew} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold transition-colors shadow-md">Crear mi primera promoción</button>
        </div>
      ) : !editing ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {promos.map(p => {
            const now = new Date();
            const start = p.starts_at ? new Date(p.starts_at) : null;
            const end = p.ends_at ? new Date(p.ends_at) : null;
            const isExpired = end && end < now;
            const isUpcoming = start && start > now;
            const isBank = p.discount_type === 'bank_discount';

            return (
              <div key={p.id} className={`bg-white rounded-xl border shadow-sm flex flex-col hover:shadow-md transition-shadow ${isExpired ? 'opacity-60 border-gray-200' : 'border-gray-200'}`}>
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-lg shadow-inner ${isBank ? '' :
                        p.discount_type === 'percentage' ? 'bg-green-100 text-green-700' :
                          'bg-purple-100 text-purple-700'
                      }`}
                      style={isBank ? { backgroundColor: getCardColor(p.bank_name || ''), color: '#fff' } : {}}
                    >
                      {isBank ? (p.bank_name || 'BK').substring(0, 2).toUpperCase() :
                        p.discount_type === 'percentage' ? `${p.discount_value}%` :
                          p.discount_type === '2x1' ? '2x1' : `$${p.discount_value}`}
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${p.is_active && !isExpired ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      {isExpired ? 'Expirada' : isUpcoming ? 'Próxima' : p.is_active ? 'Activa' : 'Pausada'}
                    </span>
                  </div>
                  
                  <h4 className="font-bold text-gray-900 text-lg mb-1 leading-tight">{p.name}</h4>
                  <div className="text-xs text-gray-500 space-y-1.5 flex-1 mt-3">
                    <p className="flex items-center gap-2"><span className="font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{typeLabels[p.discount_type] || p.discount_type}</span></p>
                    {isBank && p.bank_name && (
                      <p className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black text-white shadow-sm mt-1" style={{ backgroundColor: getCardColor(p.bank_name) }}>
                        <CreditCard className="w-3 h-3" /> {p.bank_name} — {p.discount_value}% OFF
                      </p>
                    )}
                    {p.promo_label && !isBank && <p className="text-blue-600 font-medium">✨ {p.promo_label}</p>}
                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-50">
                      {p.min_purchase > 0 && <p><span className="text-gray-400 block text-[10px] uppercase">Mínimo</span> ${p.min_purchase}</p>}
                      {p.max_discount > 0 && <p><span className="text-gray-400 block text-[10px] uppercase">Tope</span> ${p.max_discount}</p>}
                    </div>
                  </div>
                  
                  {(start || end) && (
                    <div className="mt-4 pt-3 border-t border-gray-100 text-[10px] text-gray-500 font-mono flex flex-col gap-1">
                      {start && <p className="flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Inicia: {start.toLocaleString('es')}</p>}
                      {end && <p className="flex items-center gap-1.5 text-red-500"><Calendar className="w-3 h-3" /> Vence: {end.toLocaleString('es')}</p>}
                    </div>
                  )}
                </div>
                
                <div className="p-3 bg-gray-50 border-t border-gray-100 rounded-b-xl flex gap-2">
                  <button onClick={() => toggleActive(p.id, p.is_active)} className={`flex-1 text-xs py-2 rounded-lg font-bold transition-colors ${p.is_active ? 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
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
                    priority: p.priority || 0,
                    badge_text: p.badge_text || '',
                    badge_color: p.badge_color || '#ffffff',
                    badge_bg: p.badge_bg || '#E31937',
                  })} className="px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => deletePromo(p.id)} className="px-3 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
