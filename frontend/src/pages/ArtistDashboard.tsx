import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  BarChart3, Brush, Inbox, DollarSign, Calendar, Settings, 
  MessageSquare, Upload, Download, CheckCircle, Clock, 
  AlertCircle, ChevronRight, X, Image as ImageIcon, Send, RefreshCw, Truck
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

export default function ArtistDashboard() {
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';
  const setActiveTab = (tab: string) => setSearchParams({ tab });
  const [selectedCommission, setSelectedCommission] = useState<any | null>(null);

  // Data States
  const [artistData, setArtistData] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Settings Forms
  const [savingSettings, setSavingSettings] = useState(false);

  // Message Form
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    if (user?.id) fetchDashboardData();
  }, [user]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Fetch artist config
      const { data: art, error: artErr } = await supabase.from('artists').select('*').eq('id', user?.id).single();
      if (!artErr && art) {
        setArtistData(art);
      }

      // Fetch services
      const { data: srv } = await supabase.from('artist_services').select('*').eq('artist_id', user?.id);
      setServices(srv || []);

      // Fetch commissions
      const { data: comms } = await supabase.from('commission_requests').select('*').eq('artist_id', user?.id).order('created_at', { ascending: false });
      setCommissions(comms || []);

      // Fetch payouts
      const { data: pays } = await supabase.from('artist_payouts').select('*').eq('artist_id', user?.id).order('requested_at', { ascending: false });
      setPayouts(pays || []);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCommissionDetails = async (commission: any) => {
    setSelectedCommission(commission);
    // Fetch related messages
    const { data: msgs } = await supabase.from('commission_messages').select('*').eq('commission_id', commission.id).order('created_at', { ascending: true });
    setMessages(msgs || []);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedCommission) return;

    try {
      const msg = {
        commission_id: selectedCommission.id,
        sender_role: 'artist',
        message: newMessage,
        created_at: new Date().toISOString()
      };
      // Optimistic update
      setMessages([...messages, { ...msg, id: 'temp-' + Date.now() }]);
      setNewMessage('');

      await supabase.from('commission_messages').insert(msg);
      // Fetch fresh messages
      const { data: msgs } = await supabase.from('commission_messages').select('*').eq('commission_id', selectedCommission.id).order('created_at', { ascending: true });
      setMessages(msgs || []);
    } catch(err) {
      console.error(err);
    }
  };

  const handleUpdateStatus = async (status: string) => {
    if (!selectedCommission) return;
    try {
      await supabase.from('commission_requests').update({ status }).eq('id', selectedCommission.id);
      setSelectedCommission({ ...selectedCommission, status });
      setCommissions(commissions.map(c => c.id === selectedCommission.id ? { ...c, status } : c));
    } catch(err) {
      console.error(err);
    }
  };

  // Demo Fallbacks for visual preview
  const useDemoData = commissions.length === 0;

  const displayCommissions = useDemoData ? [
    { id: '1', client_name: 'David Silva', title: 'Ilustración D&D Party', status: 'new', agreed_price: 150, is_physical: false, due_date: new Date(Date.now() + 864000000).toISOString(), created_at: new Date().toISOString() },
    { id: '2', client_name: 'Maria Gomez', title: 'Retrato (Lienzo Físico)', status: 'in_progress', agreed_price: 80, is_physical: true, shipping_status: 'pending', shipping_address: { street: 'Av. Siempre Viva 123', city: 'Ciudadela' }, due_date: new Date(Date.now() + 172800000).toISOString(), created_at: new Date(Date.now() - 400000000).toISOString() },
    { id: '3', client_name: 'Lucas P.', title: 'Avatar Twitch', status: 'completed', agreed_price: 45, is_physical: false, due_date: new Date(Date.now() - 86400000).toISOString(), created_at: new Date(Date.now() - 1000000000).toISOString() }
  ] : commissions;

  const displayServices = useDemoData && services.length === 0 ? [
    { id: '1', title: 'Ilustración Digital Completa', category: 'digital_art', base_price: 120, estimated_days: 7, revisions_included: 2 },
    { id: '2', title: 'Retrato Estilo Anime (Busto)', category: 'portrait', base_price: 45, estimated_days: 3, revisions_included: 1 }
  ] : services;

  const activeCommissions = displayCommissions.filter(c => !['completed','cancelled','delivered'].includes(c.status));
  const newRequests = displayCommissions.filter(c => c.status === 'new');
  
  const totalEarnings = useDemoData ? 1200 : commissions.filter(c => c.status === 'completed' || c.status === 'delivered').reduce((sum, c) => sum + Number(c.agreed_price), 0);
  const pendingEarnings = useDemoData ? 340 : activeCommissions.reduce((sum, c) => sum + Number(c.agreed_price), 0);
  const availableBalance = useDemoData ? 450 : totalEarnings - payouts.filter(p => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount), 0);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin text-purple-600"><RefreshCw className="w-8 h-8" /></div></div>;
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-transparent text-white">
      {/* MAIN CONTENT AREA */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-10">
        
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && !selectedCommission && (
          <div className="space-y-12 animation-fade-in">
            {/* 1. HERO BANNER */}
            <div className="relative border border-white/10 bg-[#0a0c14] p-12 overflow-hidden group">
               <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#f00856]/5 blur-[120px] -mr-40 -mt-40 transition-transform group-hover:scale-110 duration-700" />
               <div className="relative z-10 flex flex-col lg:flex-row gap-8 justify-between items-start lg:items-center">
                 <div>
                    <div className="text-[10px] text-[#f00856] font-black uppercase tracking-[0.4em] mb-4">Artist Workspace</div>
                    <h1 className="text-4xl lg:text-6xl font-black mb-4 tracking-tight">Bienvenido, {profile?.first_name || artistData?.display_name || 'Artista'}</h1>
                    <p className="text-slate-400 font-bold text-xl max-w-2xl leading-relaxed">
                       Tienes <span className="text-white">{newRequests.length} solicitudes</span> nuevas y <span className="text-white">{activeCommissions.length} trabajos</span> en curso.
                    </p>
                 </div>
                 <div className="glass border border-white/10 p-8 flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black mb-1">Ganancias Netas</p>
                      <p className="text-4xl font-black text-white">${totalEarnings.toFixed(2)}</p>
                    </div>
                    <div className="w-12 h-12 bg-[#f00856]/10 flex items-center justify-center border border-[#f00856]/20 text-[#f00856]">
                       <DollarSign className="w-6 h-6" />
                    </div>
                 </div>
               </div>
            </div>

            {/* 2. STATS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-1">
              {[
                { label: 'Solicitudes', value: newRequests.length, icon: Inbox, color: 'text-blue-400' },
                { label: 'En Progreso', value: activeCommissions.length, icon: Brush, color: 'text-amber-400' },
                { label: 'Completadas', value: displayCommissions.filter(c => ['completed','delivered'].includes(c.status)).length, icon: CheckCircle, color: 'text-emerald-400' },
                { label: 'Próxima Entrega', value: '3 Días', icon: Calendar, color: 'text-[#f00856]' }
              ].map((stat, i) => (
                <div key={i} className="glass border border-white/10 p-8 hover:bg-white/5 transition-colors cursor-pointer" onClick={() => i < 2 && setActiveTab('commissions')}>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</span>
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                  <div className="text-3xl font-black text-white">{stat.value}</div>
                </div>
              ))}
            </div>

            {/* 3. RECENT ACTIVITY */}
            <div className="glass border border-white/10 overflow-hidden">
              <div className="px-10 py-8 border-b border-white/10 flex items-center justify-between">
                 <div>
                    <div className="text-[10px] text-[#f00856] font-black uppercase tracking-widest mb-1">Timeline</div>
                    <h3 className="font-black text-xl text-white">Actividad Reciente</h3>
                 </div>
                 {useDemoData && <span className="text-[10px] border border-amber-500/20 text-amber-500 font-black px-3 py-1 tracking-[0.2em] uppercase bg-amber-500/5">Demo Data</span>}
              </div>
              <div className="divide-y divide-white/5">
                {displayCommissions.slice(0, 5).map(c => (
                  <div key={c.id} className="p-8 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer group" onClick={() => {setActiveTab('commissions'); loadCommissionDetails(c);}}>
                     <div className="space-y-1">
                       <p className="font-black text-white group-hover:text-[#f00856] transition-colors">{c.title}</p>
                       <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Cliente: {c.client_name}</p>
                     </div>
                     <div className="text-right">
                       <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 ${
                         c.status === 'new' ? 'text-blue-500' :
                         c.status === 'in_progress' ? 'text-amber-500' :
                         'text-emerald-500'
                       }`}>
                         {c.status.replace('_', ' ')}
                       </span>
                       <p className="text-[10px] text-slate-600 font-bold mt-2">Hace {Math.floor((Date.now() - new Date(c.created_at).getTime())/(1000 * 60 * 60 * 24))} días</p>
                     </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* COMMISSIONS LIST TAB */}
        {activeTab === 'commissions' && !selectedCommission && (
          <div className="space-y-12 animation-fade-in">
             <div className="flex justify-between items-center">
                <div>
                   <div className="text-[10px] text-[#f00856] font-black uppercase tracking-widest mb-2">Commissions</div>
                   <h2 className="text-4xl font-black text-white">Cola de Trabajo</h2>
                </div>
             </div>
             <div className="grid gap-1">
                {displayCommissions.map(c => (
                  <div key={c.id} onClick={() => loadCommissionDetails(c)} className="glass border border-white/10 p-8 cursor-pointer flex items-center justify-between hover:bg-white/5 transition-all group">
                    <div className="flex gap-8 items-center">
                      <div className={`w-14 h-14 flex items-center justify-center border transition-colors ${
                         c.status === 'new' ? 'border-blue-500/20 text-blue-500 group-hover:bg-blue-500/10' :
                         c.status === 'in_progress' ? 'border-amber-500/20 text-amber-500 group-hover:bg-amber-500/10' :
                         'border-emerald-500/20 text-emerald-500 group-hover:bg-emerald-500/10'
                      }`}>
                         {c.status === 'new' ? <Inbox className="w-6 h-6" /> : c.status === 'in_progress' ? <Brush className="w-6 h-6" /> : <CheckCircle className="w-6 h-6" />}
                      </div>
                      <div>
                        <h3 className="font-black text-xl text-white group-hover:text-[#f00856] transition-colors">{c.title}</h3>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">Por {c.client_name} • <span className="text-white">${Number(c.agreed_price).toFixed(2)}</span></p>
                      </div>
                    </div>
                    <div className="flex items-center gap-10">
                      <div className="hidden sm:block text-right">
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Entrega</p>
                        <p className="text-sm font-black text-white">{c.due_date ? new Date(c.due_date).toLocaleDateString() : 'Pendiente'}</p>
                      </div>
                      <ChevronRight className="w-6 h-6 text-slate-700 group-hover:text-[#f00856] transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}

        {/* COMMISSION DETAIL VIEW */}
        {selectedCommission && (
           <div className="space-y-12 animation-fade-in relative pb-20">
             <button onClick={() => setSelectedCommission(null)} className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest flex items-center gap-2 mb-8 transition-colors">
               <ChevronRight className="w-4 h-4 rotate-180 text-[#f00856]" /> Back to worklist
             </button>
             
             <div className="glass border border-white/10 overflow-hidden">
                <div className="p-10 border-b border-white/5 bg-white/[0.02] flex flex-col sm:flex-row sm:items-center justify-between gap-8">
                  <div>
                    <h2 className="text-3xl font-black text-white mb-2 leading-tight">{selectedCommission.title}</h2>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Client ID: {selectedCommission.client_name} {selectedCommission.client_email && `• ${selectedCommission.client_email}`}</p>
                  </div>
                  <div className="flex items-center">
                    <select 
                      value={selectedCommission.status} 
                      onChange={(e) => handleUpdateStatus(e.target.value)}
                      className="bg-black border border-white/10 text-white text-[10px] font-black uppercase tracking-widest p-4 outline-none focus:border-[#f00856] transition-colors appearance-none cursor-pointer min-w-[200px]"
                    >
                      <option value="new">Nueva Revisión</option>
                      <option value="pending_acceptance">Esperando Aceptación</option>
                      <option value="in_progress">En Producción</option>
                      <option value="sketch_sent">Boceto Enviado</option>
                      <option value="completed">Finalizada</option>
                      <option value="cancelled">Anulada</option>
                    </select>
                  </div>
                </div>

                <div className="p-10 grid grid-cols-1 lg:grid-cols-3 gap-12">
                  {/* Info Column */}
                  <div className="lg:col-span-1 border-r border-white/5 space-y-12 pr-6">
                    <div>
                      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Brief del Proyecto</h4>
                      <div className="text-sm text-slate-400 leading-relaxed bg-white/5 p-6 border border-white/5">
                        {selectedCommission.description || 'No brief details provided.'}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Financials</h4>
                      <div className="bg-[#f00856]/5 border border-[#f00856]/20 p-6 flex justify-between items-center">
                        <span className="text-[10px] font-black text-[#f00856] uppercase tracking-widest">Fixed Budget</span>
                        <span className="text-2xl font-black text-white">${Number(selectedCommission.agreed_price).toFixed(2)}</span>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Asset Delivery</h4>
                      <div className="border border-dashed border-white/10 p-10 text-center hover:bg-white/5 cursor-pointer transition-colors group">
                         <Upload className="w-8 h-8 text-slate-700 mx-auto mb-4 group-hover:text-[#f00856]" />
                         <p className="text-[10px] font-black text-white uppercase tracking-widest">Upload Master File</p>
                         <p className="text-[9px] text-slate-600 mt-2 font-bold uppercase tracking-tighter">High-res assets only</p>
                      </div>
                    </div>
                    
                    {selectedCommission.is_physical && (
                      <div>
                        <h4 className="text-[10px] font-black text-[#f00856] uppercase tracking-widest mb-4 flex items-center gap-2"><Truck className="w-4 h-4"/> Logistic Status</h4>
                        <div className="bg-white/5 p-6 border border-white/10 space-y-6">
                          <div>
                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Shipping Target</p>
                            <p className="text-sm font-black text-white leading-relaxed">{selectedCommission.shipping_address ? `${selectedCommission.shipping_address.street}, ${selectedCommission.shipping_address.city}` : 'To be confirmed'}</p>
                          </div>
                          <div className="space-y-4">
                             <select defaultValue={selectedCommission.shipping_status || 'pending'} className="w-full bg-black border border-white/10 text-[10px] font-black uppercase tracking-widest p-4 outline-none focus:border-[#f00856] text-white">
                               <option value="pending">Awaiting Shipment</option>
                               <option value="shipped">Dispatched / In Transit</option>
                               <option value="delivered">Confirmed Delivered</option>
                             </select>
                             <input type="text" placeholder="Tracking Number" defaultValue={selectedCommission.tracking_number} className="w-full bg-black border border-white/10 text-[10px] font-black uppercase tracking-widest p-4 outline-none focus:border-[#f00856] text-white placeholder-slate-700" />
                             <button className="w-full bg-white text-black text-[10px] font-black uppercase tracking-[0.2em] py-4 hover:bg-[#f00856] hover:text-white transition-all">Update Logistics</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Messaging Column */}
                  <div className="lg:col-span-2 flex flex-col h-[600px]">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Direct Communication</h4>
                    <div className="flex-1 bg-black/40 border border-white/5 overflow-y-auto p-8 space-y-6 no-scrollbar">
                      {messages.length === 0 && !useDemoData && (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4">
                           <MessageSquare className="w-10 h-10 opacity-20" />
                           <p className="text-[10px] font-black uppercase tracking-[0.2em]">No conversation history</p>
                        </div>
                      )}
                      {(useDemoData ? [
                        { id: 'm1', sender_role: 'client', message: 'Hola, quería saber si puedes añadir mi perrito al fondo?', created_at: new Date(Date.now()-8640000).toISOString() },
                        { id: 'm2', sender_role: 'artist', message: 'Claro que sí! Te cobraría un extra de $15. Te parece?', created_at: new Date(Date.now()-3600000).toISOString() }
                      ] : messages).map(msg => (
                        <div key={msg.id} className={`flex ${msg.sender_role === 'artist' ? 'justify-end' : 'justify-start'}`}>
                           <div className={`max-w-[80%] p-5 border ${msg.sender_role === 'artist' ? 'bg-[#f00856] border-[#f00856] text-white' : 'bg-white/5 border-white/10 text-slate-300'}`}>
                             <p className="text-sm font-medium leading-relaxed">{msg.message}</p>
                             <div className={`text-[9px] mt-3 font-black uppercase tracking-widest ${msg.sender_role === 'artist' ? 'text-white/60' : 'text-slate-600'}`}>
                               {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                             </div>
                           </div>
                        </div>
                      ))}
                    </div>
                    <form onSubmit={handleSendMessage} className="mt-6 flex gap-1">
                       <input 
                         type="text" 
                         value={newMessage}
                         onChange={(e) => setNewMessage(e.target.value)}
                         placeholder="Escribe un mensaje al cliente..."
                         className="flex-1 bg-white/5 border border-white/10 p-5 text-sm font-bold text-white outline-none focus:border-[#f00856] transition-colors"
                       />
                       <button type="submit" className="bg-white text-black p-5 hover:bg-[#f00856] hover:text-white transition-colors shrink-0">
                         <Send className="w-5 h-5" />
                       </button>
                    </form>
                  </div>
                </div>
             </div>
           </div>
        )}

        {/* SERVICES TAB */}
        {activeTab === 'services' && !selectedCommission && (
          <div className="space-y-12 animation-fade-in">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                  <div className="text-[10px] text-[#f00856] font-black uppercase tracking-widest mb-2">Service Catalog</div>
                  <h2 className="text-4xl font-black text-white">Paquetes Disponibles</h2>
                </div>
                <button className="bg-white text-black px-10 py-4 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[#f00856] hover:text-white transition-all shadow-xl">
                  + New Service
                </button>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                {displayServices.map(s => (
                  <div key={s.id} className="glass border border-white/10 p-10 group relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-[#f00856]/5 blur-[100px] -mr-40 -mt-40 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    <div className="relative z-10">
                      <div className="flex justify-between items-start mb-6">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest border border-white/10 px-3 py-1">
                          {s.category.replace('_', ' ')}
                        </span>
                        <div className="text-3xl font-black text-white">${Number(s.base_price).toFixed(2)}</div>
                      </div>
                      <h3 className="text-2xl font-black text-white mb-4 leading-tight group-hover:text-[#f00856] transition-colors">{s.title}</h3>
                      <div className="flex items-center gap-6 text-[10px] text-slate-500 font-black uppercase tracking-widest mb-10">
                         <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-[#f00856]"/> {s.estimated_days} Días</span>
                         <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 text-[#f00856]"/> {s.revisions_included} Revisiones</span>
                      </div>
                      <div className="flex gap-1">
                        <button className="flex-1 bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest py-4 hover:bg-white/10 transition-all">Editar</button>
                        <button className="flex-1 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest py-4 hover:bg-red-500/20 transition-all">Archivar</button>
                      </div>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}

        {/* EARNINGS TAB */}
        {activeTab === 'earnings' && !selectedCommission && (
           <div className="space-y-12 animation-fade-in">
             <div className="relative border border-white/10 bg-[#0a0c14] p-12 overflow-hidden">
                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-500/5 blur-[100px] -mr-40 -mt-40" />
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-12">
                   <div>
                      <div className="text-[10px] text-emerald-500 font-black uppercase tracking-widest mb-4">Payout Balance</div>
                      <h2 className="text-6xl lg:text-7xl font-black text-white mb-4">${availableBalance.toFixed(2)}</h2>
                      <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Total histórico acumulado: <span className="text-emerald-500">${totalEarnings.toFixed(2)}</span></p>
                   </div>
                   <button className="w-full md:w-auto bg-emerald-500 text-black px-12 py-5 text-[12px] font-black uppercase tracking-[0.2em] hover:bg-white transition-all shadow-2xl">
                      Solicitar Retiro
                   </button>
                </div>
             </div>

             <div className="glass border border-white/10 p-10">
               <div className="text-[10px] text-amber-500 font-black uppercase tracking-widest mb-8">Pending Transactions</div>
               <div className="space-y-4">
                 {activeCommissions.length === 0 ? (
                   <p className="text-slate-600 font-black text-[10px] uppercase tracking-widest">No hay liquidaciones pendientes</p>
                 ) : activeCommissions.map(c => (
                   <div key={c.id} className="flex justify-between items-center p-8 bg-white/5 border border-white/5 hover:border-white/10 transition-all">
                      <div>
                        <p className="font-black text-white uppercase text-[10px] tracking-widest">{c.title}</p>
                        <p className="text-[9px] text-amber-500 font-black uppercase mt-1 tracking-[0.2em]">{c.status}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-white">${Number(c.agreed_price).toFixed(2)}</p>
                        <p className="text-[9px] text-slate-600 font-black uppercase tracking-tighter mt-1">Held until delivery</p>
                      </div>
                   </div>
                 ))}
               </div>
             </div>
           </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && !selectedCommission && (
          <div className="animate-fade-in max-w-4xl">
             <div className="glass border border-white/10 p-12 mb-1">
                <div className="text-[10px] text-[#f00856] font-black uppercase tracking-widest mb-10">Profile Identity</div>
                <div className="flex flex-col md:flex-row items-center gap-10">
                   <div className="w-32 h-32 border border-white/10 bg-white/5 relative group cursor-pointer shrink-0">
                      {artistData?.avatar_url || profile?.avatar_url ? (
                        <img src={artistData?.avatar_url || profile?.avatar_url} className="w-full h-full object-cover p-1" alt="Profile" />
                      ) : (
                        <ImageIcon className="w-10 h-10 text-slate-700 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                        <Upload className="w-6 h-6 text-[#f00856]" />
                      </div>
                   </div>
                   <div className="text-center md:text-left">
                     <h4 className="text-xl font-black text-white mb-2">Imagen de Marca / Avatar</h4>
                     <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed mb-6">Dimensiones recomendadas: 800x800px. Formato: JPG, PNG o WEBP.</p>
                     <button type="button" className="text-[10px] font-black text-[#f00856] bg-[#f00856]/10 px-6 py-3 border border-[#f00856]/20 hover:bg-[#f00856] hover:text-white transition-all uppercase tracking-widest">
                       Subir nueva imagen
                     </button>
                   </div>
                </div>
             </div>

             <div className="glass border border-white/10 p-12">
               <form className="space-y-10" onSubmit={(e) => { e.preventDefault(); setSavingSettings(true); setTimeout(() => { setSavingSettings(false); alert('Perfil guardado'); }, 1000)}}>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                   <div className="space-y-4">
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nombre Público</label>
                     <input type="text" defaultValue={artistData?.display_name || profile?.first_name} className="w-full bg-black border border-white/10 p-5 text-sm font-bold text-white outline-none focus:border-[#f00856] transition-colors" />
                   </div>
                   <div className="space-y-4">
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Status de Comisiones</label>
                     <select className="w-full bg-black border border-white/10 p-5 text-sm font-bold text-white outline-none focus:border-[#f00856] transition-colors appearance-none">
                       <option value="open" className="bg-[#0a0c14]">Abierto (Aceptando requests)</option>
                       <option value="busy" className="bg-[#0a0c14]">Ocupado (Demoras extra)</option>
                       <option value="waitlist" className="bg-[#0a0c14]">Sólo Lista de Espera</option>
                       <option value="closed" className="bg-[#0a0c14]">Cerrado temporalmente</option>
                     </select>
                   </div>
                 </div>
                 <div className="space-y-4">
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Biografía / Pitch de Venta</label>
                   <textarea rows={4} className="w-full bg-black border border-white/10 p-5 text-sm font-bold text-white outline-none focus:border-[#f00856] transition-colors resize-none" placeholder="Cuéntale a tus clientes por qué deberían elegir tu arte..."></textarea>
                 </div>

                 <div className="space-y-6 pt-10 border-t border-white/5">
                   <div className="text-[10px] text-emerald-500 font-black uppercase tracking-widest">Información de Cobro</div>
                   <div className="space-y-4">
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Destino de Fondos</label>
                     <select className="w-full bg-black border border-white/10 p-5 text-sm font-bold text-white outline-none focus:border-[#f00856] transition-colors appearance-none">
                        <option className="bg-[#0a0c14]">PayPal (Creator Account)</option>
                        <option className="bg-[#0a0c14]">Transferencia Bancaria Local</option>
                        <option className="bg-[#0a0c14]">USDT TRC20 (Binance/Ledger)</option>
                     </select>
                   </div>
                 </div>

                 <button disabled={savingSettings} type="submit" className="w-full py-5 bg-white text-black font-black text-[12px] uppercase tracking-[0.4em] hover:bg-[#f00856] hover:text-white transition-all disabled:opacity-50">
                    {savingSettings ? 'Procesando...' : 'Guardar y Sincronizar'}
                 </button>
               </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
