import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, Send, Bot, User, ArrowRight, 
  HelpCircle, RefreshCw, CheckCircle2, Bookmark
} from 'lucide-react';
import { ImportAIConsultant } from '../../plugins/collector-import-hub';
import type { AIConsultantResponse, ImportCourier, CustomsRule, UserImportDeclaration } from '../../plugins/collector-import-hub';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  responsePayload?: AIConsultantResponse;
  timestamp: Date;
}

interface ImportAIConsultantChatProps {
  couriers?: ImportCourier[];
  customsRule?: CustomsRule;
  userDeclarations?: UserImportDeclaration[];
  onNavigateTab?: (tab: string) => void;
}

const SAMPLE_QUERIES = [
  '¿Cuántas franquicias me quedan?',
  '¿Cuánto llevo gastado este año?',
  '¿Qué courier es más barato para 2.5 kg?',
  'Tengo USD 150 en total. ¿Qué podría comprar incluyendo courier?',
  '¿Qué pasa si ya usé todas mis franquicias?'
];

export const ImportAIConsultantChat: React.FC<ImportAIConsultantChatProps> = ({
  userDeclarations = [],
  onNavigateTab
}) => {
  const currentYear = 2026;
  const currentYearDeclarations = userDeclarations.filter(d => d.year === currentYear);
  const userState = {
    usedShipments: currentYearDeclarations.length,
    usedAmountUsd: currentYearDeclarations.reduce((acc, curr) => acc + curr.product_price_usd, 0),
    preferredCourier: 'puntomio'
  };

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: '¡Hola! Soy tu **Consultor Personal de Importaciones de Collectibles** 🤖🇺🇾.\\n\\nPuedo responderte en tiempo real cuántas franquicias te quedan, calcular fletes exactos con Urubox o PuntoMio, simular compras y asesorarte con las normativas aduaneras 2026.',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = (queryText: string) => {
    const text = queryText.trim();
    if (!text) return;

    const userMsg: Message = {
      id: 'user_' + String(Date.now()),
      sender: 'user',
      text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    setTimeout(() => {
      const response = ImportAIConsultant.processQuery({
        query: text,
        userState
      });

      const assistantMsg: Message = {
        id: 'assistant_' + String(Date.now()),
        sender: 'assistant',
        text: response.answer,
        responsePayload: response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMsg]);
      setLoading(false);
    }, 400);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col h-[650px] overflow-hidden">
      {/* Chat Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Sparkles size={18} />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              Consultor IA Import Hub
              <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Online
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">Interpretación en lenguaje natural + motor determinista de cálculo</p>
          </div>
        </div>

        <button
          onClick={() => setMessages([messages[0]])}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1 p-1.5 hover:bg-slate-800 rounded-lg transition"
          title="Reiniciar chat"
        >
          <RefreshCw size={13} />
          <span className="hidden sm:inline">Limpiar chat</span>
        </button>
      </div>

      {/* Chat Message List */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
        {messages.map((m) => (
          <div
            key={m.id}
            className={'flex items-start gap-3 ' + (m.sender === 'user' ? 'justify-end' : 'justify-start')}
          >
            {m.sender === 'assistant' && (
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                <Bot size={14} />
              </div>
            )}

            <div className="max-w-[85%] space-y-2">
              <div
                className={'p-4 rounded-2xl leading-relaxed whitespace-pre-wrap ' + (
                  m.sender === 'user'
                    ? 'bg-amber-500 text-slate-950 font-medium rounded-tr-none'
                    : 'bg-slate-950 text-slate-200 rounded-tl-none border border-slate-800'
                )}
              >
                {m.text}
              </div>

              {/* Direct Highlights Table if Assistant */}
              {m.responsePayload?.directHighlights && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5 font-mono">
                  {m.responsePayload.directHighlights.map((h, i) => (
                    <div key={i} className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-400">{h.label}:</span>
                      <strong className="text-amber-400">{h.value}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {m.sender === 'user' && (
              <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                <User size={14} />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950 p-3 rounded-2xl w-fit border border-slate-800">
            <Sparkles size={14} className="animate-spin text-amber-400" />
            <span>Consultando motor de importación y tarifas...</span>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Suggested Quick Prompts */}
      <div className="p-3 bg-slate-950/60 border-t border-slate-800 flex gap-2 overflow-x-auto">
        {SAMPLE_QUERIES.map((sq, i) => (
          <button
            key={i}
            onClick={() => handleSend(sq)}
            className="px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-medium shrink-0 border border-slate-700 transition"
          >
            {sq}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <div className="p-3 border-t border-slate-800 bg-slate-900 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
          placeholder="Escribí tu pregunta sobre franquicias, peso, couriers o costos..."
          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
        />
        <button
          onClick={() => handleSend(input)}
          disabled={!input.trim()}
          className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-40 transition font-bold"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
};
