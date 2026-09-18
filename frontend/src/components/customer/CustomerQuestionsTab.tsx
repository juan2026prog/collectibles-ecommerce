import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  MessageSquare, Clock, CheckCircle2, CornerDownRight, 
  ExternalLink, RefreshCw, Sparkles, ChevronRight
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface UserQuestionRecord {
  id: string;
  product_id: string;
  vendor_id: string | null;
  question: string;
  status: 'pending' | 'answered' | 'hidden';
  created_at: string;
  product?: {
    id: string;
    title: string;
    slug: string;
    images?: Array<{ url: string }>;
  };
  answers?: Array<{
    id: string;
    answer: string;
    answered_by_user_id: string;
    vendor_id: string | null;
    is_admin_answer: boolean;
    created_at: string;
    status: string;
  }>;
}

export default function CustomerQuestionsTab() {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<UserQuestionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUserQuestions = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_questions')
        .select(`
          id, product_id, vendor_id, question, status, created_at,
          product:products (
            id, title, slug,
            images:product_images (url)
          ),
          answers:product_question_answers (
            id, answer, answered_by_user_id, vendor_id, is_admin_answer, status, created_at
          )
        `)
        .eq('asked_by_user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuestions(data || []);
    } catch (err: any) {
      console.error('Error fetching user questions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserQuestions();
  }, [user?.id]);

  if (loading) {
    return (
      <div className="py-16 flex flex-col justify-center items-center gap-3">
        <RefreshCw className="w-8 h-8 text-[#f00856] animate-spin" />
        <p className="text-xs font-bold text-slate-400">Cargando tus preguntas...</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/10 rounded-3xl p-8 text-center backdrop-blur-sm">
        <div className="w-16 h-16 rounded-3xl bg-[#f00856]/10 border border-[#f00856]/30 flex items-center justify-center text-[#f00856] mx-auto mb-4">
          <MessageSquare className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-black text-white mb-2">
          No tenés preguntas realizadas
        </h3>
        <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
          Cuando tengas dudas sobre una figura o coleccionable local, podés preguntar directamente desde su ficha de producto.
        </p>
        <Link
          to="/shop"
          className="px-6 py-3 rounded-2xl bg-[#f00856] hover:bg-[#d0074b] text-white text-xs font-black uppercase tracking-wider inline-flex items-center gap-2 shadow-lg shadow-[#f00856]/30 transition"
        >
          <Sparkles className="w-4 h-4" /> Explorar Catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-black text-white">
          Mis Preguntas Realizadas ({questions.length})
        </h2>
        <button
          onClick={fetchUserQuestions}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition font-bold"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {questions.map((q) => {
        const publishedAnswer = (q.answers || []).find((a) => a.status === 'published');
        const productImg = q.product?.images?.[0]?.url || 'https://via.placeholder.com/80';

        return (
          <div
            key={q.id}
            className="bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/10 rounded-3xl p-5 backdrop-blur-md shadow-xl hover:border-white/20 transition space-y-4"
          >
            {/* Product Header */}
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/5">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={productImg}
                  alt={q.product?.title || 'Producto'}
                  className="w-12 h-12 rounded-xl object-contain bg-white/5 border border-white/10 p-1 shrink-0"
                />
                <div className="min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Producto
                  </span>
                  <Link
                    to={`/p/${q.product?.slug || ''}#pregunta-${q.id}`}
                    className="text-sm font-black text-white hover:text-[#f00856] transition truncate block"
                  >
                    {q.product?.title || 'Producto'}
                  </Link>
                </div>
              </div>

              {publishedAnswer ? (
                <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 shrink-0">
                  <CheckCircle2 className="w-3 h-3" /> Respondida
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3" /> Esperando respuesta
                </span>
              )}
            </div>

            {/* Question Box */}
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-[#f00856]" /> Tu Pregunta:
                </span>
                <span>
                  {new Date(q.created_at).toLocaleDateString('es-UY', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  })}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-200 font-medium leading-relaxed">
                "{q.question}"
              </p>
            </div>

            {/* Answer Box if published */}
            {publishedAnswer ? (
              <div className="ml-3 sm:ml-6 pl-3 border-l-2 border-[#f00856] space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-[#f00856]/15 text-[#f00856] border border-[#f00856]/30">
                    {publishedAnswer.is_admin_answer ? 'Collectibles Oficial' : 'Respuesta del Vendedor'}
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">
                    {new Date(publishedAnswer.created_at).toLocaleDateString('es-UY', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-white leading-relaxed">
                  {publishedAnswer.answer}
                </p>
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 italic ml-2">
                ⏳ El vendedor aún no ha respondido. Te llegará una notificación en cuanto publique su respuesta.
              </div>
            )}

            {/* Deep link button to product */}
            <div className="pt-2 flex justify-end">
              <Link
                to={`/p/${q.product?.slug || ''}#pregunta-${q.id}`}
                className="text-xs font-bold text-[#f00856] hover:text-white flex items-center gap-1 transition"
              >
                <span>Ver en la ficha del producto</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
