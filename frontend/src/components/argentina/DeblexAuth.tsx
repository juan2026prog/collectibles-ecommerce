import React, { useState } from 'react';
import { Package, Lock, Mail, ArrowRight, AlertCircle, KeyRound, ArrowLeft } from 'lucide-react';
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
        setErrorMsg('Credenciales inválidas o cuenta no registrada para Envíos by Deblex.');
        return;
      }

      if (data?.user) {
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
    <div className="min-h-screen bg-[#f3f6f8] flex flex-col justify-center items-center p-4 selection:bg-[#7bcede] selection:text-[#123040]">
      <div className="max-w-md w-full bg-white border border-[#dce6eb] rounded-xl shadow-[0_4px_24px_rgba(18,48,64,0.08)] p-8 relative">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-lg bg-[#123040] flex items-center justify-center text-white">
              <Package className="w-6 h-6 text-[#7bcede]" />
            </div>
            <div className="text-left">
              <span className="text-xl font-extrabold text-[#123040] tracking-tight block leading-none">
                Envíos <span className="text-[#146981] font-semibold">by Deblex</span>
              </span>
              <span className="text-[11px] text-[#6b808d] font-medium tracking-wide">
                Portal Privado de Operaciones & Facturación
              </span>
            </div>
          </div>
          <p className="text-xs text-[#718694] mt-3">
            Acceso restringido para administradores y operadores logísticos autorizados
          </p>
        </div>

        {errorMsg && (
          <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-start gap-2.5">
            <Package className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>{infoMsg}</span>
          </div>
        )}

        {!isResetMode ? (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#182f3c] mb-1.5">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#8ea4b0] absolute left-3 top-3 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operador@deblex.com.ar"
                  required
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#cedbe1] rounded-lg text-[#182f3c] placeholder-[#9fb5c0] focus:outline-none focus:ring-2 focus:ring-[#146981]/20 focus:border-[#146981] transition"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-[#182f3c]">
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsResetMode(true);
                    setErrorMsg(null);
                    setInfoMsg(null);
                  }}
                  className="text-xs text-[#146981] hover:underline font-medium"
                >
                  ¿Olvidaste tu clave?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#8ea4b0] absolute left-3 top-3 pointer-events-none" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#cedbe1] rounded-lg text-[#182f3c] placeholder-[#9fb5c0] focus:outline-none focus:ring-2 focus:ring-[#146981]/20 focus:border-[#146981] transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#146981] hover:bg-[#0e5266] text-white font-semibold text-sm rounded-lg shadow-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Ingresar al Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#182f3c] mb-1.5">
                Correo Electrónico Registrado
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#8ea4b0] absolute left-3 top-3 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operador@deblex.com.ar"
                  required
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#cedbe1] rounded-lg text-[#182f3c] placeholder-[#9fb5c0] focus:outline-none focus:ring-2 focus:ring-[#146981]/20 focus:border-[#146981] transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#146981] hover:bg-[#0e5266] text-white font-semibold text-sm rounded-lg shadow-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Enviar Enlace de Recuperación</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsResetMode(false);
                setErrorMsg(null);
                setInfoMsg(null);
              }}
              className="w-full text-center text-xs text-[#617885] hover:text-[#182f3c] transition flex items-center justify-center gap-1.5 py-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver al inicio de sesión</span>
            </button>
          </form>
        )}

        <div className="mt-8 pt-4 border-t border-[#edf1f4] text-center">
          <p className="text-[11px] text-[#8fa5b1]">
            Plataforma Segura · Conexión directa a Supabase Cloud Staging
          </p>
        </div>
      </div>
    </div>
  );
};
