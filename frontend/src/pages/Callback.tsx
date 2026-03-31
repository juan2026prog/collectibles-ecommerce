import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, CheckCircle, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';

export default function Callback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const code = searchParams.get('code');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (code && status === 'idle') {
      handleExchange(code);
    }
  }, [code, status]);

  async function handleExchange(authCode: string) {
    setStatus('loading');
    setMessage('Intercambiando código por token de acceso...');

    try {
      // 1. Check if user is logged in
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatus('error');
        setMessage('Debes estar logueado como administrador para conectar Mercado Libre.');
        return;
      }

      // 2. Call the Edge Function to handle the exchange securely
      const { data, error } = await supabase.functions.invoke('mercadolibre-auth', {
        body: { code: authCode }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setStatus('success');
      setMessage('¡Conexión con Mercado Libre exitosa!');
      
      // Redirect back to Admin ML after a short delay
      setTimeout(() => navigate('/admin/mercadolibre'), 2500);

    } catch (err: any) {
      console.error('Exchange error:', err);
      setStatus('error');
      setMessage(err.message || 'Error al conectar con Mercado Libre. Verifica que el código no haya expirado.');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-4 font-sans">
      <div className="max-w-md w-full bg-slate-800 rounded-3xl shadow-2xl p-10 border border-slate-700 relative overflow-hidden">
        {/* Abstract Background Decoration */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-yellow-500/10 rounded-full blur-3xl"></div>

        <div className="relative z-10 text-center">
          {status === 'loading' && (
            <div className="animate-in fade-in zoom-in duration-500">
              <div className="relative w-20 h-20 mx-auto mb-6">
                <Loader2 className="w-20 h-20 text-yellow-400 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                   <div className="w-10 h-10 bg-blue-900 rounded-full flex items-center justify-center font-bold text-[10px]">ML</div>
                </div>
              </div>
              <h1 className="text-xl font-bold mb-2">Sincronizando Cuenta</h1>
              <p className="text-slate-400 text-sm">{message}</p>
            </div>
          )}

          {status === 'success' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="w-20 h-20 bg-green-500/20 border border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-green-400" />
              </div>
              <h1 className="text-2xl font-bold mb-2 text-white">¡Conectado!</h1>
              <p className="text-green-400/80 text-sm mb-6">{message}</p>
              <div className="flex items-center justify-center gap-2 text-slate-500 text-xs animate-pulse">
                <span>Redirigiendo al panel de control</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="w-20 h-20 bg-red-500/20 border border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-10 h-10 text-red-400" />
              </div>
              <h1 className="text-xl font-bold mb-2 text-white">Error de Conexión</h1>
              <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                {message}
              </p>
              <button 
                onClick={() => navigate('/admin/mercadolibre')}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 rounded-xl transition-all border border-slate-600 flex items-center justify-center gap-2 group"
              >
                Volver al Panel
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          )}

          {status === 'idle' && !code && (
             <div>
                <ShieldCheck className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <h1 className="text-lg font-medium text-slate-300">Esperando autorización...</h1>
             </div>
          )}
        </div>

        {/* Debug info (Hidden but kept for integration tests) */}
        {code && status !== 'success' && (
          <div className="mt-10 pt-6 border-t border-slate-700/50">
             <div className="bg-slate-900/50 rounded-lg p-3 text-left overflow-hidden">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1 opacity-50 font-mono">Auth Code Trace</p>
                <div className="font-mono text-[10px] text-slate-500 truncate opacity-30 italic">
                   {code}
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
