import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { GraduationCap, BookOpen, Layers, Sparkles, Search, HelpCircle, ArrowRight } from 'lucide-react';
import SEO from '../../components/SEO';

export default function AcademyHome() {
  const [articles, setArticles] = useState<any[]>([]);
  const [scales, setScales] = useState<any[]>([]);
  const [glossary, setGlossary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadAcademyData();
  }, []);

  const loadAcademyData = async () => {
    try {
      setLoading(true);
      const [artRes, scaRes, gloRes] = await Promise.all([
        supabase.from('academy_content').select('*').eq('status', 'PUBLISHED').limit(6),
        supabase.from('academy_scales').select('*').limit(6),
        supabase.from('academy_glossary').select('*').eq('status', 'PUBLISHED').limit(8)
      ]);

      setArticles(artRes.data || []);
      setScales(scaRes.data || []);
      setGlossary(gloRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredGlossary = glossary.filter(g => 
    g.term.toLowerCase().includes(searchTerm.toLowerCase()) || 
    g.definition.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-white space-y-12">
      <SEO
        title="Collector Academy | Guías y Conocimiento Coleccionista"
        description="Aprende sobre escalas, autenticidad, cuidado de materiales, terminología y guías de compra de figuras de acción."
      />

      {/* Hero */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
          <GraduationCap size={15} />
          <span>Collector Academy</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
          La Enciclopedia Técnica del Coleccionista
        </h1>
        <p className="text-sm text-zinc-400">
          Guías editoriales, estándares de escalas, diccionario de términos y consejos expertos de preservación.
        </p>

        {/* Glossary Search Bar */}
        <div className="pt-4 max-w-md mx-auto">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar en el glosario (ej: Chase, MISB, Bootleg)..."
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Featured Articles */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BookOpen size={20} className="text-emerald-400" />
            <span>Guías Destacadas</span>
          </h2>
        </div>

        {loading ? (
          <div className="py-12 text-center text-zinc-500">Cargando guías...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((art) => (
              <Link
                key={art.id}
                to={`/academy/${art.slug}`}
                className="bg-zinc-900/70 border border-white/10 rounded-2xl p-6 hover:border-white/20 transition flex flex-col justify-between group shadow-lg"
              >
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {art.type}
                  </span>
                  <h3 className="font-bold text-base text-white group-hover:text-emerald-400 transition mt-2">
                    {art.title}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-2 line-clamp-3 leading-relaxed">
                    {art.excerpt}
                  </p>
                </div>
                <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-xs font-bold text-zinc-400 group-hover:text-white">
                  <span>Leer guía completa</span>
                  <ArrowRight size={14} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Scales Reference Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Layers size={20} className="text-sky-400" />
          <span>Tabla Maestra de Escalas</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {scales.map((s) => (
            <div key={s.id} className="bg-zinc-900/60 border border-white/10 rounded-xl p-5">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-lg font-black text-white">{s.scale_key}</span>
                <span className="text-xs font-mono text-sky-400 font-bold">{s.approx_height_cm}</span>
              </div>
              <p className="text-xs font-semibold text-zinc-300 mb-2">{s.label}</p>
              <p className="text-[11px] text-zinc-400 leading-relaxed">{s.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Glossary Mini-Hub */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <HelpCircle size={20} className="text-amber-400" />
          <span>Glosario Técnico de Coleccionismo</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredGlossary.map((g) => (
            <div key={g.id} className="bg-zinc-900/60 border border-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-sm text-white">{g.term}</span>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                  {g.category}
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">{g.definition}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
