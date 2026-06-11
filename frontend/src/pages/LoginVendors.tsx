import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Store, AlertTriangle, CheckCircle } from 'lucide-react';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { STORE_ISOLOGO_URL } from '../lib/brand';

export default function LoginVendors() {
  const { session, signIn, signUp, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const { settings, loaded: settingsLoaded } = useSiteSettings();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingInvite, setCheckingInvite] = useState(false);
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);

  // Validar si el token existe en la url (esto es solo visual, la seguridad está en el RPC)
  useEffect(() => {
    if (inviteToken) {
      setInviteValid(true); // Asumimos válido hasta que intente aceptar
    }
  }, [inviteToken]);

  async function handleAcceptInvite() {
    if (!inviteToken) return;
    setLoading(true);
    setError('');
    
    try {
      const { data, error: rpcError } = await supabase.rpc('accept_vendor_invitation', { p_token: inviteToken });
      
      if (rpcError) throw rpcError;
      
      setSuccess('¡Invitación aceptada! Redirigiendo a tu panel...');
      
      // Forzar recarga de sesión en supabase auth si es necesario
      await supabase.auth.refreshSession();

      // Reload profile to reflect is_vendor = true, then redirect
      setTimeout(() => {
        window.location.href = '/vendor';
      }, 1000);

    } catch (err: any) {
      console.error('Error accepting invite:', err);
      setError(err.message || 'La invitación es inválida o ha expirado.');
      setInviteValid(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    
    try {
      if (isLogin) {
        const { error: signInError } = await signIn(email, password);
        if (signInError) throw signInError;
      } else {
        const { error: signUpError } = await signUp(email, password);
        if (signUpError) throw signUpError;
        setSuccess('¡Cuenta creada! Puedes continuar.');
      }
      
      // Si hay un token y se logueó exitosamente, intentamos aceptarlo automáticamente
      if (inviteToken) {
        // Esperamos a que la sesión esté disponible en supabase antes de llamar al RPC
        let sessionReady = false;
        for (let i = 0; i < 10; i++) {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            sessionReady = true;
            break;
          }
          await new Promise(r => setTimeout(r, 500));
        }

        if (sessionReady) {
          await handleAcceptInvite();
        } else {
          setError('No pudimos iniciar tu sesión automáticamente. Por favor, verifica tu correo y luego intenta ingresar de nuevo.');
          setLoading(false);
        }
      } else {
        // Si es un vendedor ya existente entrando a /login_vendors sin token
        setTimeout(() => {
          window.location.href = '/vendor';
        }, 1000);
      }

    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  // Si ya está logueado y hay token, solo mostrar botón de Aceptar Invitación
  if (!authLoading && session && inviteToken && inviteValid !== false) {
    return (
      <div className="min-h-screen bg-white/5 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2">
              <img src={STORE_ISOLOGO_URL} alt="Logo" className="w-10 h-10 rounded-full object-cover" />
              <span className="text-2xl font-extrabold text-slate-200">COLLECTIBLES</span>
            </Link>
          </div>
          <div className="glass shadow-lg border border-white/10 p-8 text-center">
            <Store className="w-12 h-12 text-teal-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Activar Tienda</h1>
            <p className="text-slate-300 mb-6">
              Estás conectado como <strong>{session.user.email}</strong>. Haz clic abajo para aceptar la invitación y configurar tu tienda.
            </p>
            {error && <div className="mb-4 p-3 bg-red-900/30 text-sm text-red-400 border border-red-500/30">{error}</div>}
            {success && <div className="mb-4 p-3 bg-green-900/30 text-sm text-green-400 border border-green-500/30 flex items-center justify-center gap-2"><CheckCircle className="w-4 h-4" /> {success}</div>}
            
            <button
              onClick={handleAcceptInvite}
              disabled={loading}
              className="btn-primary w-full py-3 flex justify-center items-center gap-2 bg-teal-600 hover:bg-teal-700"
            >
              {loading ? 'Procesando...' : 'ACEPTAR INVITACIÓN'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
            <button onClick={() => supabase.auth.signOut()} className="mt-4 text-sm text-slate-400 hover:text-white">
              Cerrar sesión e ingresar con otra cuenta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white/5 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            {!settingsLoaded ? (
              <div className="h-10 w-36 bg-gray-200 animate-pulse" />
            ) : (
              <>
                <img src={STORE_ISOLOGO_URL} alt={settings['store_name'] || 'Store'} className="w-10 h-10 rounded-full object-cover" />
                <span className="text-2xl font-extrabold tracking-tight text-slate-200">{settings['store_name'] || 'COLLECTIBLES'}</span>
              </>
            )}
          </Link>
        </div>

        <div className="glass shadow-lg border border-white/10 p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-teal-500"></div>
          
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-teal-500/20 rounded-full flex items-center justify-center">
              <Store className="w-6 h-6 text-teal-400" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-white text-center mb-2">
            Acceso para Vendedores
          </h1>
          <p className="text-sm text-slate-400 text-center mb-6">
            Ingresá para gestionar tus productos, ventas, envíos y liquidaciones.
          </p>

          {inviteToken && inviteValid !== false && (
            <div className="mb-6 p-3 bg-teal-900/30 border border-teal-500/30 rounded-lg flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-teal-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-teal-300">Tienes una invitación pendiente</p>
                <p className="text-xs text-teal-100/70 mt-1">
                  Inicia sesión o crea tu cuenta para activarla automáticamente.
                </p>
              </div>
            </div>
          )}

          {inviteValid === false && (
            <div className="mb-6 p-3 bg-red-900/30 border border-red-500/30 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-300">Invitación inválida</p>
                <p className="text-xs text-red-100/70 mt-1">
                  El enlace ha expirado o ya fue utilizado. Contacta a soporte.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 text-sm text-red-400">{error}</div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-900/30 border border-green-500/30 text-sm text-green-400 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">Correo electrónico</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="form-input pl-10"
                  placeholder="tu@email.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="form-label">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="form-input pl-10 pr-10"
                  placeholder={isLogin ? 'Tu contraseña' : 'Crear contraseña (mín 6 caracteres)'}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-400"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {isLogin && (
              <div className="text-right mt-2">
                <button type="button" className="text-sm text-slate-500 cursor-not-allowed" disabled title="Disponible próximamente">¿Olvidaste tu contraseña?</button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || inviteValid === false}
              className="btn-primary w-full py-3.5 text-base gap-2 bg-teal-600 hover:bg-teal-500"
            >
              {loading ? 'Procesando...' : (isLogin ? 'INGRESAR AL PANEL' : 'CREAR CUENTA')}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="mt-8 text-center border-t border-white/10 pt-6">
            <p className="text-sm text-slate-400">
              {isLogin ? "¿Es tu primera vez aquí?" : '¿Ya tienes una cuenta?'}{' '}
              <button
                onClick={() => { setIsLogin(!isLogin); setError(''); setSuccess(''); }}
                className="font-bold text-teal-400 hover:text-teal-300 hover:underline"
              >
                {isLogin ? 'Crea tu contraseña' : 'Inicia Sesión'}
              </button>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6 max-w-sm mx-auto">
          Este acceso es exclusivo para vendedores autorizados por Collectibles.
        </p>
      </div>
    </div>
  );
}
