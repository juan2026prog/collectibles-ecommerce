import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { X, Sparkles, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface InternationalWaitlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productTitle: string;
  internationalProductId?: string;
  estimatedCostUsd?: number;
}

export default function InternationalWaitlistModal({
  isOpen,
  onClose,
  productId,
  productTitle,
  internationalProductId,
  estimatedCostUsd = 0
}: InternationalWaitlistModalProps) {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setError('Por favor ingresá un email válido.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { error: insertErr } = await supabase
        .from('international_capacity_waitlist')
        .insert({
          user_id: user?.id || null,
          email: email.trim().toLowerCase(),
          product_id: productId,
          international_product_id: internationalProductId || null,
          required_capacity_usd_internal: Number(estimatedCostUsd || 0),
          status: 'pending'
        });

      if (insertErr) {
        // Handle unique constraint gracefully
        if (insertErr.code === '23505') {
          setSuccess(true);
          return;
        }
        throw insertErr;
      }

      setSuccess(true);
    } catch (err: any) {
      console.error('Error joining waitlist:', err);
      setError(err.message || 'No se pudo registrar en la lista de espera. Intenta nuevamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-neutral-900 border border-neutral-700/80 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-white">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {success ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">¡Aviso registrado!</h3>
            <p className="text-xs text-slate-300 leading-relaxed max-w-xs mx-auto">
              Te avisaremos a <b className="text-white">{email}</b> en cuanto se habiliten nuevos cupos internacionales para este producto.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 px-6 py-2.5 bg-primary-600 hover:bg-primary-500 text-white font-bold text-xs rounded-xl transition-all shadow-lg"
            >
              Entendido
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-2 text-primary-400">
              <Sparkles className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Avisarme cuando haya cupo</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Los cupos para <b className="text-white">{productTitle}</b> se encuentran temporalmente completos debido a la alta demanda. Dejanos tu email para notificarte en cuanto se habilite capacidad.
            </p>

            {error && (
              <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Tu correo electrónico
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ejemplo@correo.com"
                className="w-full bg-black/40 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-md"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <span>Avisarme cuando vuelva</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
