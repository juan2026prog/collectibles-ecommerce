import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  MessageSquare, Send, CheckCircle2, AlertCircle, Clock, 
  CornerDownRight, ShieldCheck, Sparkles, User, LogIn, ChevronRight
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { canAskProductQuestion } from '../../lib/productQuestionRules';

interface ProductQuestionItem {
  id: string;
  product_id: string;
  vendor_id: string | null;
  asked_by_user_id: string;
  question: string;
  status: 'pending' | 'answered' | 'hidden';
  created_at: string;
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

interface ProductQuestionsSectionProps {
  product: any;
}

export default function ProductQuestionsSection({ product }: ProductQuestionsSectionProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const eligibility = canAskProductQuestion(product);

  // If product is international or ineligible, do NOT render the component at all
  if (!eligibility.allowed) {
    return null;
  }

  const [questions, setQuestions] = useState<ProductQuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [questionText, setQuestionText] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [highlightedQuestionId, setHighlightedQuestionId] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement | null>(null);

  // Check saved draft from sessionStorage (when user was redirected to login)
  useEffect(() => {
    if (!product?.id) return;
    const draftKey = `product_question_draft_${product.id}`;
    const savedDraft = sessionStorage.getItem(draftKey);
    if (savedDraft) {
      setQuestionText(savedDraft);
    }
  }, [product?.id]);

  // Load questions
  const fetchQuestions = async () => {
    if (!product?.id) return;
    try {
      const { data, error } = await supabase
        .from('product_questions')
        .select(`
          id, product_id, vendor_id, asked_by_user_id, question, status, created_at,
          answers:product_question_answers (
            id, answer, answered_by_user_id, vendor_id, is_admin_answer, status, created_at
          )
        `)
        .eq('product_id', product.id)
        .in('status', ['pending', 'answered'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuestions(data || []);
    } catch (err: any) {
      console.error('Error loading product questions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, [product?.id]);

  // Handle deep link anchor #pregunta-{id}
  useEffect(() => {
    if (location.hash && location.hash.startsWith('#pregunta-')) {
      const targetId = location.hash.replace('#pregunta-', '');
      setHighlightedQuestionId(targetId);

      setTimeout(() => {
        const el = document.getElementById(`pregunta-${targetId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 500);
    }
  }, [location.hash, questions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const cleanQuestion = questionText.trim();
    if (cleanQuestion.length < 5) {
      setStatusMessage({ type: 'error', text: 'La pregunta debe tener al menos 5 caracteres.' });
      return;
    }
    if (cleanQuestion.length > 1000) {
      setStatusMessage({ type: 'error', text: 'La pregunta no puede superar los 1000 caracteres.' });
      return;
    }

    // Unauthenticated user flow: save draft and redirect to login
    if (!user) {
      const draftKey = `product_question_draft_${product.id}`;
      sessionStorage.setItem(draftKey, cleanQuestion);
      navigate(`/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }

    setSubmitting(true);
    try {
      // Determine vendor_id for the question
      const targetVendorId = eligibility.isVendorProduct ? product.vendor_id : null;

      const { data: newQuestion, error } = await supabase
        .from('product_questions')
        .insert({
          product_id: product.id,
          vendor_id: targetVendorId,
          asked_by_user_id: user.id,
          question: cleanQuestion,
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;

      // Clear draft
      sessionStorage.removeItem(`product_question_draft_${product.id}`);
      setQuestionText('');
      setStatusMessage({
        type: 'success',
        text: 'Tu pregunta fue enviada. Te avisaremos cuando recibas una respuesta.'
      });

      // Dispatch notification trigger in background
      if (newQuestion) {
        supabase.functions.invoke('notification-dispatcher', {
          body: {
            event_type: 'product_question_received',
            question_id: newQuestion.id,
            product_id: newQuestion.id,
          }
        }).catch((e) => console.warn('Could not dispatch notification async:', e));
      }

      await fetchQuestions();
    } catch (err: any) {
      console.error('Error creating question:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Error al enviar la pregunta. Por favor intenta nuevamente.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const responderLabel = eligibility.isVendorProduct 
    ? (product.vendor_store?.store_name || product.vendor?.store_name || 'El Vendedor Oficial')
    : 'Collectibles.uy';

  return (
    <section className="mt-14 border-t border-white/10 pt-10" id="seccion-preguntas">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <span className="text-[10px] uppercase font-black tracking-[0.2em] text-[#f00856] flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> Consultas Directas
          </span>
          <h2 className="text-2xl md:text-3xl font-black mt-1 text-white tracking-tight">
            Preguntas sobre este producto
          </h2>
        </div>
        <div className="text-xs text-slate-400 font-medium">
          Respondido por <strong className="text-white">{responderLabel}</strong>
        </div>
      </div>

      {/* Question Form */}
      <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-4 sm:p-6 mb-8 relative overflow-hidden">
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
          <label htmlFor="product-question-input" className="block text-xs font-bold text-slate-300">
            Escribí tu pregunta sobre el producto
          </label>
          <div className="relative">
            <textarea
              id="product-question-input"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="¿Tenés dudas sobre el estado, caja, accesorios o disponibilidad? Preguntá acá..."
              rows={3}
              maxLength={1000}
              disabled={submitting}
              className="w-full rounded-xl bg-black/40 border border-white/10 p-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#f00856] focus:ring-1 focus:ring-[#f00856] transition-all resize-none"
            />
            <span className="absolute bottom-2.5 right-3 text-[10px] text-slate-500 font-mono">
              {questionText.length}/1000
            </span>
          </div>

          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 animate-fade-in ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-300 border border-red-500/20'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Sin spam. Las respuestas son públicas para toda la comunidad.</span>
            </div>

            <button
              type="submit"
              disabled={submitting || questionText.trim().length < 5}
              className="btn-primary rounded-xl px-6 py-2.5 flex items-center justify-center gap-2 text-xs uppercase tracking-wide font-black transition-all shadow-md shadow-[#f00856]/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0 min-h-[44px]"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Preguntar</span>
                  <Send className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Questions List */}
      <div className="space-y-4">
        <h3 className="text-sm uppercase font-black tracking-wider text-slate-400">
          Últimas preguntas ({questions.length})
        </h3>

        {loading ? (
          <div className="py-8 flex justify-center items-center">
            <div className="w-6 h-6 border-2 border-[#f00856] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : questions.length === 0 ? (
          <div className="py-8 px-6 rounded-2xl bg-white/[0.02] border border-white/5 text-center">
            <MessageSquare className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-white mb-1">
              Todavía no hay preguntas sobre este producto.
            </p>
            <p className="text-xs text-slate-400">
              ¿Querés saber algo sobre estado, empaque o entrega? Hacé la primera pregunta arriba.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((q) => {
              const publishedAnswer = (q.answers || []).find((a) => a.status === 'published');
              const isHighlighted = highlightedQuestionId === q.id;

              return (
                <div
                  key={q.id}
                  id={`pregunta-${q.id}`}
                  className={`rounded-2xl p-5 bg-white/[0.02] border transition-all duration-300 ${
                    isHighlighted
                      ? 'border-[#f00856] bg-[#f00856]/5 shadow-lg shadow-[#f00856]/10'
                      : 'border-white/5 hover:border-white/10'
                  }`}
                >
                  {/* Question Header & Body */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                        <MessageSquare className="w-3.5 h-3.5 text-slate-300" />
                      </div>
                      <div>
                        <p className="text-sm text-white font-medium leading-relaxed">{q.question}</p>
                        <span className="text-[10px] text-slate-500 font-bold block mt-1">
                          {new Date(q.created_at).toLocaleDateString('es-UY', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>

                    {q.status === 'pending' && !publishedAnswer && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Esperando respuesta
                      </span>
                    )}
                  </div>

                  {/* Answer Block */}
                  {publishedAnswer ? (
                    <div className="mt-4 pt-3 border-t border-white/5 ml-4 sm:ml-7 flex items-start gap-2.5">
                      <CornerDownRight className="w-4 h-4 text-slate-500 shrink-0 mt-1" />
                      <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-xl p-3.5">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
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
                        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                          {publishedAnswer.answer}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 ml-4 sm:ml-7 text-[11px] text-slate-500 italic">
                      El responsable del producto revisará tu consulta a la brevedad.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
