import React, { useState, useEffect } from 'react';
import { 
  Headphones, MessageSquare, CheckCircle, Clock, 
  AlertCircle, Search, User, Filter, RefreshCw, Send,
  Shield, Check, X, ArrowRight, Bot, ToggleLeft, ToggleRight
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/admin/Toast';

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
  const [activeTab, setActiveTab] = useState<'tickets' | 'conversations' | 'config'>('tickets');
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selected Ticket modal / detail
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [resolutionText, setResolutionText] = useState('');
  const [updatingTicket, setUpdatingTicket] = useState(false);

  // AI Configuration State
  const [aiEnabled, setAiEnabled] = useState(true);
  const [webResearchEnabled, setWebResearchEnabled] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    loadData();
    loadAiConfig();
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

  const loadAiConfig = async () => {
    try {
      const { data } = await supabase
        .from('ai_system_config')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (data) {
        setAiEnabled(data.global_enabled ?? true);
      }
    } catch (_) {}
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
            Gestión de tickets, conversaciones en vivo del chatbot y políticas de atención al coleccionista.
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
            Configuración AI
          </button>
        </div>
      </div>

      {/* TAB 1: TICKETS */}
      {activeTab === 'tickets' && (
        <div className="space-y-4">
          {/* Filters Bar */}
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

          {/* Table */}
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
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-red-400" />
            Historial de Sesiones del Chatbot
          </h3>
          <p className="text-xs text-zinc-400">
            Registro de interacciones anónimas y de usuarios registrados para auditoría de intenciones.
          </p>

          <div className="divide-y divide-white/5 mt-4">
            {conversations.length === 0 ? (
              <p className="text-sm text-zinc-500 py-6 text-center">No hay conversaciones registradas en este período.</p>
            ) : (
              conversations.map(conv => (
                <div key={conv.id} className="py-3.5 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-xs">{conv.user_name || conv.user_email || 'Visitante Anónimo'}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-zinc-400">{conv.country_code}</span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Intención: <span className="text-red-400 font-mono font-medium">{conv.primary_intent}</span> • {conv.message_count} mensajes
                    </p>
                  </div>
                  <span className="text-[11px] text-zinc-500">{new Date(conv.last_message_at).toLocaleDateString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CONFIGURACIÓN AI */}
      {activeTab === 'config' && (
        <div className="bg-[#121824] border border-white/10 rounded-2xl p-6 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-400" />
              Gobernanza y Switches del Asistente AI
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Controles en caliente para regular los proveedores y motores sin afectar el catálogo.
            </p>
          </div>

          <div className="space-y-4 max-w-xl">
            <div className="flex items-center justify-between p-4 rounded-xl bg-black/40 border border-white/5">
              <div>
                <p className="text-sm font-bold text-white">Chatbot AI Público</p>
                <p className="text-xs text-zinc-400">Habilita o deshabilita el widget conversacional en el storefront.</p>
              </div>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">ACTIVO</span>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-black/40 border border-white/5">
              <div>
                <p className="text-sm font-bold text-white">Investigación Externa OpenAI</p>
                <p className="text-xs text-zinc-400">Permite búsquedas web oficiales para novedades de coleccionables.</p>
              </div>
              <span className="text-xs font-bold text-zinc-400 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">DESHABILITADO POR DEFECTO</span>
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
