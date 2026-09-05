import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, Save, Share2, Sparkles, Image as ImageIcon, Star, Heart, Lock, Globe, ShieldCheck, Box, Tag, Award, Info } from 'lucide-react';
import type { VaultCondition, VaultBoxCondition, VaultStatus } from '../../plugins/collector-vault/types';
import { VaultShareCardModal, type ShareItemData } from './VaultShareCardModal';

// Diccionario de items demo de referencia
const DEMO_ITEMS_MAP: Record<string, any> = {
  'demo-vader': {
    custom_name: 'Darth Vader — Revenge of the Sith',
    brand_name: 'Hot Toys',
    line: 'Movie Masterpiece Series',
    franchise: 'STAR WARS',
    scale: '1:6',
    height: '35 cm',
    code_sku: 'MMS810 / SKU: 914499',
    material: 'PVC, ABS y Tejido Textil Premium',
    launch_price: 'USD 315',
    box_contents: 'Cuerpo articulado con traje de tela y armadura detallada, sable de luz LED, casco desmontable con interior esculpido, 8 pares de manos intercambiables, base con diorama iluminado.',
    status: 'OWNED' as VaultStatus,
    condition: 'MINT' as VaultCondition,
    box_condition: 'SEALED' as VaultBoxCondition,
    purchase_price: '315.00',
    purchase_date: '2026-08-15',
    rating: 5,
    is_favorite: true,
    is_featured: true,
    visibility: 'PUBLIC',
    notes: 'Una de las piezas centrales de mi colección Star Wars.',
    official_image_url: 'https://images.unsplash.com/photo-1585676623547-a006c6460114?auto=format&fit=crop&w=800&q=80',
    custom_image_url: 'https://images.unsplash.com/photo-1585676623547-a006c6460114?auto=format&fit=crop&w=800&q=80',
    slug: 'darth-vader-hot-toys'
  },
  'demo-goku': {
    custom_name: 'Son Goku — A Saiyan Raised on Earth',
    brand_name: 'Bandai Spirits · S.H.Figuarts',
    line: 'S.H.Figuarts',
    franchise: 'DRAGON BALL Z',
    scale: '14 CM',
    height: 'aprox. 14 cm',
    code_sku: 'BAS55030',
    material: 'PVC + ABS',
    launch_price: 'USD 35 (Reedición 2025)',
    box_contents: 'Figura articulada, 3 rostros de expresión intercambiables, 4 pares de manos alternativas, efecto especial.',
    status: 'OWNED' as VaultStatus,
    condition: 'EXCELLENT' as VaultCondition,
    box_condition: 'OPEN_BOX' as VaultBoxCondition,
    purchase_price: '35.00',
    purchase_date: '2026-03-10',
    rating: 5,
    is_favorite: false,
    is_featured: true,
    visibility: 'PUBLIC',
    notes: 'Mi Goku definitivo para la línea S.H.Figuarts.',
    official_image_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80',
    custom_image_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80',
    slug: 'son-goku-sh-figuarts'
  },
  'demo-batman': {
    custom_name: 'Batman 1989 #03',
    brand_name: 'Funko · Pop! Die-Cast',
    line: 'Pop! Die-Cast',
    franchise: 'BATMAN',
    scale: 'DIE-CAST',
    height: 'aprox. 10,2 cm',
    code_sku: 'Item 57869 (Box #03)',
    material: 'Metal Die-Cast fundido a presión',
    launch_price: 'USD 50',
    box_contents: 'Figura Die-Cast de metal pesado, caja acrílica de exhibición desmontable grabada a láser, estuche protector.',
    status: 'OWNED' as VaultStatus,
    condition: 'MINT' as VaultCondition,
    box_condition: 'ACRYLIC_CASE' as VaultBoxCondition,
    purchase_price: '50.00',
    purchase_date: '2026-01-20',
    rating: 4,
    is_favorite: false,
    is_featured: true,
    visibility: 'PUBLIC',
    notes: 'Batman 1989 es una de mis películas favoritas.',
    official_image_url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=800&q=80',
    custom_image_url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=800&q=80',
    slug: 'batman-1989-funko-die-cast'
  }
};

export default function VaultItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const isNew = id === 'new';
  const isDemo = id && (id.startsWith('demo') || id in DEMO_ITEMS_MAP);
  
  const [loading, setLoading] = useState(!isNew && !isDemo);
  const [saving, setSaving] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [activePhotoTab, setActivePhotoTab] = useState<'official' | 'custom'>('official');

  const [form, setForm] = useState({
    custom_name: '',
    brand_name: '',
    franchise: '',
    line: '',
    scale: '',
    height: '',
    code_sku: '',
    material: '',
    launch_price: '',
    box_contents: '',
    official_image_url: '',
    custom_image_url: '',
    status: 'OWNED' as VaultStatus,
    condition: 'MINT' as VaultCondition,
    box_condition: 'SEALED' as VaultBoxCondition,
    purchase_price: '',
    purchase_date: '',
    rating: 5,
    is_favorite: false,
    is_featured: false,
    visibility: 'PUBLIC',
    notes: ''
  });

  useEffect(() => {
    if (isDemo && id) {
      const demoData = DEMO_ITEMS_MAP[id] || DEMO_ITEMS_MAP['demo-vader'];
      setForm(demoData);
      setLoading(false);
    } else if (!isNew && id && user) {
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
          brand_name: data.brand_name || '',
          franchise: data.franchise || '',
          line: data.line || '',
          scale: data.scale || '',
          height: data.height || '',
          code_sku: data.code_sku || '',
          material: data.material || '',
          launch_price: data.launch_price || '',
          box_contents: data.box_contents || '',
          official_image_url: data.official_image_url || '',
          custom_image_url: data.custom_image_url || '',
          status: data.status || 'OWNED',
          condition: data.condition || 'MINT',
          box_condition: data.box_condition || 'SEALED',
          purchase_price: data.purchase_price ? String(data.purchase_price) : '',
          purchase_date: data.purchase_date || '',
          rating: data.rating || 5,
          is_favorite: !!data.is_favorite,
          is_featured: !!data.is_featured,
          visibility: data.visibility || 'PUBLIC',
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
        brand_name: form.brand_name || null,
        franchise: form.franchise || null,
        line: form.line || null,
        scale: form.scale || null,
        height: form.height || null,
        official_image_url: form.official_image_url || null,
        custom_image_url: form.custom_image_url || null,
        status: form.status,
        condition: form.condition,
        box_condition: form.box_condition,
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
        purchase_date: form.purchase_date || null,
        notes: form.notes,
        visibility: form.visibility,
        updated_at: new Date().toISOString()
      };

      if (isNew || isDemo) {
        await supabase.from('vault_items').insert({
          ...payload,
          created_at: new Date().toISOString()
        });
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

  if (loading) return <div className="py-24 text-center text-zinc-500">Cargando detalles de la pieza...</div>;

  const currentDisplayImage = activePhotoTab === 'custom' && form.custom_image_url
    ? form.custom_image_url
    : (form.official_image_url || form.custom_image_url);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 text-white space-y-8 animate-fade-in">
      {/* Top Breadcrumb & Share Actions */}
      <div className="flex items-center justify-between">
        <Link
          to="/vault"
          className="inline-flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white transition group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          <span>Volver a Mi Vault</span>
        </Link>

        <button
          type="button"
          onClick={() => setIsShareModalOpen(true)}
          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-black text-xs rounded-xl flex items-center gap-1.5 transition shadow-lg shadow-amber-500/20 cursor-pointer"
        >
          <Share2 size={14} />
          <span>Compartir Ficha ↗</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        
        {/* HERO SHOWCASE CARD */}
        <div className="bg-gradient-to-b from-zinc-900 via-zinc-950 to-black border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            
            {/* Left Image Showcase with Official / Custom Toggle */}
            <div className="md:col-span-5 space-y-3">
              <div className="w-full aspect-square bg-zinc-950 rounded-2xl border border-white/10 p-3 flex items-center justify-center overflow-hidden relative shadow-inner">
                {currentDisplayImage ? (
                  <img
                    src={currentDisplayImage}
                    alt={form.custom_name}
                    className="w-full h-full object-contain drop-shadow-2xl"
                  />
                ) : (
                  <div className="flex flex-col items-center text-zinc-600 gap-2">
                    <ImageIcon size={48} />
                    <span className="text-xs font-mono">Sin imagen asignada</span>
                  </div>
                )}

                <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-bold text-zinc-300 border border-white/10 flex items-center gap-1">
                  <ShieldCheck size={12} className="text-emerald-400" />
                  <span>{form.condition}</span>
                </div>
              </div>

              {/* Photo Source Selector */}
              <div className="flex items-center gap-1.5 bg-zinc-900/80 p-1 rounded-xl border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setActivePhotoTab('official')}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-[11px] transition cursor-pointer text-center ${
                    activePhotoTab === 'official'
                      ? 'bg-amber-500 text-black shadow'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Foto Oficial
                </button>
                <button
                  type="button"
                  onClick={() => setActivePhotoTab('custom')}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-[11px] transition cursor-pointer text-center ${
                    activePhotoTab === 'custom'
                      ? 'bg-amber-500 text-black shadow'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Mi Foto Real
                </button>
              </div>
            </div>

            {/* Right Summary Info */}
            <div className="md:col-span-7 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {form.franchise && (
                  <span className="text-[10px] font-black tracking-widest uppercase bg-amber-500/15 border border-amber-500/30 text-amber-400 px-2.5 py-0.5 rounded-md">
                    {form.franchise}
                  </span>
                )}
                {form.scale && (
                  <span className="text-[10px] font-black tracking-wider uppercase bg-zinc-800 text-zinc-300 px-2.5 py-0.5 rounded-md">
                    {form.scale}
                  </span>
                )}
                <span className="text-[10px] font-black tracking-wider uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-md">
                  {form.condition}
                </span>
              </div>

              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                  {form.custom_name || 'Nombre de la figura'}
                </h1>
                <p className="text-sm font-semibold text-zinc-400 mt-1">
                  {form.brand_name || 'Fabricante'} {form.line ? `· ${form.line}` : ''}
                </p>
              </div>

              {/* Rating Stars Bar */}
              <div className="flex items-center gap-2 py-1">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setForm({ ...form, rating: star })}
                      className="cursor-pointer transition hover:scale-110"
                    >
                      <Star
                        size={18}
                        className={star <= form.rating ? 'text-amber-400 fill-amber-400' : 'text-zinc-700'}
                      />
                    </button>
                  ))}
                </div>
                <span className="text-xs text-amber-300 font-bold ml-1">
                  ({form.rating} de 5 estrellas)
                </span>
              </div>

              {form.notes && (
                <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-4 font-serif italic text-sm text-zinc-300 leading-relaxed">
                  "{form.notes}"
                </div>
              )}

              {/* Badges: Favorite & Featured Toggles */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, is_favorite: !form.is_favorite })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border ${
                    form.is_favorite
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                      : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Heart size={13} className={form.is_favorite ? 'fill-rose-400 text-rose-400' : ''} />
                  <span>{form.is_favorite ? 'Marcada como Favorita' : 'Marcar Favorita'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setForm({ ...form, is_featured: !form.is_featured })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border ${
                    form.is_featured
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Star size={13} className={form.is_featured ? 'fill-amber-400 text-amber-400' : ''} />
                  <span>{form.is_featured ? 'Destacada en Portada' : 'Destacar en Portada'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 1: ESPECIFICACIONES OFICIALES DEL PRODUCTO */}
        <div className="bg-zinc-900/90 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="flex items-center gap-2.5 border-b border-white/10 pb-4">
            <Award size={18} className="text-amber-400" />
            <div>
              <h2 className="text-base font-black text-white">Especificaciones Oficiales de la Pieza</h2>
              <p className="text-xs text-zinc-400">Datos técnicos y de catálogo del fabricante</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Nombre / Título Oficial</label>
              <input
                type="text"
                required
                value={form.custom_name}
                onChange={(e) => setForm({ ...form, custom_name: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-white"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Fabricante / Marca</label>
              <input
                type="text"
                value={form.brand_name}
                onChange={(e) => setForm({ ...form, brand_name: e.target.value })}
                placeholder="Ej: Hot Toys, Bandai Spirits"
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-white"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Franquicia / Licencia</label>
              <input
                type="text"
                value={form.franchise}
                onChange={(e) => setForm({ ...form, franchise: e.target.value })}
                placeholder="Ej: Star Wars, Dragon Ball Z, Batman"
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-white"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Línea de Colección</label>
              <input
                type="text"
                value={form.line}
                onChange={(e) => setForm({ ...form, line: e.target.value })}
                placeholder="Ej: Movie Masterpiece Series, S.H.Figuarts"
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-white"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Escala</label>
              <input
                type="text"
                value={form.scale}
                onChange={(e) => setForm({ ...form, scale: e.target.value })}
                placeholder="Ej: 1:6, 1:12, 14 CM, Die-Cast"
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-white"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Altura</label>
              <input
                type="text"
                value={form.height}
                onChange={(e) => setForm({ ...form, height: e.target.value })}
                placeholder="Ej: 35 cm, 14 cm"
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-white"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Código / SKU / Box #</label>
              <input
                type="text"
                value={form.code_sku}
                onChange={(e) => setForm({ ...form, code_sku: e.target.value })}
                placeholder="Ej: MMS810, Box #03"
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-white font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-zinc-400 font-semibold mb-1">URL Foto Oficial del Catálogo</label>
              <input
                type="url"
                value={form.official_image_url}
                onChange={(e) => setForm({ ...form, official_image_url: e.target.value })}
                placeholder="https://ejemplo.com/foto-oficial.jpg"
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 font-semibold mb-1">Contenido y Accesorios de la Caja</label>
            <textarea
              rows={2}
              value={form.box_contents}
              onChange={(e) => setForm({ ...form, box_contents: e.target.value })}
              placeholder="Ej: Manos intercambiables, rostros alternativos, base de diorama..."
              className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-white"
            />
          </div>
        </div>

        {/* SECTION 2: DATOS PERSONALES DEL COLECCIONISTA */}
        <div className="bg-zinc-900/90 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="flex items-center gap-2.5 border-b border-white/10 pb-4">
            <Tag size={18} className="text-amber-400" />
            <div>
              <h2 className="text-base font-black text-white">Mi Registro Personal de Colección</h2>
              <p className="text-xs text-zinc-400">Estado de conservación, fotos reales y notas</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Estado de Posesión</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as VaultStatus })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-white"
              >
                <option value="OWNED">OWNED (En mi vitrina / Posesión)</option>
                <option value="PREORDERED">PREORDERED (Pre-ordenada)</option>
                <option value="ORDERED">ORDERED (Comprada en camino)</option>
                <option value="WISHLIST">WISHLIST (Deseada)</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Estado / Condición de la Figura</label>
              <select
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value as VaultCondition })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-white font-bold"
              >
                <option value="MINT">MINT (Impecable / Nueva)</option>
                <option value="NEAR_MINT">NEAR_MINT (Casi perfecta)</option>
                <option value="EXCELLENT">EXCELLENT (Excelente / Open Complete)</option>
                <option value="GOOD">GOOD (Buena exhibida)</option>
                <option value="DAMAGED">DAMAGED (Detalles menores)</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Estado del Empaque / Caja</label>
              <select
                value={form.box_condition}
                onChange={(e) => setForm({ ...form, box_condition: e.target.value as VaultBoxCondition })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-white"
              >
                <option value="SEALED">SEALED (Sellado de fábrica / MISB)</option>
                <option value="OPEN_BOX">OPEN_BOX (Caja abierta completa)</option>
                <option value="ACRYLIC_CASE">ACRYLIC_CASE (En protector acrílico)</option>
                <option value="NO_BOX">NO_BOX (Loose / Sin caja)</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Fecha de Compra / Añadida</label>
              <input
                type="date"
                value={form.purchase_date}
                onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-white"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-semibold mb-1 flex items-center gap-1">
                <Lock size={12} className="text-zinc-500" />
                Precio Pagado (USD - 100% Privado)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.purchase_price}
                onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-semibold mb-1">Visibilidad de esta Pieza</label>
              <select
                value={form.visibility}
                onChange={(e) => setForm({ ...form, visibility: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-white"
              >
                <option value="PUBLIC">🌐 Pública (Visible y compartible)</option>
                <option value="PRIVATE">🔒 Privada (Sólo visible para ti)</option>
              </select>
            </div>
          </div>

          {/* User's Custom Photo Upload / URL */}
          <div>
            <label className="block text-zinc-400 font-semibold mb-1 flex items-center gap-1.5">
              <ImageIcon size={14} className="text-amber-400" />
              <span>Mi Foto Real / Galería Personal (URL de foto en mano o vitrina)</span>
            </label>
            <input
              type="url"
              value={form.custom_image_url}
              onChange={(e) => setForm({ ...form, custom_image_url: e.target.value })}
              placeholder="https://ejemplo.com/mi-foto-real.jpg"
              className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-white font-mono text-xs"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Al compartir en Instagram o WhatsApp, podrás elegir si mostrar la foto oficial de catálogo o tu propia foto real en vitrina.
            </p>
          </div>

          <div>
            <label className="block text-zinc-400 font-semibold mb-1">Notas del Coleccionista</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Ej: Una de las piezas centrales de mi colección Star Wars..."
              className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-white"
            />
          </div>
        </div>

        {/* BOTTOM SAVE BUTTONS */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={() => navigate('/vault')}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-zinc-400 hover:text-white transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-black text-xs rounded-xl flex items-center gap-2 transition shadow-lg shadow-amber-500/20 cursor-pointer"
          >
            <Save size={15} />
            <span>{saving ? 'Guardando...' : 'Guardar en Mi Vault'}</span>
          </button>
        </div>
      </form>

      {/* SHARE MODAL LAUNCHER */}
      {isShareModalOpen && (
        <VaultShareCardModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          item={{
            custom_name: form.custom_name,
            brand_name: form.brand_name,
            franchise: form.franchise,
            line: form.line,
            scale: form.scale,
            height: form.height,
            condition: form.condition,
            box_condition: form.box_condition,
            status: form.status,
            rating: form.rating,
            is_favorite: form.is_favorite,
            is_featured: form.is_featured,
            notes: form.notes,
            official_image_url: form.official_image_url,
            custom_image_url: form.custom_image_url,
            purchase_date: form.purchase_date,
            collector_handle: '@collector'
          }}
          isFullVault={false}
        />
      )}
    </div>
  );
}

