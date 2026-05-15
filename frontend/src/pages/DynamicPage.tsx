import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { FileText, ArrowLeft } from 'lucide-react';
import { sanitizeRichHtml } from '../lib/sanitize';

export default function DynamicPage({ forcedSlug }: { forcedSlug?: string }) {
  const { slug: routeSlug } = useParams();
  const slug = forcedSlug || routeSlug;
  const [page, setPage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchPage() {
      if (!slug) {
        setError(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(false);
      try {
        const { data, error } = await supabase
          .from('pages')
          .select('*')
          .eq('slug', slug)
          .eq('status', 'published')
          .single();

        if (error || !data) throw new Error('Not found');
        setPage(data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    fetchPage();
  }, [slug]);

  const safeContent = useMemo(() => sanitizeRichHtml(page?.content || ''), [page?.content]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
        <p className="text-slate-500 mt-4 font-medium animate-pulse">Cargando pagina...</p>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
        <FileText className="w-16 h-16 text-slate-500 mb-4" />
        <h1 className="text-3xl font-black text-white mb-2">Pagina no encontrada</h1>
        <p className="text-slate-400 mb-8 max-w-md">La pagina que buscas no existe, fue movida o se encuentra actualmente en borrador.</p>
        <Link to="/" className="btn-primary flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Volver al Inicio</Link>
      </div>
    );
  }

  return (
    <div className="glass min-h-[60vh]">
      <div className="bg-white/5 border-b border-white/10 py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">{page.title}</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div
          className="prose prose-lg prose-blue max-w-none text-slate-300 prose-headings:font-bold prose-headings:text-white prose-a:text-primary-600 prose-a:no-underline hover:prose-a:underline prose-img: prose-img:shadow-sm"
          dangerouslySetInnerHTML={{ __html: safeContent }}
        />
      </div>
    </div>
  );
}
