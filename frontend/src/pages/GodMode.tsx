import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Zap, Shield, Store, Star, Share2, LayoutDashboard, Video, Terminal, CheckCircle2, AlertCircle } from 'lucide-react';

export default function GodMode() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [log, setLog] = useState<string[]>([]);

  const GOD_EMAIL = 'admin@collectibles.uy';
  const GOD_PASSWORD = 'jmcp1984';

  function addLog(msg: string) {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }

  async function activate() {
    setStatus('working');
    setError('');
    setLog([]);

    try {
      addLog('⚡ Iniciando protocolo God Mode...');
      addLog('📡 Contactando Edge Function create-test-user...');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/create-test-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ email: GOD_EMAIL, password: GOD_PASSWORD }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Edge Function respondió con error');
      }

      addLog('✅ Usuario creado/verificado con email confirmado');
      addLog('🔑 Roles asignados: Admin + Vendor + Artist + Affiliate + Star2Fan');
      addLog('🌱 Datos semilla: Settings, Feature Toggles, Menús');
      addLog('🔐 Intentando login automático...');

      const { error: loginErr } = await signIn(GOD_EMAIL, GOD_PASSWORD);
      if (loginErr) throw new Error(loginErr.message);

      addLog('🎉 ¡Login exitoso! Redirigiendo al Admin Panel...');
      setStatus('done');

      setTimeout(() => navigate('/admin'), 1500);
    } catch (err: any) {
      setError(err.message);
      addLog(`❌ ERROR: ${err.message}`);
      setStatus('error');
    }
  }

  const roles = [
    { icon: LayoutDashboard, label: 'Super Admin', color: 'text-blue-400 bg-blue-500/10', desc: 'Control total del panel' },
    { icon: Store, label: 'Vendor Pro', color: 'text-purple-400 bg-purple-500/10', desc: 'Marketplace multi-tienda' },
    { icon: Star, label: 'Artist Studio', color: 'text-yellow-400 bg-yellow-500/10', desc: 'Comisiones artísticas' },
    { icon: Video, label: 'Star2Fan', color: 'text-rose-400 bg-rose-500/10', desc: 'Saludos personalizados' },
    { icon: Share2, label: 'Affiliate', color: 'text-pink-400 bg-pink-500/10', desc: 'Sistema de referidos' },
  ];

  const seedData = [
    '✦ site_settings (14 configuraciones)',
    '✦ feature_toggles (9 módulos)',
    '✦ Menú Header + Footer (JSON)',
    '✦ Announcement bar (marquee)',
    '✦ Vendor "God Store"',
    '✦ Artist + Star2Fan Creator',
    '✦ Affiliate code: GOD_MODE_2026',
  ];

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 font-mono">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-500/20 border-2 border-green-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Zap className="w-10 h-10 text-green-400" />
          </div>
          <h1 className="text-3xl font-black text-green-400 tracking-widest uppercase">God Mode</h1>
          <p className="text-gray-500 text-sm mt-2">Acceso de desarrollo — Crea un usuario con TODOS los roles y seedea la configuración completa</p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
          {/* Roles grid */}
          <div className="mb-6">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Roles que se activarán:</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {roles.map(r => (
                <div key={r.label} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg ${r.color} group cursor-default`}>
                  <r.icon className="w-4 h-4 flex-shrink-0" />
                  <div>
                    <span className="text-xs font-bold block">{r.label}</span>
                    <span className="text-[10px] opacity-70">{r.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Seed data preview */}
          <div className="mb-6">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Datos semilla que se insertarán:</h2>
            <div className="bg-gray-950 rounded-lg p-4 border border-gray-800 grid grid-cols-2 gap-1.5">
              {seedData.map((item, i) => (
                <div key={i} className="text-xs text-green-300/80 flex items-start gap-1.5">
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Credentials preview */}
          <div className="bg-gray-950 rounded-lg p-4 mb-6 border border-gray-800">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-500">Email:</span>
              <span className="text-green-400 font-bold">{GOD_EMAIL}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Password:</span>
              <span className="text-green-400 font-bold">••••••••</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-lg mb-4 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Log output */}
          {log.length > 0 && (
            <div className="bg-black rounded-lg p-4 mb-6 max-h-48 overflow-y-auto border border-gray-800">
              {log.map((line, i) => (
                <p key={i} className="text-xs text-green-300 font-mono leading-relaxed flex items-start gap-2">
                  <Terminal className="w-3 h-3 mt-0.5 flex-shrink-0 text-green-500/50" />
                  {line}
                </p>
              ))}
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={activate}
            disabled={status === 'working' || status === 'done'}
            className={`w-full font-bold py-4 px-6 rounded-xl text-lg flex items-center justify-center gap-3 transition-all transform active:scale-95 ${
              status === 'done'
                ? 'bg-green-600 text-white cursor-default'
                : status === 'working'
                ? 'bg-gray-700 text-gray-400 cursor-wait animate-pulse'
                : 'bg-green-500 hover:bg-green-400 text-gray-950 hover:scale-105 shadow-lg shadow-green-500/25'
            }`}
          >
            {status === 'done' ? <CheckCircle2 className="w-6 h-6" /> : <Shield className="w-6 h-6" />}
            {status === 'idle' && 'Activar God Mode'}
            {status === 'working' && 'Procesando...'}
            {status === 'done' && '¡Activado! Redirigiendo...'}
            {status === 'error' && 'Reintentar'}
          </button>

          {/* Post-activation navigation */}
          {status === 'done' && (
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button onClick={() => navigate('/admin')} className="px-4 py-2.5 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-500/20 transition-colors flex items-center justify-center gap-2">
                <LayoutDashboard className="w-4 h-4" /> Admin Panel
              </button>
              <button onClick={() => navigate('/vendor')} className="px-4 py-2.5 bg-purple-500/10 text-purple-400 rounded-lg text-xs font-bold hover:bg-purple-500/20 transition-colors flex items-center justify-center gap-2">
                <Store className="w-4 h-4" /> Vendor Hub
              </button>
              <button onClick={() => navigate('/artist')} className="px-4 py-2.5 bg-yellow-500/10 text-yellow-400 rounded-lg text-xs font-bold hover:bg-yellow-500/20 transition-colors flex items-center justify-center gap-2">
                <Star className="w-4 h-4" /> Artist Studio
              </button>
              <button onClick={() => navigate('/star2fan')} className="px-4 py-2.5 bg-rose-500/10 text-rose-400 rounded-lg text-xs font-bold hover:bg-rose-500/20 transition-colors flex items-center justify-center gap-2">
                <Video className="w-4 h-4" /> Star2Fan
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          Solo para desarrollo. Eliminar antes de producción.
        </p>
      </div>
    </div>
  );
}
