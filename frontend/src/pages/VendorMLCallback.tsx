import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function VendorMLCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Procesando autorización...');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      setStatus('error');
      setMessage(errorDescription || 'Error en la autorización de Mercado Libre');
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('No se recibió código de autorización');
      return;
    }

    // Validate state to prevent CSRF
    const savedState = localStorage.getItem('vml_oauth_state');
    if (!savedState || savedState !== state) {
      setStatus('error');
      setMessage('Error de seguridad: el token de estado no coincide o expiró. Por favor intentá conectar nuevamente.');
      return;
    }

    // Clear state after validation
    localStorage.removeItem('vml_oauth_state');

    exchangeCodeForToken(code);
  }, [searchParams]);

  async function exchangeCodeForToken(code: string) {
    try {
      const redirectUri = `${window.location.origin}/vendor/ml/callback`;
      
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      if (!token) {
        throw new Error('No se detectó sesión activa de Vendor.');
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercadolibre-auth`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          code,
          redirect_uri: redirectUri
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setStatus('success');
        setMessage('¡Cuenta conectada exitosamente! Redireccionando a tu panel...');
        setTimeout(() => navigate('/vendor?tab=mercadolibre'), 2000);
      } else {
        throw new Error(data.error || 'Fallo al intercambiar el token de Mercado Libre');
      }
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'Error de conexión con Mercado Libre');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="glass rounded-2xl shadow-lg p-8 max-w-md w-full text-center border border-gray-200 bg-white">
        {status === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 text-[#FFE600] animate-spin mx-auto mb-4 drop-shadow-md" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Conectando con Mercado Libre</h2>
            <p className="text-gray-500">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4 drop-shadow-sm" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">¡Éxito!</h2>
            <p className="text-gray-500">{message}</p>
            <div className="mt-4 flex justify-center">
              <ArrowRight className="w-5 h-5 text-emerald-500 animate-pulse" />
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4 drop-shadow-sm" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Conexión Fallida</h2>
            <p className="text-gray-500 mb-6">{message}</p>
            <button
              onClick={() => navigate('/vendor?tab=mercadolibre')}
              className="bg-black text-white hover:bg-gray-800 transition-colors px-6 py-2 rounded-lg font-medium shadow-sm w-full"
            >
              Volver al Vendor Dashboard
            </button>
          </>
        )}

        <div className="mt-8 pt-4 border-t border-gray-100 text-left">
          <p className="text-[10px] text-gray-400 font-mono break-all bg-gray-50 p-2 rounded">
            {searchParams.toString() || 'Sin parámetros'}
          </p>
        </div>
      </div>
    </div>
  );
}
