import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Send, Bot, ChevronRight, Headphones
} from 'lucide-react';
import { AssistantService, type ChatMessage } from '../../services/support/assistantService';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useLocale } from '../../contexts/LocaleContext';
import { Link } from 'react-router-dom';

const INITIAL_PROMPT_SUGGESTIONS = [
  'Figuras NECA de Alien',
  'Batman que no sea Funko',
  'Marvel Legends menos de 50 dólares',
  '¿Cómo funciona la franquicia de USD 200?',
  '¿Dónde está mi pedido?'
];

function getOrCreateSupportSessionId(): string {
  let sid = localStorage.getItem('collectibles_support_sid');
  if (!sid) {
    sid = `sid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem('collectibles_support_sid', sid);
  }
  return sid;
}

export const CollectiblesAIAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [humanSupportEnabled, setHumanSupportEnabled] = useState(false);
  const [chatbotVisible, setChatbotVisible] = useState(true);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ASSISTANT',
      text: '¡Hola! Soy tu Asistente de Collectibles. ¿Qué figura estás buscando o cómo puedo ayudarte hoy?',
      timestamp: new Date().toISOString(),
      suggestedActions: INITIAL_PROMPT_SUGGESTIONS
    }
  ]);

  const { user } = useAuth();
  const { formatCurrencyPrice } = useCurrency();
  const { country } = useLocale();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sessionId = getOrCreateSupportSessionId();
  const [sessionSecret, setSessionSecret] = useState<string | null>(() => localStorage.getItem('collectibles_support_secret'));

  // Load Assistant Config (checks if human support is enabled or chatbot active)
  useEffect(() => {
    AssistantService.getSystemConfig().then(cfg => {
      setHumanSupportEnabled(cfg.human_support_enabled);
      setChatbotVisible(cfg.chatbot_enabled);
    }).catch(() => {});
  }, []);

  // Initialize or restore conversation when widget is opened
  useEffect(() => {
    if (isOpen && !conversationId) {
      AssistantService.ensureConversation({
        sessionId,
        sessionSecret,
        userId: user?.id,
        userEmail: user?.email,
        userName: (user as any)?.user_metadata?.full_name,
        countryCode: country || 'UY'
      }).then(conv => {
        if (conv?.id) {
          setConversationId(conv.id);
          if (conv.sessionSecret) {
            setSessionSecret(conv.sessionSecret);
            localStorage.setItem('collectibles_support_secret', conv.sessionSecret);
          }
          AssistantService.loadMessages(conv.id, { sessionId, sessionSecret: conv.sessionSecret || sessionSecret || undefined }).then(loadedMsgs => {
            if (loadedMsgs.length > 0) {
              setMessages(loadedMsgs);
            }
          });
        }
      });
    }
  }, [isOpen, conversationId, user, country, sessionId, sessionSecret]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend?: string) => {
    const messageText = (textToSend || input).trim();
    if (!messageText || loading) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'USER',
      text: messageText,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await AssistantService.processMessage({
        userMessage: messageText,
        conversationHistory: messages,
        conversationId,
        sessionId,
        sessionSecret: sessionSecret || undefined,
        userId: user?.id,
        userEmail: user?.email,
        userName: (user as any)?.user_metadata?.full_name,
        countryCode: country || 'UY'
      } as any);

      if (response.conversationId && !conversationId) {
        setConversationId(response.conversationId);
      }

      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        sender: 'ASSISTANT',
        text: response.reply,
        timestamp: new Date().toISOString(),
        intent: response.intent,
        products: response.products,
        suggestedActions: response.suggestedActions
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'ASSISTANT',
        text: 'Disculpas, ocurrió una intermitencia de conexión momentánea. Podés reintentar tu consulta.',
        timestamp: new Date().toISOString(),
        isError: true,
        suggestedActions: ['Reintentar', 'Consultar sobre un producto']
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleEscalateHuman = () => {
    handleSend('Quiero hablar con una persona del equipo');
  };

  if (!chatbotVisible) {
    return null;
  }

  return (
    <>
      {/* Floating Launcher Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-full shadow-2xl transition-all duration-300 transform hover:scale-105 active:scale-95 group focus:outline-none focus:ring-4 focus:ring-red-500/30"
          aria-label="Abrir Asistente Collectibles AI"
        >
          <div className="relative">
            <Bot className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full" />
          </div>
          <span className="text-sm font-semibold tracking-wide hidden sm:inline">Collectibles AI</span>
        </button>
      )}

      {/* Floating Chat Modal */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[95vw] sm:w-[420px] max-w-[440px] h-[600px] max-h-[85vh] bg-[#0c1015] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          
          {/* Header */}
          <div className="px-4 py-3.5 bg-[#121824] border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-400">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  Collectibles AI Assistant
                  <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">100% IA</span>
                </h3>
                <p className="text-[11px] text-zinc-400">Búsqueda, importaciones y soporte oficial ({country || 'UY'})</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Only show human escalation button if human_support_enabled is explicitly true in Superadmin */}
              {humanSupportEnabled && (
                <button
                  onClick={handleEscalateHuman}
                  title="Hablar con una persona"
                  className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition"
                >
                  <Headphones className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition"
                aria-label="Cerrar chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Conversation Stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-gradient-to-b from-[#0c1015] to-[#080b0f]">
            {messages.map(msg => (
              <div 
                key={msg.id} 
                className={`flex flex-col ${msg.sender === 'USER' ? 'items-end' : 'items-start'}`}
              >
                <div 
                  className={`max-w-[85%] rounded-2xl p-3.5 text-xs sm:text-sm leading-relaxed ${
                    msg.sender === 'USER'
                      ? 'bg-red-600 text-white rounded-br-none shadow-md'
                      : msg.isError
                        ? 'bg-amber-950/40 border border-amber-800/40 text-amber-200 rounded-bl-none'
                        : 'bg-[#151d2a] border border-white/5 text-zinc-200 rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {/* Product Cards Stack */}
                  {msg.products && msg.products.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400">Piezas recomendadas:</p>
                      <div className="grid grid-cols-1 gap-2">
                        {msg.products.map(prod => (
                          <Link 
                            key={prod.id}
                            to={prod.is_international ? `/import-hub` : `/product/${prod.slug}`}
                            className="flex items-center gap-3 p-2 rounded-xl bg-black/40 hover:bg-white/5 border border-white/5 transition group"
                          >
                            <img 
                              src={prod.image_url || '/placeholder.png'} 
                              alt={prod.title} 
                              className="w-12 h-12 rounded-lg object-cover bg-zinc-900 border border-white/10 shrink-0" 
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-white truncate group-hover:text-red-400 transition">
                                {prod.title}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs font-bold text-red-400">
                                  {prod.currency === 'USD' ? `USD ${prod.price}` : formatCurrencyPrice(prod.price)}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/5 text-zinc-400">
                                  {prod.is_international ? 'Internacional' : 'Stock Local'}
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition shrink-0" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Suggested Action Chips */}
                {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 max-w-[90%]">
                    {msg.suggestedActions.map((action, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSend(action)}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 transition text-left"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                )}

                <span className="text-[10px] text-zinc-500 mt-1 px-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-zinc-400 text-xs py-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-red-500 animate-bounce [animation-delay:0.2s]" />
                <div className="w-2 h-2 rounded-full bg-red-500 animate-bounce [animation-delay:0.4s]" />
                <span className="ml-1 text-zinc-500">Consultando catálogo y servicios...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <div className="p-3 bg-[#121824] border-t border-white/10">
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Preguntá por figuras, envíos o pedidos..."
                disabled={loading}
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/40"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="p-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 text-white transition focus:outline-none"
                aria-label="Enviar mensaje"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
export default CollectiblesAIAssistant;
