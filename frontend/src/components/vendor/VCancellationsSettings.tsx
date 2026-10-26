import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../admin/Toast';
import { RotateCcw, Clock, ShieldCheck, Truck, AlertTriangle, CheckCircle2, Save } from 'lucide-react';

export default function VCancellationsSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [policy, setPolicy] = useState({
    cancellation_policy: 'before_dispatch',
    cancellation_window_hours: 2,
    return_window_days: 0,
    return_product_condition: 'sealed_only',
    return_shipping_payer: 'buyer',
    return_instructions: '',
    return_address: ''
  });

  useEffect(() => {
    if (!user) return;
    async function loadPolicy() {
      try {
        const { data, error } = await supabase
          .from('vendors')
          .select('cancellation_policy, cancellation_window_hours, return_window_days, return_product_condition, return_shipping_payer, return_instructions, return_address')
          .eq('id', user!.id)
          .single();

        if (error) throw error;
        if (data) {
          setPolicy({
            cancellation_policy: data.cancellation_policy || 'before_dispatch',
            cancellation_window_hours: data.cancellation_window_hours || 2,
            return_window_days: data.return_window_days ?? 0,
            return_product_condition: data.return_product_condition || 'sealed_only',
            return_shipping_payer: data.return_shipping_payer || 'buyer',
            return_instructions: data.return_instructions || '',
            return_address: data.return_address || ''
          });
        }
      } catch (err: any) {
        console.error('Error al cargar políticas:', err);
      } finally {
        setLoading(false);
      }
    }
    loadPolicy();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('vendors')
        .update({
          cancellation_policy: policy.cancellation_policy,
          cancellation_window_hours: Number(policy.cancellation_window_hours),
          return_window_days: Number(policy.return_window_days),
          return_product_condition: policy.return_product_condition,
          return_shipping_payer: policy.return_shipping_payer,
          return_instructions: policy.return_instructions,
          return_address: policy.return_address,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;
      toast.success('Políticas de cancelación y devolución actualizadas');
    } catch (err: any) {
      toast.error('Error al guardar políticas: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">
        Cargando configuración de cancelaciones y devoluciones...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Aviso Legal Importante */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 items-start">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800 leading-relaxed">
          <strong className="font-semibold">Marco Legal y Protección al Consumidor (Ley N° 17.250):</strong>
          <p className="mt-1">
            Las opciones configuradas a continuación corresponden a tus <strong>políticas comerciales voluntarias adicionales</strong>. 
            Los derechos legales del comprador (derecho de arrepentimiento de 5 días hábiles en compras a distancia, productos fallados de origen, errores de envío o daños imputables al transporte) prevalecen sobre estas preferencias y no pueden ser restringidos contractualmente.
          </p>
        </div>
      </div>

      {/* A. Cancelaciones Adicionales */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 space-y-4">
        <div className="flex items-center gap-2 text-gray-900 font-bold text-lg">
          <Clock className="w-5 h-5 text-indigo-600" />
          <h3>Cancelaciones Comerciales Adicionales</h3>
        </div>
        <p className="text-sm text-gray-600">
          Define en qué momento permites al comprador solicitar una cancelación voluntaria sin mediar reclamo:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="cancellation_policy"
              value="before_dispatch"
              checked={policy.cancellation_policy === 'before_dispatch'}
              onChange={e => setPolicy({ ...policy, cancellation_policy: e.target.value })}
              className="mt-1"
            />
            <div>
              <span className="font-semibold text-gray-800 block text-sm">Hasta antes del Despacho</span>
              <span className="text-xs text-gray-500">El cliente puede cancelar mientras el paquete no haya sido entregado al transportista.</span>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="cancellation_policy"
              value="before_prep"
              checked={policy.cancellation_policy === 'before_prep'}
              onChange={e => setPolicy({ ...policy, cancellation_policy: e.target.value })}
              className="mt-1"
            />
            <div>
              <span className="font-semibold text-gray-800 block text-sm">Hasta antes de Preparar</span>
              <span className="text-xs text-gray-500">Solo antes de que comiences el empaquetado del producto.</span>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="cancellation_policy"
              value="time_window"
              checked={policy.cancellation_policy === 'time_window'}
              onChange={e => setPolicy({ ...policy, cancellation_policy: e.target.value })}
              className="mt-1"
            />
            <div>
              <span className="font-semibold text-gray-800 block text-sm">Ventana de Tiempo Fija</span>
              <span className="text-xs text-gray-500">Permitir cancelación durante las primeras horas posteriores al pago.</span>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="cancellation_policy"
              value="none"
              checked={policy.cancellation_policy === 'none'}
              onChange={e => setPolicy({ ...policy, cancellation_policy: e.target.value })}
              className="mt-1"
            />
            <div>
              <span className="font-semibold text-gray-800 block text-sm">Sin cancelaciones adicionales</span>
              <span className="text-xs text-gray-500">Solo se procesarán cancelaciones sujetas a causales legales o mediación.</span>
            </div>
          </label>
        </div>

        {policy.cancellation_policy === 'time_window' && (
          <div className="mt-3 flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Horas habilitadas tras el pago:</label>
            <input
              type="number"
              min="1"
              max="48"
              value={policy.cancellation_window_hours}
              onChange={e => setPolicy({ ...policy, cancellation_window_hours: parseInt(e.target.value) || 1 })}
              className="w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        )}
      </div>

      {/* B. Devoluciones Voluntarias */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 space-y-4">
        <div className="flex items-center gap-2 text-gray-900 font-bold text-lg">
          <RotateCcw className="w-5 h-5 text-indigo-600" />
          <h3>Devoluciones Voluntarias Adicionales</h3>
        </div>
        <p className="text-sm text-gray-600">
          Plazo extra que ofreces al comprador tras recibir el artículo para solicitar una devolución comercial:
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { days: 0, label: 'Solo plazo legal (0 extra)' },
            { days: 7, label: '7 días extra' },
            { days: 15, label: '15 días extra' },
            { days: 30, label: '30 días extra' }
          ].map(opt => (
            <button
              key={opt.days}
              type="button"
              onClick={() => setPolicy({ ...policy, return_window_days: opt.days })}
              className={`p-3 text-center border rounded-lg text-sm font-medium transition-all ${
                policy.return_window_days === opt.days
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-semibold'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* C. Estado del Producto */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 space-y-4">
        <div className="flex items-center gap-2 text-gray-900 font-bold text-lg">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
          <h3>Condición de Embalaje para Coleccionables</h3>
        </div>
        <p className="text-sm text-gray-600">
          En figuras y coleccionables, el estado de la caja y precinto es esencial para la reventa:
        </p>
        <div className="space-y-2">
          <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="return_product_condition"
              value="sealed_only"
              checked={policy.return_product_condition === 'sealed_only'}
              onChange={e => setPolicy({ ...policy, return_product_condition: e.target.value })}
            />
            <div>
              <span className="font-semibold text-gray-800 text-sm block">Solo Precinto y Caja Intacta</span>
              <span className="text-xs text-gray-500">Para devoluciones voluntarias, el coleccionable debe mantener sus precintos o blíster sin abrir.</span>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="return_product_condition"
              value="opened_unused"
              checked={policy.return_product_condition === 'opened_unused'}
              onChange={e => setPolicy({ ...policy, return_product_condition: e.target.value })}
            />
            <div>
              <span className="font-semibold text-gray-800 text-sm block">Abierto pero Sin Uso ni Desgaste</span>
              <span className="text-xs text-gray-500">Se acepta si la caja fue abierta para inspección, pero contiene todos los accesorios intactos.</span>
            </div>
          </label>
        </div>
      </div>

      {/* D. Costo de Retorno e Instrucciones */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 space-y-4">
        <div className="flex items-center gap-2 text-gray-900 font-bold text-lg">
          <Truck className="w-5 h-5 text-indigo-600" />
          <h3>Costo de Envío de Retorno y Dirección</h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              ¿Quién asume el flete en devoluciones comerciales voluntarias?
            </label>
            <select
              value={policy.return_shipping_payer}
              onChange={e => setPolicy({ ...policy, return_shipping_payer: e.target.value })}
              className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="buyer">A cargo del Comprador (Estándar)</option>
              <option value="vendor">A cargo del Vendedor (Envío de retorno bonificado)</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Dirección de Recepción para Devoluciones Físicas:
            </label>
            <input
              type="text"
              placeholder="Ej: Av. 18 de Julio 1234, Apto 501, Montevideo"
              value={policy.return_address}
              onChange={e => setPolicy({ ...policy, return_address: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Instrucciones y Horarios de Entrega para el Courier:
            </label>
            <textarea
              rows={3}
              placeholder="Ej: Recibir de Lunes a Viernes de 10:00 a 18:00 hs. Embalar en caja de cartón rígido con plástico de burbujas."
              value={policy.return_instructions}
              onChange={e => setPolicy({ ...policy, return_instructions: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      {/* Botón de Guardar */}
      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : 'Guardar Políticas'}
        </button>
      </div>
    </div>
  );
}
