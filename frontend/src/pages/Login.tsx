import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { STORE_ISOLOGO_URL } from '../lib/brand';
import { trackCompleteRegistration, generateMetaEventId } from '../lib/meta/metaPixel';

export default function Login() {
  const { signIn, signUp, signInWithGoogle, signInWithOtp, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawRedirect = searchParams.get('redirect') ? decodeURIComponent(searchParams.get('redirect')!) : '/';
  // Anti-open-redirect guard: only allow relative internal paths
  const redirectTarget = /^\/(?!\/)/.test(rawRedirect) ? rawRedirect : '/';
  const isResetCallback = searchParams.get('mode') === 'reset';
  const { settings, loaded: settingsLoaded } = useSiteSettings();

  const [isLogin, setIsLogin] = useState(true);
  const [isMagicLink, setIsMagicLink] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(isResetCallback);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isResetCallback) {
      setIsUpdatingPassword(true);
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsUpdatingPassword(true);
        setIsForgotPassword(false);
        setIsMagicLink(false);
      }
    });
    return () => subscription.unsubscribe();
  }, [isResetCallback]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (isUpdatingPassword) {
      if (!password || password.length < 6) {
        setError('La nueva contraseña debe tener al menos 6 caracteres.');
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden.');
        setLoading(false);
        return;
      }
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) {
        setError(updateErr.message);
      } else {
        setSuccess('¡Contraseña actualizada correctamente! Redirigiendo...');
        setTimeout(() => navigate('/account'), 1500);
      }
      setLoading(false);
      return;
    }

    if (isForgotPassword) {
      if (!resetPassword) {
        setError('El servicio de recuperación no está disponible en este momento.');
      } else {
        const { error: resetErr } = await resetPassword(email);
        if (resetErr) setError(resetErr.message);
        else setSuccess('Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.');
      }
      setLoading(false);
      return;
    }

    if (isMagicLink) {
      const { error } = await signInWithOtp(email);
      if (error) setError(error.message);
      else setSuccess('¡Te enviamos un enlace mágico! Revisa tu email para iniciar sesión.');
    } else if (isLogin) {
      const { error } = await signIn(email, password);
      if (error) setError(error.message);
      else navigate(redirectTarget);
    } else {
      const { data, error } = await signUp(email, password);
      if (error) setError(error.message);
      else {
        trackCompleteRegistration(generateMetaEventId(), { status: true, user_email: email });

        try {
          await supabase.functions.invoke('transactional-emails', {
            body: {
              type: 'welcome',
              email: email,
              customer_id: data?.user?.id,
            },
          });
        } catch (mailErr) {
          console.error('Error enviando email de bienvenida:', mailErr);
        }

        if (data?.session) {
          setSuccess('¡Cuenta creada con éxito! Redirigiendo...');
          setTimeout(() => {
            navigate('/');
          }, 1500);
        } else {
          setSuccess('¡Cuenta creada! Por favor revisá tu email para confirmar tu cuenta e iniciar sesión.');
        }
      }
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-white/5 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            {!settingsLoaded ? (
              <div className="h-10 w-36 bg-gray-200  animate-pulse" />
            ) : (
              <>
                <img src={STORE_ISOLOGO_URL} alt={settings['store_name'] || 'Store'} className="w-10 h-10 rounded-full object-cover" />
                <span className="text-2xl font-extrabold tracking-tight text-slate-200">{settings['store_name'] || 'COLLECTIBLES'}</span>
              </>
            )}
          </Link>
        </div>

        <div className="glass  shadow-lg border border-white/10 p-8">
          <h1 className="text-2xl font-bold text-white text-center mb-2">
            {isUpdatingPassword
              ? 'Nueva Contraseña'
              : isForgotPassword
              ? 'Recuperar Contraseña'
              : isMagicLink
              ? 'Enlace Mágico'
              : isLogin
              ? 'Bienvenido'
              : 'Crear Cuenta'}
          </h1>
          <p className="text-sm text-slate-400 text-center mb-6">
            {isUpdatingPassword
              ? 'Ingresá y confirmá tu nueva contraseña segura'
              : isForgotPassword
              ? 'Ingresá tu email y te enviaremos instrucciones para restablecer tu clave'
              : isMagicLink
              ? 'Ingresá tu email y te enviaremos un link para entrar sin contraseña'
              : isLogin
              ? 'Inicia sesión en tu cuenta'
              : 'Únete a la comunidad'}
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 text-sm text-red-400">{error}</div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-900/30 border border-green-500/30 text-sm text-green-400">{success}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isUpdatingPassword && (
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
            )}

            {(!isMagicLink && !isForgotPassword) && (
              <div>
                <label className="form-label">{isUpdatingPassword ? 'Nueva contraseña' : 'Contraseña'}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="form-input pl-10 pr-10"
                    placeholder={isLogin && !isUpdatingPassword ? 'Tu contraseña' : 'Crear contraseña (mín 6 caracteres)'}
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
            )}

            {isUpdatingPassword && (
              <div>
                <label className="form-label">Confirmar nueva contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="form-input pl-10"
                    placeholder="Repetí tu nueva contraseña"
                    minLength={6}
                    required
                  />
                </div>
              </div>
            )}

            {!isMagicLink && !isForgotPassword && !isUpdatingPassword && isLogin && (
              <div className="text-right flex justify-between items-center mt-2">
                <button
                  type="button"
                  onClick={() => { setIsMagicLink(true); setIsForgotPassword(false); setError(''); setSuccess(''); }}
                  className="text-sm font-bold text-primary-500 hover:text-primary-400"
                >
                  Entrar sin contraseña
                </button>
                <button
                  type="button"
                  onClick={() => { setIsForgotPassword(true); setIsMagicLink(false); setError(''); setSuccess(''); }}
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3.5 text-base gap-2"
            >
              {loading
                ? 'Procesando...'
                : isUpdatingPassword
                ? 'GUARDAR NUEVA CONTRASEÑA'
                : isForgotPassword
                ? 'ENVIAR ENLACE DE RECUPERACIÓN'
                : isMagicLink
                ? 'ENVIAR ENLACE MÁGICO'
                : isLogin
                ? 'INICIAR SESIÓN'
                : 'CREAR CUENTA'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>

            {(isMagicLink || isForgotPassword || isUpdatingPassword) && (
              <button
                type="button"
                onClick={() => {
                  setIsMagicLink(false);
                  setIsForgotPassword(false);
                  setIsUpdatingPassword(false);
                  setIsLogin(true);
                  setError('');
                  setSuccess('');
                }}
                className="w-full text-center text-sm text-slate-400 hover:text-white mt-2"
              >
                Volver a iniciar sesión con contraseña
              </button>
            )}
          </form>

          {!isUpdatingPassword && (
            <>
              {/* Social Logins */}
              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-[#0e1525] text-slate-400 font-medium">O continuar con</span>
                  </div>
                </div>

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={async () => {
                      setError('');
                      setLoading(true);
                      try {
                        const { data, error } = await signInWithGoogle();
                        if (error) {
                          setError(error.message || 'Error al conectar con Google.');
                          setLoading(false);
                        } else if (data?.url) {
                          window.location.href = data.url;
                        }
                      } catch (err: any) {
                        setError(err?.message || 'Error inesperado al conectar con Google.');
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                    className="w-full flex justify-center items-center gap-3 py-2.5 px-4 border border-white/10 shadow-sm glass text-sm font-bold text-slate-300 hover:bg-white/5 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                       <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                       <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                       <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                       <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                       <path d="M1 1h22v22H1z" fill="none"/>
                    </svg>
                    {loading ? 'Conectando con Google...' : 'Continuar con Google'}
                  </button>
                </div>
              </div>

              <div className="mt-8 text-center">
                <p className="text-sm text-slate-400">
                  {isLogin || isMagicLink || isForgotPassword ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'}{' '}
                  <button
                    onClick={() => { setIsLogin(!isLogin); setIsMagicLink(false); setIsForgotPassword(false); setError(''); setSuccess(''); }}
                    className="font-bold text-primary-600 hover:underline"
                  >
                    {isLogin || isMagicLink || isForgotPassword ? 'Regístrate aquí' : 'Inicia Sesión'}
                  </button>
                </p>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Al continuar, aceptás nuestros Términos de Servicio y Política de Privacidad.
        </p>
      </div>
    </div>
  );
}
