import { useState, useEffect } from 'react';
import { 
  MessageSquare, RefreshCw, Send, CheckCircle2, Clock, 
  AlertCircle, ExternalLink, CornerDownRight, ShieldCheck, Filter
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/admin/Toast';
import { BackofficePageHeader, BackofficeTabs } from '../backoffice';

interface QuestionRecord {
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

export default function VQuestions({ activeStoreId }: { activeStoreId?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [questions, setQuestions] = useState<QuestionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'pending' | 'answered' | 'all'>('pending');

  // Modal / Drawer state for answering
  const [answeringQuestion, setAnsweringQuestion] = useState<QuestionRecord | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchVendorQuestions = async () => {
    if (!user) return;
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
          answers:product_question_answers (
            id, answer, answered_by_user_id, vendor_id, is_admin_answer, status, created_at
          )
        `)
        .eq('vendor_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuestions(data || []);
    } catch (err: any) {
      console.error('Error fetching vendor questions:', err);
      toast.error(err.message || 'Error al cargar preguntas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendorQuestions();
  }, [user?.id]);

  const handleOpenAnswerModal = (q: QuestionRecord) => {
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
          .eq('id', existingAnswer.id)
          .eq('answered_by_user_id', user.id);

        if (error) throw error;
        savedAnswerId = existingAnswer.id;
      } else {
        const { data: newAns, error } = await supabase
          .from('product_question_answers')
          .insert({
            question_id: answeringQuestion.id,
            answered_by_user_id: user.id,
            vendor_id: user.id,
            is_admin_answer: false,
            answer: cleanAnswer,
            status: 'published'
          })
          .select()
          .single();

        if (error) throw error;
        savedAnswerId = newAns?.id || '';
      }

      toast.success('Respuesta publicada correctamente.');

      // Dispatch buyer notification async via edge function
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
      await fetchVendorQuestions();
    } catch (err: any) {
      console.error('Error saving answer:', err);
      setErrorMsg(err.message || 'Error al guardar respuesta');
    } finally {
      setSavingAnswer(false);
    }
  };

  const filteredQuestions = questions.filter(q => {
    if (filterTab === 'pending') return q.status === 'pending';
    if (filterTab === 'answered') return q.status === 'answered';
    return true;
  });

  const pendingCount = questions.filter(q => q.status === 'pending').length;
  const answeredCount = questions.filter(q => q.status === 'answered').length;

  return (
    <div className="space-y-6 animation-fade-in pb-16">
      {/* Header */}
      <BackofficePageHeader
        badge="Centro de Consultas"
        title="Preguntas sobre tus Productos"
        description="Respondé a los coleccionistas interesados en tus publicaciones de catálogo local."
        actions={
          <button
            onClick={fetchVendorQuestions}
            disabled={loading}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 flex items-center gap-2 text-xs transition shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        }
      />

      {/* Quick Stats Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setFilterTab('pending')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            filterTab === 'pending'
              ? 'bg-[#f00856] text-white shadow-md shadow-[#f00856]/20'
              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Pendientes ({pendingCount})
        </button>

        <button
          onClick={() => setFilterTab('answered')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            filterTab === 'answered'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Respondidas ({answeredCount})
        </button>

        <button
          onClick={() => setFilterTab('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            filterTab === 'all'
              ? 'bg-gray-900 text-white shadow-md'
              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          Todas ({questions.length})
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-20 flex flex-col justify-center items-center gap-3">
          <RefreshCw className="w-8 h-8 text-[#f00856] animate-spin" />
          <p className="text-xs font-bold text-gray-500">Cargando preguntas de tus productos...</p>
        </div>
      ) : filteredQuestions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
          <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-900 mb-1">
            {filterTab === 'pending' ? '¡Estás al día!' : 'No hay preguntas en esta sección'}
          </h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            {filterTab === 'pending'
              ? 'No tenés preguntas pendientes de respuesta en este momento.'
              : 'Cuando los compradores consulten sobre tus productos, aparecerán listadas acá.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredQuestions.map((q) => {
            const hasAnswer = q.status === 'answered' && (q.answers || []).some(a => a.status === 'published');
            const publishedAns = (q.answers || []).find(a => a.status === 'published');
            const productImg = q.product?.images?.[0]?.url || 'https://via.placeholder.com/80';

            return (
              <div
                key={q.id}
                className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:border-gray-300 transition"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  {/* Product Mini Info */}
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <img
                      src={productImg}
                      alt={q.product?.title || 'Producto'}
                      className="w-14 h-14 rounded-xl object-contain bg-gray-50 border border-gray-100 p-1 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <a
                          href={`/p/${q.product?.slug || ''}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-black text-gray-900 hover:text-[#f00856] transition truncate flex items-center gap-1.5"
                        >
                          {q.product?.title || 'Producto'}
                          <ExternalLink className="w-3.5 h-3.5 opacity-50 shrink-0" />
                        </a>
                      </div>

                      {/* Question Text */}
                      <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 my-2">
                        <p className="text-xs font-bold text-gray-800 leading-relaxed">
                          "{q.question}"
                        </p>
                        <span className="text-[10px] text-gray-400 font-medium block mt-1">
                          Preguntado el {new Date(q.created_at).toLocaleDateString('es-UY', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>

                      {/* Existing Answer if any */}
                      {hasAnswer && publishedAns && (
                        <div className="ml-4 pl-3 border-l-2 border-emerald-500 mt-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block mb-0.5">
                            Tu Respuesta:
                          </span>
                          <p className="text-xs text-gray-700 leading-relaxed font-medium">
                            {publishedAns.answer}
                          </p>
                          <span className="text-[10px] text-gray-400 block mt-0.5">
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

                  {/* Actions & Status Badge */}
                  <div className="flex md:flex-col items-center md:items-end justify-between gap-3 shrink-0">
                    {q.status === 'pending' ? (
                      <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Pendiente
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Respondida
                      </span>
                    )}

                    <button
                      onClick={() => handleOpenAnswerModal(q)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        q.status === 'pending'
                          ? 'bg-[#f00856] text-white hover:bg-[#d0074b] shadow-sm'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      {q.status === 'pending' ? 'Responder' : 'Editar Respuesta'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Answer Modal */}
      {answeringQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <span className="text-[10px] uppercase font-black tracking-widest text-[#f00856]">
                  Atención al Cliente
                </span>
                <h3 className="text-lg font-black text-gray-900">
                  Responder Pregunta
                </h3>
              </div>
              <button
                onClick={handleCloseAnswerModal}
                disabled={savingAnswer}
                className="text-gray-400 hover:text-gray-600 font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Product & Question Summary */}
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-black text-gray-900 truncate">
                {answeringQuestion.product?.title}
              </p>
              <div className="text-xs text-gray-700 italic border-l-2 border-[#f00856] pl-3 py-0.5">
                "{answeringQuestion.question}"
              </div>
            </div>

            {/* Answer Form */}
            <form onSubmit={handleSaveAnswer} className="space-y-3">
              <label className="block text-xs font-bold text-gray-700">
                Tu Respuesta Pública
              </label>
              <div className="relative">
                <textarea
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="Escribí una respuesta clara, amable y precisa para el comprador..."
                  rows={4}
                  maxLength={2000}
                  disabled={savingAnswer}
                  className="w-full rounded-2xl border border-gray-200 p-3.5 text-xs text-gray-900 focus:outline-none focus:border-[#f00856] focus:ring-1 focus:ring-[#f00856] transition resize-none"
                  autoFocus
                />
                <span className="absolute bottom-2.5 right-3 text-[10px] text-gray-400 font-mono">
                  {answerText.length}/2000
                </span>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseAnswerModal}
                  disabled={savingAnswer}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-50"
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
