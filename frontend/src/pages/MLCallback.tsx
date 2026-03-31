import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2, ArrowRight } from 'lucide-react';

export default function MLCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Procesando autorización...');

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      setStatus('error');
      setMessage(errorDescription || 'Error en la autorización');
      return;
    }

    if (code) {
      exchangeCodeForToken(code);
    } else {
      setStatus('error');
      setMessage('No se recibió código de autorización');
    }
  }, [searchParams]);

  async function exchangeCodeForToken(code: string) {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercadolibre-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      const data = await response.json();

      if (data.access_token) {
        setStatus('success');
        setMessage('¡Autorización exitosa! Redireccionando...');
        setTimeout(() => navigate('/admin/mercadolibre'), 2000);
      } else {
        throw new Error(data.error || 'Error al intercambiar código');
      }
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'Error al conectar con Mercado Libre');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Conectando con Mercado Libre</h2>
            <p className="text-gray-500">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">¡Éxito!</h2>
            <p className="text-gray-500">{message}</p>
            <div className="mt-4 flex justify-center">
              <ArrowRight className="w-5 h-5 text-green-500 animate-pulse" />
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Error de Autorización</h2>
            <p className="text-gray-500 mb-4">{message}</p>
            <button
              onClick={() => navigate('/admin/mercadolibre')}
              className="btn-primary"
            >
              Volver a Mercado Libre
            </button>
          </>
        )}

        <div className="mt-6 p-4 bg-gray-50 rounded-lg text-left">
          <p className="text-xs text-gray-400 font-mono break-all">
            {searchParams.toString() || 'Sin parámetros'}
          </p>
        </div>
      </div>
    </div>
  );
}
