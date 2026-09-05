import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Archive, ShieldCheck, User, Eye, Lock } from 'lucide-react';
import { sanitizeUserProfileForPublic, sanitizeCollectionForPublic } from '../../plugins/collector-vault/core/privacyGuard';
import SEO from '../../components/SEO';

export default function PublicCollectorProfile() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<any>(null);
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (username) loadPublicProfile(username);
  }, [username]);

  const loadPublicProfile = async (handle: string) => {
    try {
      setLoading(true);
      const { data: profData, error: profErr } = await supabase
        .from('vault_user_profiles')
        .select('*')
        .eq('display_name', handle)
        .single();

      if (!profErr && profData) {
        // Enforce strict privacy guard
        const safeProfile = sanitizeUserProfileForPublic(profData);
        setProfile(safeProfile);

        const { data: colsData } = await supabase
          .from('vault_collections')
          .select('*')
          .eq('user_id', profData.user_id)
          .eq('visibility', 'PUBLIC');

        setCollections((colsData || []).map(sanitizeCollectionForPublic));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="py-24 text-center text-zinc-500">Cargando vitrina de coleccionista...</div>;

  if (!profile) {
    return (
      <div className="py-24 text-center max-w-md mx-auto text-white">
        <h2 className="text-lg font-bold mb-2">Coleccionista no encontrado</h2>
        <p className="text-xs text-zinc-400 mb-4">El perfil solicitado es privado o no existe.</p>
        <Link to="/" className="text-amber-400 text-xs font-bold hover:underline">Volver al inicio</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 text-white space-y-8">
      <SEO
        title={`Vitrina de ${profile.display_name} | Collectibles`}
        description={profile.bio || 'Colección personal verificada'}
      />

      {/* Profile Card */}
      <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 sm:p-8 flex items-center gap-6">
        <div className="w-20 h-20 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-2xl font-black">
          {profile.display_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black">{profile.display_name}</h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Coleccionista Verificado
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1 max-w-xl">{profile.bio || 'Sin biografía pública.'}</p>
        </div>
      </div>

      {/* Public Collections */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold">Vitrinas Públicas ({collections.length})</h2>
        {collections.length === 0 ? (
          <div className="bg-zinc-900/30 border border-white/5 rounded-xl p-6 text-center text-xs text-zinc-500">
            Este coleccionista no tiene vitrinas marcadas como públicas.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {collections.map((c) => (
              <div key={c.id} className="bg-zinc-900/60 border border-white/10 rounded-xl p-5">
                <h3 className="font-bold text-sm text-white">{c.name}</h3>
                <p className="text-xs text-zinc-400 mt-1">{c.description || 'Vitrina temática'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
