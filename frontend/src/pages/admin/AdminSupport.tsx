import React, { useState, useEffect } from 'react';
import { 
  Headphones, MessageSquare, Clock, 
  Search, RefreshCw,
  Shield, Check, X, Bot, Save, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/admin/Toast';
import { AssistantService, type AssistantSystemConfig } from '../../services/support/assistantService';
import { useAuth } from '../../contexts/AuthContext';

interface TicketItem {
  id: string;
  ticket_number: number;
  user_email: string;
  user_name?: string;
  subject: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
  created_at: string;
  resolution_notes?: string;
}

interface ConversationItem {
  id: string;
  session_id: string;
  user_email?: string;
  user_name?: string;
  country_code: string;
  status: string;
  primary_intent: string;
  message_count: number;
  is_escalated: boolean;
  last_message_at: string;
}

export default function AdminSupport() {
  const { isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'tickets' | 'conversations' | 'config'>('tickets');
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selected Ticket modal
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [resolutionText, setResolutionText] = useState('');
  const [updatingTicket, setUpdatingTicket] = useState(false);

  // Selected Conversation messages modal
  const [selectedConv, setSelectedConv] = useState<ConversationItem | null>(null);
  const [convMessages, setConvMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Assistant Configuration State (Superadmin Governance)
  const [config, setConfig] = useState<AssistantSystemConfig>({
    chatbot_enabled: true,
    openai_enabled: true,
    internal_search_enabled: true,
    web_research_enabled: false,
    order_inquiries_enabled: true,
    ticket_creation_enabled: true,
    human_support_enabled: false, // Default 100% IA
    model_name: 'gpt-4o-mini',
    daily_budget_usd: 5,
    monthly_budget_usd: 100,
    max_turns_per_conversation: 40,
    enabled_countries: ['UY', 'AR', 'CL', 'PE', 'MX']
  });
  const [savingConfig, setSavingConfig] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    loadData();
    loadAssistantConfig();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'tickets') {
        const { data, error } = await supabase
          .from('support_tickets')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (!error && data) {
          setTickets(data);
        }
      } else if (activeTab === 'conversations') {
        const { data, error } = await supabase
          .from('support_conversations')
          .select('*')
          .order('last_message_at', { ascending: false })
          .limit(50);

        if (!error && data) {
          setConversations(data);
        }
      }
    } catch (err: any) {
      console.error('Error loading support data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAssistantConfig = async () => {
    try {
      const cfg = await AssistantService.getSystemConfig();
      setConfig(cfg);
    } catch (_) {}
  };

  const handleSaveConfig = async () => {
    if (!isSuperAdmin) {
      toast.error('Solo los Superadministradores pueden modificar los controles del Asistente.');
      return;
    }
    setSavingConfig(true);
    try {
      const res = await AssistantService.updateSystemConfig(config);
      if (!res.success) throw new Error(res.error);
      toast.success('Configuración de Gobernanza de IA actualizada correctamente.');
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar configuración');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleViewConversation = async (conv: ConversationItem) => {
    setSelectedConv(conv);
    setLoadingMessages(true);
    try {
      const msgs = await AssistantService.loadMessages(conv.id);
      setConvMessages(msgs);
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleUpdateTicketStatus = async (ticketId: string, newStatus: TicketItem['status']) => {
    setUpdatingTicket(true);
    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({ 
          status: newStatus,
          resolution_notes: resolutionText || undefined,
          updated_at: new Date().toISOString()
        })
        .eq('id', ticketId);

      if (error) throw error;
      toast.success(`Ticket #${selectedTicket?.ticket_number} actualizado a ${newStatus}`);
      setSelectedTicket(null);
      setResolutionText('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al actualizar ticket');
    } finally {
      setUpdatingTicket(false);
    }
  };

  const filteredTickets = tickets.filter(t => {
    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchesSearch = !searchQuery || 
      t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.user_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(t.ticket_number).includes(searchQuery);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <Headphones className="w-7 h-7 text-red-500" />
            Centro de Soporte & Asistente AI
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Gobernanza de atención al cliente, auditoría de sesiones y configuración 100% IA.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 bg-[#121824] p-1.5 rounded-xl border border-white/10">
          <button
            onClick={() => setActiveTab('tickets')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'tickets' 
                ? 'bg-red-600 text-white shadow-md' 
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            Tickets ({tickets.length})
          </button>
          <button
            onClick={() => setActiveTab('conversations')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'conversations' 
                ? 'bg-red-600 text-white shadow-md' 
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Bot className="w-4 h-4" />
            Conversaciones AI
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'config' 
                ? 'bg-red-600 text-white shadow-md' 
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Shield className="w-4 h-4" />
            Superadmin AI
          </button>
        </div>
      </div>

      {/* TAB 1: TICKETS */}
      {activeTab === 'tickets' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-80">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por ticket #, email o asunto..."
                  className="w-full pl-9 pr-4 py-2 bg-[#121824] border border-white/10 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500/50"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-[#121824] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              >
                <option value="ALL">Todos los estados</option>
                <option value="OPEN">Abierto</option>
                <option value="IN_PROGRESS">En curso</option>
                <option value="RESOLVED">Resuelto</option>
                <option value="CLOSED">Cerrado</option>
              </select>
            </div>

            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 transition"
              title="Refrescar lista"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="bg-[#121824] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-black/30 border-b border-white/10 text-[11px] uppercase tracking-wider text-zinc-400">
                  <tr>
                    <th className="py-3 px-4"># Ticket</th>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Asunto / Categoría</th>
                    <th className="py-3 px-4">Prioridad</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredTickets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-zinc-500">
                        No hay tickets registrados con estos filtros.
                      </td>
                    </tr>
                  ) : (
                    filteredTickets.map(ticket => (
                      <tr key={ticket.id} className="hover:bg-white/[0.02] transition">
                        <td className="py-3 px-4 font-mono font-bold text-red-400">
                          #{ticket.ticket_number}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-white">{ticket.user_name || 'Invitado'}</p>
                          <p className="text-[11px] text-zinc-400">{ticket.user_email}</p>
                        </td>
                        <td className="py-3 px-4 max-w-xs truncate">
                          <p className="font-medium text-zinc-200 truncate">{ticket.subject}</p>
                          <span className="text-[10px] text-zinc-500 uppercase">{ticket.category}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            ticket.priority === 'URGENT' ? 'bg-red-500/20 text-red-400' :
                            ticket.priority === 'HIGH' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-blue-500/20 text-blue-400'
                          }`}>
                            {ticket.priority}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            ticket.status === 'RESOLVED' ? 'bg-emerald-500/20 text-emerald-400' :
                            ticket.status === 'IN_PROGRESS' ? 'bg-purple-500/20 text-purple-400' :
                            ticket.status === 'OPEN' ? 'bg-red-500/20 text-red-400' :
                            'bg-zinc-700 text-zinc-300'
                          }`}>
                            {ticket.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-zinc-400">
                          {new Date(ticket.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setSelectedTicket(ticket)}
                            className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30 transition text-xs font-semibold"
                          >
                            Gestionar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CONVERSACIONES */}
      {activeTab === 'conversations' && (
        <div className="bg-[#121824] border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Bot className="w-5 h-5 text-red-400" />
                Auditoría de Sesiones del Chatbot
              </h3>
              <p className="text-xs text-zinc-400">
                Registro persistido en base de datos de interacciones del Asistente para monitoreo de calidad.
              </p>
            </div>
            <button
              onClick={loadData}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="divide-y divide-white/5 mt-4">
            {conversations.length === 0 ? (
              <p className="text-sm text-zinc-500 py-6 text-center">No hay conversaciones registradas aún.</p>
            ) : (
              conversations.map(conv => (
                <div key={conv.id} className="py-3.5 flex items-center justify-between hover:bg-white/[0.01] px-2 rounded-xl transition">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-xs">{conv.user_name || conv.user_email || 'Visitante Anónimo'}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-zinc-400 font-mono">{conv.country_code}</span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Intención: <span className="text-red-400 font-mono font-medium">{conv.primary_intent}</span> • {conv.message_count} mensajes
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-zinc-500">{new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <button
                      onClick={() => handleViewConversation(conv)}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold"
                    >
                      Ver chat
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SUPERADMIN AI GOVERNANCE */}
      {activeTab === 'config' && (
        <div className="bg-[#121824] border border-white/10 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-400" />
                Controles de Gobernanza del Asistente (Superadmin)
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Políticas en caliente. Cambios efectivos en producción sin necesidad de redeploy.
              </p>
            </div>
            {isSuperAdmin && (
              <button
                onClick={handleSaveConfig}
                disabled={savingConfig}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg transition"
              >
                <Save className="w-4 h-4" />
                {savingConfig ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Control: Chatbot Enabled */}
            <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white">Chatbot Storefront Visible</p>
                <p className="text-xs text-zinc-400">Muestra u oculta el widget flotante en la tienda.</p>
              </div>
              <input
                type="checkbox"
                checked={config.chatbot_enabled}
                onChange={(e) => setConfig({ ...config, chatbot_enabled: e.target.checked })}
                className="w-5 h-5 accent-red-600 cursor-pointer"
              />
            </div>

            {/* Control: OpenAI Enabled */}
            <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white">Motor OpenAI Activo</p>
                <p className="text-xs text-zinc-400">Si se apaga, el chatbot utiliza motor determinista y catálogo real.</p>
              </div>
              <input
                type="checkbox"
                checked={config.openai_enabled}
                onChange={(e) => setConfig({ ...config, openai_enabled: e.target.checked })}
                className="w-5 h-5 accent-red-600 cursor-pointer"
              />
            </div>

            {/* Control: Búsqueda Web OpenAI */}
            <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white">Investigación Externa OpenAI (Web Search)</p>
                <p className="text-xs text-zinc-400">Búsqueda web oficial para novedades. Deshabilitada por defecto.</p>
              </div>
              <input
                type="checkbox"
                checked={config.web_research_enabled}
                onChange={(e) => setConfig({ ...config, web_research_enabled: e.target.checked })}
                className="w-5 h-5 accent-red-600 cursor-pointer"
              />
            </div>

            {/* Control: Atención Humana (DEFAULT: FALSE) */}
            <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-white">Atención Humana en Vivo</p>
                  <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    POLÍTICA 100% IA
                  </span>
                </div>
                <p className="text-xs text-zinc-400">Si está OFF, el botón de operador permanece oculto para el público.</p>
              </div>
              <input
                type="checkbox"
                checked={config.human_support_enabled}
                onChange={(e) => setConfig({ ...config, human_support_enabled: e.target.checked })}
                className="w-5 h-5 accent-red-600 cursor-pointer"
              />
            </div>

            {/* Control: Consulta de Pedidos */}
            <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white">Consultas de Pedidos y Tracking</p>
                <p className="text-xs text-zinc-400">Permite a usuarios autenticados consultar el estado de sus órdenes.</p>
              </div>
              <input
                type="checkbox"
                checked={config.order_inquiries_enabled}
                onChange={(e) => setConfig({ ...config, order_inquiries_enabled: e.target.checked })}
                className="w-5 h-5 accent-red-600 cursor-pointer"
              />
            </div>

            {/* Modelo OpenAI */}
            <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-1">
              <label className="text-sm font-bold text-white block">Modelo de Inteligencia Artificial</label>
              <select
                value={config.model_name}
                onChange={(e) => setConfig({ ...config, model_name: e.target.value })}
                className="w-full bg-[#121824] border border-white/10 rounded-lg p-2 text-xs text-white"
              >
                <option value="gpt-4o-mini">gpt-4o-mini (Recomendado — Ultrarrápido y Económico)</option>
                <option value="gpt-5.6-terra">gpt-5.6-terra (Alta precisión y contexto)</option>
                <option value="gpt-4o">gpt-4o (Omni multimodal)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ver Conversación */}
      {selectedConv && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#121824] border border-white/10 rounded-2xl p-6 max-w-xl w-full max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-sm font-bold text-white">
                Conversación: {selectedConv.user_name || selectedConv.user_email || 'Visitante'} ({selectedConv.country_code})
              </h3>
              <button onClick={() => setSelectedConv(null)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {loadingMessages ? (
                <p className="text-xs text-zinc-500 text-center py-6">Cargando historial...</p>
              ) : convMessages.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-6">No hay mensajes guardados en esta sesión.</p>
              ) : (
                convMessages.map((m, idx) => (
                  <div key={idx} className={`flex flex-col ${m.sender === 'USER' ? 'items-end' : 'items-start'}`}>
                    <div className={`p-3 rounded-xl text-xs max-w-[85%] ${
                      m.sender === 'USER' ? 'bg-red-600 text-white' : 'bg-black/50 text-zinc-200 border border-white/10'
                    }`}>
                      <p>{m.text}</p>
                    </div>
                    <span className="text-[10px] text-zinc-500 mt-0.5">{new Date(m.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Gestionar Ticket */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#121824] border border-white/10 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                Ticket #{selectedTicket.ticket_number} — {selectedTicket.subject}
              </h3>
              <button onClick={() => setSelectedTicket(null)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-zinc-300 space-y-2 bg-black/30 p-3 rounded-xl border border-white/5">
              <p><strong>Cliente:</strong> {selectedTicket.user_name || 'Invitado'} ({selectedTicket.user_email})</p>
              <p><strong>Categoría:</strong> {selectedTicket.category}</p>
              <p><strong>Prioridad:</strong> {selectedTicket.priority}</p>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1">Notas de resolución:</label>
              <textarea
                value={resolutionText}
                onChange={(e) => setResolutionText(e.target.value)}
                placeholder="Explicación de la resolución para el registro interno..."
                rows={3}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => handleUpdateTicketStatus(selectedTicket.id, 'IN_PROGRESS')}
                disabled={updatingTicket}
                className="px-3 py-2 rounded-xl bg-purple-600/20 text-purple-300 hover:bg-purple-600 hover:text-white text-xs font-bold transition"
              >
                En Curso
              </button>
              <button
                onClick={() => handleUpdateTicketStatus(selectedTicket.id, 'RESOLVED')}
                disabled={updatingTicket}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition"
              >
                Resolver
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
