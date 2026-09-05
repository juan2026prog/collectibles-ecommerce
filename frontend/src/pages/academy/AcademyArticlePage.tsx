import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, BookOpen, Clock, Tag, ExternalLink } from 'lucide-react';
import SEO from '../../components/SEO';

export default function AcademyArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (slug) loadArticle(slug);
  }, [slug]);

  const loadArticle = async (articleSlug: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('academy_content')
        .select('*')
        .eq('slug', articleSlug)
        .eq('status', 'PUBLISHED')
        .single();

      if (!error && data) {
        setArticle(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="py-24 text-center text-zinc-500">Cargando artículo...</div>;

  if (!article) {
    return (
      <div className="py-24 text-center max-w-md mx-auto text-white">
        <h2 className="text-lg font-bold mb-2">Artículo no encontrado</h2>
        <p className="text-xs text-zinc-400 mb-4">El contenido no existe o no ha sido publicado.</p>
        <Link to="/academy" className="text-emerald-400 text-xs font-bold hover:underline">
          ← Volver a Academy
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 text-white space-y-6">
      <SEO
        title={`${article.seo_title || article.title} | Collector Academy`}
        description={article.seo_description || article.excerpt || ''}
      />

      <Link to="/academy" className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white transition">
        <ArrowLeft size={14} />
        <span>Volver a Collector Academy</span>
      </Link>

      <article className="bg-zinc-900/80 border border-white/10 rounded-2xl p-6 sm:p-10 shadow-xl space-y-6">
        <div>
          <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {article.type}
          </span>
          <h1 className="text-2xl sm:text-4xl font-black mt-3 leading-tight">{article.title}</h1>
          {article.excerpt && (
            <p className="text-sm sm:text-base text-zinc-300 mt-3 font-medium leading-relaxed">
              {article.excerpt}
            </p>
          )}
        </div>

        <div className="pt-6 border-t border-white/10 prose prose-invert max-w-none text-sm leading-relaxed text-zinc-300 whitespace-pre-line">
          {article.body}
        </div>
      </article>
    </div>
  );
}
