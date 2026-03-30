import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { FileText, ArrowLeft } from 'lucide-react';

export default function DynamicPage() {
  const { slug } = useParams();
  const [page, setPage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchPage() {
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
      } catch (err) {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchPage();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
        <p className="text-gray-400 mt-4 font-medium animate-pulse">Cargando página...</p>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
        <FileText className="w-16 h-16 text-gray-300 mb-4" />
        <h1 className="text-3xl font-black text-dark-900 mb-2">Página no encontrada</h1>
        <p className="text-gray-500 mb-8 max-w-md">La página que buscas no existe, fue movida o se encuentra actualmente en borrador.</p>
        <Link to="/" className="btn-primary flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> Volver al Inicio</Link>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-[60vh]">
      {/* Page Header */}
      <div className="bg-gray-50 border-b border-gray-100 py-12 md:py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-3xl md:text-5xl font-black text-dark-900 tracking-tight">{page.title}</h1>
        </div>
      </div>
      
      {/* Page Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
         {/* Render HTML Content safely using dangerouslySetInnerHTML. We rely on the SuperAdmin to only ingest safe HTML through their panel */}
        <div 
           className="prose prose-lg prose-blue max-w-none text-gray-700 
           prose-headings:font-bold prose-headings:text-dark-900 
           prose-a:text-primary-600 prose-a:no-underline hover:prose-a:underline
           prose-img:rounded-xl prose-img:shadow-sm"
           dangerouslySetInnerHTML={{ __html: page.content || '' }} 
        />
      </div>
    </div>
  );
}
