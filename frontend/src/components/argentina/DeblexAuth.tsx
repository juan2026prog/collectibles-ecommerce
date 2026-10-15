import React, { useState } from 'react';
import { Package, Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, KeyRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface DeblexAuthProps {
  onSuccess: () => void;
}

export const DeblexAuth: React.FC<DeblexAuthProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isResetMode, setIsResetMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Por favor ingresá tu correo electrónico y contraseña.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        setErrorMsg('Credenciales inválidas o cuenta no registrada para el portal Deblex.');
        return;
      }

      if (data?.user) {
        // Successful login
        onSuccess();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de autenticación');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMsg('Por favor ingresá tu correo electrónico para recuperar tu acceso.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/deblex?reset=true`,
      });

      if (error) {
        setErrorMsg(error.message);
      } else {
        setInfoMsg('Te enviamos un enlace a tu correo para restablecer tu contraseña.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al solicitar restablecimiento de contraseña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-4 shadow-lg shadow-amber-500/10">
            <Package className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Portal Deblex</h1>
          <p className="text-xs text-gray-400 mt-1">
            Gestión Logística & Recepción Suite Miami (2301 NW 107th AVE)
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-950/40 border border-red-800/80 rounded-xl text-red-200 text-xs flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div className="mb-6 p-4 bg-emerald-950/40 border border-emerald-800/80 rounded-xl text-emerald-200 text-xs flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{infoMsg}</span>
          </div>
        )}

        {!isResetMode ? (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-500 absolute left-3.5 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="usuario@deblex.com.ar"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-800/80 border border-gray-700/80 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-gray-300">
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={() => setIsResetMode(true)}
                  className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-500 absolute left-3.5 top-3" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-800/80 border border-gray-700/80 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer mt-2"
            >
              {loading ? (
                'Iniciando sesión...'
              ) : (
                <>
                  Iniciar Sesión en Deblex <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Correo Electrónico de Recuperación
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-500 absolute left-3.5 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="usuario@deblex.com.ar"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-800/80 border border-gray-700/80 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setIsResetMode(false)}
                className="text-xs text-gray-400 hover:text-white"
              >
                Volver a Iniciar Sesión
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                {loading ? 'Enviando...' : 'Enviar Enlace'}
              </button>
            </div>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-gray-800/80 text-center">
          <span className="text-[11px] text-gray-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            Acceso protegido mediante Supabase Cloud & RLS
          </span>
        </div>
      </div>
    </div>
  );
};
