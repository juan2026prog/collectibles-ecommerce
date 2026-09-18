import { useState, useEffect } from 'react';
import { 
  MessageSquare, RefreshCw, Send, CheckCircle2, Clock, 
  AlertCircle, ExternalLink, ShieldCheck, Filter, Eye, EyeOff, Trash2, Store
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/admin/Toast';
import { BackofficePageHeader } from '../../components/backoffice';

interface AdminQuestionRecord {
  id: string;
  product_id: string;
  vendor_id: string | null;
  asked_by_user_id: string;
  question: string;
  status: 'pending' | 'answered' | 'hidden';
  created_at: string;
  product?: {
    id: string;
    title: string;
    slug: string;
    images?: Array<{ url: string }>;
  };
  vendor?: {
    id: string;
    store_name: string;
  };
  asker_profile?: {
    email: string;
    first_name: string | null;
    last_name: string | null;
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

export default function AdminQuestions() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [questions, setQuestions] = useState<AdminQuestionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterScope, setFilterScope] = useState<'all' | 'collectibles' | 'vendors'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'answered' | 'hidden'>('all');

  // Modal / Drawer state for answering (for Collectibles official products or overriding)
  const [answeringQuestion, setAnsweringQuestion] = useState<AdminQuestionRecord | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchAdminQuestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_questions')
        .select(`
          id, product_id, vendor_id, asked_by_user_id, question, status, created_at,
          product:products (
            id, title, slug,
            images:product_images (url)
          ),
          vendor:vendors (
            id, store_name
          ),
          answers:product_question_answers (
            id, answer, answered_by_user_id, vendor_id, is_admin_answer, status, created_at
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuestions(data || []);
    } catch (err: any) {
      console.error('Error fetching admin questions:', err);
      toast.error(err.message || 'Error al cargar preguntas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminQuestions();
  }, []);

  const handleToggleHideQuestion = async (q: AdminQuestionRecord) => {
    const newStatus = q.status === 'hidden' ? (q.answers && q.answers.length > 0 ? 'answered' : 'pending') : 'hidden';
    try {
      const { error } = await supabase
        .from('product_questions')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', q.id);

      if (error) throw error;
      toast.success(newStatus === 'hidden' ? 'Pregunta ocultada' : 'Pregunta restaurada');
      await fetchAdminQuestions();
    } catch (err: any) {
      toast.error(err.message || 'Error al cambiar estado de la pregunta');
    }
  };

  const handleOpenAnswerModal = (q: AdminQuestionRecord) => {
    setAnsweringQuestion(q);
    const existingAnswer = (q.answers || []).find(a => a.status === 'published');
    setAnswerText(existingAnswer ? existingAnswer.answer : '');
    setErrorMsg('');
  };

  const handleCloseAnswerModal = () => {
    setAnsweringQuestion(null);
    setAnswerText('');
    setErrorMsg('');
  };

  const handleSaveAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answeringQuestion || !user) return;

    const cleanAnswer = answerText.trim();
    if (cleanAnswer.length < 2) {
      setErrorMsg('La respuesta debe tener al menos 2 caracteres.');
      return;
    }
    if (cleanAnswer.length > 2000) {
      setErrorMsg('La respuesta no puede superar los 2000 caracteres.');
      return;
    }

    setSavingAnswer(true);
    setErrorMsg('');

    try {
      const existingAnswer = (answeringQuestion.answers || []).find(a => a.status === 'published');
      let savedAnswerId = '';

      if (existingAnswer) {
        const { error } = await supabase
          .from('product_question_answers')
          .update({
            answer: cleanAnswer,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingAnswer.id);

        if (error) throw error;
        savedAnswerId = existingAnswer.id;
      } else {
        const { data: newAns, error } = await supabase
          .from('product_question_answers')
          .insert({
            question_id: answeringQuestion.id,
            answered_by_user_id: user.id,
            vendor_id: answeringQuestion.vendor_id,
            is_admin_answer: true,
            answer: cleanAnswer,
            status: 'published'
          })
          .select()
          .single();

        if (error) throw error;
        savedAnswerId = newAns?.id || '';
      }

      toast.success('Respuesta oficial publicada.');

      // Dispatch buyer notification
      if (savedAnswerId) {
        supabase.functions.invoke('notification-dispatcher', {
          body: {
            event_type: 'product_question_answered',
            answer_id: savedAnswerId,
            question_id: answeringQuestion.id
          }
        }).catch((e) => console.warn('Notification async trigger err:', e));
      }

      handleCloseAnswerModal();
      await fetchAdminQuestions();
    } catch (err: any) {
      console.error('Error saving admin answer:', err);
      setErrorMsg(err.message || 'Error al guardar respuesta');
    } finally {
      setSavingAnswer(false);
    }
  };

  const filteredQuestions = questions.filter(q => {
    // Scope filter
    if (filterScope === 'collectibles' && q.vendor_id) return false;
    if (filterScope === 'vendors' && !q.vendor_id) return false;

    // Status filter
    if (filterStatus === 'pending' && q.status !== 'pending') return false;
    if (filterStatus === 'answered' && q.status !== 'answered') return false;
    if (filterStatus === 'hidden' && q.status !== 'hidden') return false;

    return true;
  });

  const pendingCollectiblesCount = questions.filter(q => !q.vendor_id && q.status === 'pending').length;

  return (
    <div className="space-y-6 animation-fade-in pb-16">
      <BackofficePageHeader
        badge="Moderación & Q&A"
        title="Preguntas sobre Productos"
        description="Gestioná consultas de productos propios de Collectibles y moderá preguntas de Vendors."
        actions={
          <button
            onClick={fetchAdminQuestions}
            disabled={loading}
            className="px-4 py-2 bg-dark-800 border border-dark-700 text-gray-200 font-bold rounded-xl hover:bg-dark-700 flex items-center gap-2 text-xs transition shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        }
      />

      {/* Filter Toolbar */}
      <div className="flex flex-wrap gap-4 items-center justify-between bg-dark-900 border border-dark-800 rounded-2xl p-4">
        {/* Scope Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilterScope('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              filterScope === 'all'
                ? 'bg-[#f00856] text-white'
                : 'bg-dark-800 text-gray-300 hover:bg-dark-700'
            }`}
          >
            Todos ({questions.length})
          </button>
          <button
            onClick={() => setFilterScope('collectibles')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              filterScope === 'collectibles'
                ? 'bg-[#f00856] text-white'
                : 'bg-dark-800 text-gray-300 hover:bg-dark-700'
            }`}
          >
            <span>Propios Collectibles</span>
            {pendingCollectiblesCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-white text-[#f00856] text-[10px] font-black">
                {pendingCollectiblesCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setFilterScope('vendors')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              filterScope === 'vendors'
                ? 'bg-[#f00856] text-white'
                : 'bg-dark-800 text-gray-300 hover:bg-dark-700'
            }`}
          >
            Vendors Marketplace
          </button>
        </div>

        {/* Status Filter */}
        <div className="flex gap-2">
          {(['all', 'pending', 'answered', 'hidden'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition ${
                filterStatus === st
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {st === 'all' ? 'Estado: Todos' : st === 'pending' ? 'Pendientes' : st === 'answered' ? 'Respondidas' : 'Ocultas'}
            </button>
          ))}
        </div>
      </div>

      {/* Questions List */}
      {loading ? (
        <div className="py-20 flex flex-col justify-center items-center gap-3">
          <RefreshCw className="w-8 h-8 text-[#f00856] animate-spin" />
          <p className="text-xs font-bold text-gray-400">Cargando preguntas...</p>
        </div>
      ) : filteredQuestions.length === 0 ? (
        <div className="bg-dark-900 rounded-2xl border border-dark-800 p-12 text-center">
          <MessageSquare className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white mb-1">No hay preguntas para mostrar</h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            No se encontraron consultas con los filtros seleccionados.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredQuestions.map((q) => {
            const hasAnswer = (q.answers || []).some(a => a.status === 'published');
            const publishedAns = (q.answers || []).find(a => a.status === 'published');
            const productImg = q.product?.images?.[0]?.url || 'https://via.placeholder.com/80';
            const isCollectiblesOwn = !q.vendor_id;

            return (
              <div
                key={q.id}
                className={`bg-dark-900 rounded-2xl border p-5 transition ${
                  q.status === 'hidden'
                    ? 'border-red-900/50 bg-red-950/10 opacity-70'
                    : 'border-dark-800 hover:border-dark-700'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  {/* Product & Question Details */}
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <img
                      src={productImg}
                      alt={q.product?.title || 'Producto'}
                      className="w-14 h-14 rounded-xl object-contain bg-dark-950 border border-dark-800 p-1 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <a
                          href={`/p/${q.product?.slug || ''}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-black text-white hover:text-[#f00856] transition truncate flex items-center gap-1.5"
                        >
                          {q.product?.title || 'Producto'}
                          <ExternalLink className="w-3.5 h-3.5 opacity-50 shrink-0" />
                        </a>

                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isCollectiblesOwn 
                            ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20' 
                            : 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                        }`}>
                          {isCollectiblesOwn ? 'Collectibles Oficial' : (q.vendor?.store_name || 'Vendor')}
                        </span>
                      </div>

                      {/* Question Text */}
                      <div className="bg-dark-950 border border-dark-800 rounded-xl p-3 my-2">
                        <p className="text-xs font-bold text-gray-200 leading-relaxed">
                          "{q.question}"
                        </p>
                        <span className="text-[10px] text-gray-500 font-medium block mt-1">
                          Preguntado el {new Date(q.created_at).toLocaleDateString('es-UY', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>

                      {/* Answer if exists */}
                      {hasAnswer && publishedAns && (
                        <div className="ml-4 pl-3 border-l-2 border-emerald-500 mt-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block mb-0.5">
                            {publishedAns.is_admin_answer ? 'Respuesta Oficial Collectibles:' : `Respuesta de ${q.vendor?.store_name || 'Vendor'}:`}
                          </span>
                          <p className="text-xs text-gray-300 leading-relaxed font-medium">
                            {publishedAns.answer}
                          </p>
                          <span className="text-[10px] text-gray-500 block mt-0.5">
                            Respondido el {new Date(publishedAns.created_at).toLocaleDateString('es-UY', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Moderation Actions */}
                  <div className="flex md:flex-col items-center md:items-end justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                      {q.status === 'hidden' ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                          Oculta
                        </span>
                      ) : q.status === 'pending' ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Pendiente
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Respondida
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleHideQuestion(q)}
                        className={`p-2 rounded-xl border text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                          q.status === 'hidden'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-dark-800 text-gray-400 border-dark-700 hover:text-red-400 hover:border-red-900'
                        }`}
                        title={q.status === 'hidden' ? 'Restaurar visibilidad' : 'Ocultar pregunta'}
                      >
                        {q.status === 'hidden' ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        onClick={() => handleOpenAnswerModal(q)}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#f00856] text-white hover:bg-[#d0074b] transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{isCollectiblesOwn ? (q.status === 'pending' ? 'Responder' : 'Editar') : 'Moderar/Responder'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Admin Answer Modal */}
      {answeringQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-dark-900 rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-dark-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-dark-800">
              <div>
                <span className="text-[10px] uppercase font-black tracking-widest text-[#f00856]">
                  Moderación & Respuesta Administrativa
                </span>
                <h3 className="text-lg font-black text-white">
                  Responder Pregunta
                </h3>
              </div>
              <button
                onClick={handleCloseAnswerModal}
                disabled={savingAnswer}
                className="text-gray-400 hover:text-white font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="bg-dark-950 border border-dark-800 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-black text-white truncate">
                {answeringQuestion.product?.title}
              </p>
              <div className="text-xs text-gray-300 italic border-l-2 border-[#f00856] pl-3 py-0.5">
                "{answeringQuestion.question}"
              </div>
            </div>

            <form onSubmit={handleSaveAnswer} className="space-y-3">
              <label className="block text-xs font-bold text-gray-300">
                Respuesta Oficial (Collectibles.uy)
              </label>
              <div className="relative">
                <textarea
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="Escribí la respuesta oficial..."
                  rows={4}
                  maxLength={2000}
                  disabled={savingAnswer}
                  className="w-full rounded-2xl bg-dark-950 border border-dark-800 p-3.5 text-xs text-white focus:outline-none focus:border-[#f00856] focus:ring-1 focus:ring-[#f00856] transition resize-none"
                  autoFocus
                />
                <span className="absolute bottom-2.5 right-3 text-[10px] text-gray-500 font-mono">
                  {answerText.length}/2000
                </span>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-300 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseAnswerModal}
                  disabled={savingAnswer}
                  className="px-5 py-2.5 rounded-xl border border-dark-700 text-gray-400 text-xs font-bold hover:bg-dark-800 hover:text-white"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={savingAnswer || answerText.trim().length < 2}
                  className="px-6 py-2.5 rounded-xl bg-[#f00856] text-white text-xs font-black uppercase tracking-wide hover:bg-[#d0074b] transition flex items-center gap-2 shadow-md shadow-[#f00856]/20 disabled:opacity-50"
                >
                  {savingAnswer ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Publicar Respuesta</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
