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
    <div className="flex flex-col md:flex-row min-h-screen bg-transparent">
      {/* MAIN CONTENT AREA */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-10">
        
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && !selectedCommission && (
          <div className="space-y-8 animation-fade-in">
            <div className="bg-gradient-to-r from-purple-900 to-indigo-900 rounded-3xl p-8 lg:p-10 text-white shadow-xl relative overflow-hidden">
               <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 border-4 border-white/10 rounded-full blur-3xl"></div>
               <div className="relative z-10 flex flex-col md:flex-row gap-6 justify-between items-start">
                 <div>
                   <h1 className="text-3xl lg:text-4xl font-black mb-2 tracking-tight">Bienvenido, {profile?.first_name || artistData?.display_name || 'Artista'} 🎨</h1>
                   <p className="text-purple-100 font-medium text-lg">Tienes {newRequests.length} solicitudes nuevas y {activeCommissions.length} trabajos en progreso.</p>
                 </div>
                 <div className="bg-white/10 border border-white/20 px-5 py-3 rounded-xl backdrop-blur flex items-center gap-4">
                   <div className="text-right">
                     <p className="text-[10px] uppercase tracking-widest text-purple-200 font-black">Ganancias Netas</p>
                     <p className="text-2xl font-black">${totalEarnings.toFixed(2)}</p>
                   </div>
                 </div>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col hover:border-blue-200 transition-colors cursor-pointer" onClick={() => setActiveTab('commissions')}>
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-blue-50 p-2.5 rounded-xl text-blue-600"><Inbox className="w-5 h-5" /></div>
                  <span className="text-2xl font-black text-gray-900">{newRequests.length}</span>
                </div>
                <h4 className="font-bold text-gray-500 text-sm uppercase tracking-wide">Nuevas Solicitudes</h4>
              </div>
              
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col hover:border-orange-200 transition-colors cursor-pointer" onClick={() => setActiveTab('commissions')}>
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-orange-50 p-2.5 rounded-xl text-orange-600"><Brush className="w-5 h-5" /></div>
                  <span className="text-2xl font-black text-gray-900">{activeCommissions.length}</span>
                </div>
                <h4 className="font-bold text-gray-500 text-sm uppercase tracking-wide">En Progreso</h4>
              </div>

              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-emerald-50 p-2.5 rounded-xl text-emerald-600"><CheckCircle className="w-5 h-5" /></div>
                  <span className="text-2xl font-black text-gray-900">{displayCommissions.filter(c => c.status === 'completed' || c.status === 'delivered').length}</span>
                </div>
                <h4 className="font-bold text-gray-500 text-sm uppercase tracking-wide">Completadas</h4>
              </div>

              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                   <div className="bg-purple-50 p-2.5 rounded-xl text-purple-600"><Calendar className="w-5 h-5" /></div>
                   {/* Mock next deadline */ }
                   <span className="text-sm font-black text-gray-900">En 3 días</span>
                </div>
                <h4 className="font-bold text-gray-500 text-sm uppercase tracking-wide">Próxima Entrega</h4>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-black text-gray-900 text-lg">Actividad Reciente</h3>
                {useDemoData && <span className="text-[10px] bg-yellow-100 text-yellow-800 font-bold px-3 py-1.5 rounded-full tracking-widest uppercase">DATOS DEMO</span>}
              </div>
              <div className="divide-y divide-gray-50">
                {displayCommissions.slice(0, 5).map(c => (
                  <div key={c.id} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => {setActiveTab('commissions'); loadCommissionDetails(c);}}>
                     <div className="space-y-1">
                       <p className="font-bold text-gray-900">{c.title}</p>
                       <p className="text-sm text-gray-500">Cliente: {c.client_name}</p>
                     </div>
                     <div className="text-right">
                       <span className={`px-3 py-1 text-xs font-bold uppercase tracking-wide rounded-full ${
                         c.status === 'new' ? 'bg-blue-100 text-blue-700' :
                         c.status === 'in_progress' ? 'bg-orange-100 text-orange-700' :
                         'bg-green-100 text-green-700'
                       }`}>
                         {c.status.replace('_', ' ')}
                       </span>
                       <p className="text-xs text-gray-400 font-bold mt-2">Hace {Math.floor((Date.now() - new Date(c.created_at).getTime())/(1000 * 60 * 60 * 24))} días</p>
                     </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* COMMISSIONS LIST TAB */}
        {activeTab === 'commissions' && !selectedCommission && (
          <div className="space-y-6 animation-fade-in">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-gray-900">Todas tus Comisiones</h2>
             </div>
             <div className="grid gap-4">
                {displayCommissions.map(c => (
                  <div key={c.id} onClick={() => loadCommissionDetails(c)} className="bg-white hover:border-purple-300 border border-gray-200 rounded-2xl p-6 cursor-pointer flex items-center justify-between shadow-sm transition-all group">
                    <div className="flex gap-6 items-center">
                      <div className={`p-4 rounded-2xl ${
                         c.status === 'new' ? 'bg-blue-100 text-blue-600' :
                         c.status === 'in_progress' ? 'bg-orange-100 text-orange-600' :
                         'bg-green-100 text-green-600'
                      }`}>
                         {c.status === 'new' ? <Inbox className="w-6 h-6" /> : c.status === 'in_progress' ? <Brush className="w-6 h-6" /> : <CheckCircle className="w-6 h-6" />}
                      </div>
                      <div>
                        <h3 className="font-black text-lg text-gray-900 group-hover:text-purple-700 transition-colors">{c.title}</h3>
                        <p className="text-sm text-gray-500 font-medium">Por {c.client_name} • ${Number(c.agreed_price).toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="hidden sm:block text-right">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Fecha de Entrega</p>
                        <p className="font-bold text-gray-800">{c.due_date ? new Date(c.due_date).toLocaleDateString() : 'Por definir'}</p>
                      </div>
                      <ChevronRight className="w-6 h-6 text-gray-300 group-hover:text-purple-500" />
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}

        {/* COMMISSION DETAIL VIEW */}
        {selectedCommission && (
           <div className="space-y-6 animation-fade-in relative pb-20">
             <button onClick={() => setSelectedCommission(null)} className="text-sm font-bold text-gray-500 hover:text-purple-600 flex items-center gap-1 mb-4">
               <ChevronRight className="w-4 h-4 rotate-180" /> Volver a la lista
             </button>
             
             <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-8 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-gray-900 mb-1">{selectedCommission.title}</h2>
                    <p className="text-gray-500 font-medium">Cliente: {selectedCommission.client_name} {selectedCommission.client_email && `(${selectedCommission.client_email})`}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <select 
                      value={selectedCommission.status} 
                      onChange={(e) => handleUpdateStatus(e.target.value)}
                      className="bg-white border-2 border-gray-200 text-gray-900 text-sm font-bold uppercase tracking-widest rounded-xl focus:ring-4 focus:ring-purple-500/20 focus:border-purple-500 p-3 outline-none"
                    >
                      <option value="new">NUEVA REVISIÓN</option>
                      <option value="pending_acceptance">PENDIENTE</option>
                      <option value="in_progress">EN PROGRESO</option>
                      <option value="sketch_sent">BOCETO ENVIADO</option>
                      <option value="completed">COMPLETADA</option>
                      <option value="cancelled">CANCELADA</option>
                    </select>
                  </div>
                </div>

                <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-10">
                  {/* Info Column */}
                  <div className="lg:col-span-1 border-r border-gray-100 space-y-8 pr-4">
                    <div>
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Detalles y Referencias</h4>
                      <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-100">
                        {selectedCommission.description || 'Sin descripción provista.'}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Financiero</h4>
                      <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl border border-emerald-100 flex justify-between items-center">
                        <span className="font-bold">Precio Acordado</span>
                        <span className="text-xl font-black">${Number(selectedCommission.agreed_price).toFixed(2)}</span>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Entregas y Archivos</h4>
                      <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center hover:bg-gray-50 cursor-pointer transition-colors">
                         <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                         <p className="text-sm font-bold text-purple-600">Subir Boceto o Final</p>
                         <p className="text-xs text-gray-400 mt-1">JPG, PNG, ZIP hasta 50MB</p>
                      </div>
                    </div>
                    
                    {selectedCommission.is_physical && (
                      <div>
                        <h4 className="text-xs font-black text-purple-600 uppercase tracking-widest mb-3 flex items-center gap-2"><Truck className="w-4 h-4"/> Logística de Envío Físico</h4>
                        <div className="bg-purple-50 p-5 rounded-xl border border-purple-100">
                          <div className="mb-4">
                            <p className="text-xs font-bold text-purple-900/50 uppercase">Dirección del Cliente</p>
                            <p className="text-sm font-bold text-purple-900 mt-1">{selectedCommission.shipping_address ? `${selectedCommission.shipping_address.street}, ${selectedCommission.shipping_address.city}` : 'No provista todavía'}</p>
                          </div>
                          <div className="space-y-3">
                             <select defaultValue={selectedCommission.shipping_status || 'pending'} className="w-full bg-white border border-purple-200 text-sm font-bold rounded-lg p-3 outline-none focus:border-purple-500 text-purple-900">
                               <option value="pending">Preparando Envío (Pausado)</option>
                               <option value="shipped">Despachado / En tránsito</option>
                               <option value="delivered">Entregado Exitosamente</option>
                             </select>
                             <input type="text" placeholder="Número de Seguimiento (Tracking)" defaultValue={selectedCommission.tracking_number} className="w-full bg-white border border-purple-200 text-sm font-medium rounded-lg p-3 outline-none focus:border-purple-500 placeholder-purple-300" />
                             <button className="w-full bg-purple-600 text-white font-bold py-2.5 rounded-lg hover:bg-purple-700 transition">Actualizar Envío</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Messaging Column */}
                  <div className="lg:col-span-2 flex flex-col h-[500px]">
                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Historial de Comunicación</h4>
                    <div className="flex-1 bg-gray-50 rounded-2xl border border-gray-200 overflow-y-auto p-6 space-y-4">
                      {messages.length === 0 && !useDemoData && (
                        <div className="text-center text-gray-400 font-medium py-10">No hay mensajes. Saluda al cliente.</div>
                      )}
                      {(useDemoData ? [
                        { id: 'm1', sender_role: 'client', message: 'Hola, quería saber si puedes añadir mi perrito al fondo?', created_at: new Date(Date.now()-8640000).toISOString() },
                        { id: 'm2', sender_role: 'artist', message: 'Claro que sí! Te cobraría un extra de $15. Te parece?', created_at: new Date(Date.now()-3600000).toISOString() }
                      ] : messages).map(msg => (
                        <div key={msg.id} className={`flex ${msg.sender_role === 'artist' ? 'justify-end' : 'justify-start'}`}>
                           <div className={`max-w-[70%] rounded-2xl p-4 ${msg.sender_role === 'artist' ? 'bg-purple-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'}`}>
                             <p className="text-sm font-medium">{msg.message}</p>
                             <div className={`text-[10px] mt-2 font-bold ${msg.sender_role === 'artist' ? 'text-purple-200' : 'text-gray-400'}`}>
                               {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                             </div>
                           </div>
                        </div>
                      ))}
                    </div>
                    <form onSubmit={handleSendMessage} className="mt-4 flex gap-2">
                       <input 
                         type="text" 
                         value={newMessage}
                         onChange={(e) => setNewMessage(e.target.value)}
                         placeholder="Escribe un mensaje al cliente..."
                         className="flex-1 border-2 border-gray-200 bg-white rounded-xl p-4 text-sm font-medium outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/20"
                       />
                       <button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-xl transition-colors shrink-0">
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
          <div className="space-y-6 animation-fade-in">
             <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-black text-gray-900">Tus Paquetes y Servicios</h2>
                  <p className="text-gray-500 font-medium mt-1">Lo que los clientes ven en tu perfil público para contratarte.</p>
                </div>
                <button className="bg-dark-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-dark-800 transition-colors shadow-lg">
                  + Crear Nuevo Servicio
                </button>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {displayServices.map(s => (
                  <div key={s.id} className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50 rounded-full blur-[50px] -mt-10 -mr-10 transition-colors group-hover:bg-purple-50"></div>
                    <div className="relative z-10">
                      <div className="flex justify-between items-start mb-4">
                        <span className="bg-gray-100 text-gray-600 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                          {s.category.replace('_', ' ')}
                        </span>
                        <div className="text-2xl font-black text-purple-600">${Number(s.base_price).toFixed(2)}</div>
                      </div>
                      <h3 className="text-xl font-black text-gray-900 mb-2">{s.title}</h3>
                      <div className="flex items-center gap-4 text-sm text-gray-500 font-medium mb-6">
                         <span className="flex items-center gap-1.5"><Clock className="w-4 h-4"/> ~{s.estimated_days} días</span>
                         <span className="flex items-center gap-1.5"><RefreshCw className="w-4 h-4"/> {s.revisions_included} revisiones</span>
                      </div>
                      <div className="flex gap-2">
                        <button className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm">Editar</button>
                        <button className="flex-1 bg-red-50 text-red-600 font-bold py-2.5 rounded-xl hover:bg-red-100 transition-colors text-sm">Ocultar</button>
                      </div>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}

        {/* EARNINGS TAB */}
        {activeTab === 'earnings' && !selectedCommission && (
           <div className="space-y-6 animation-fade-in">
             <div className="bg-gradient-to-r from-emerald-900 to-teal-900 rounded-3xl p-8 lg:p-10 text-white shadow-xl flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                  <p className="text-emerald-200 font-bold tracking-widest uppercase text-xs mb-2">Fondo Retirable Disponible</p>
                  <h2 className="text-5xl font-black">${availableBalance.toFixed(2)}</h2>
                  <p className="text-emerald-100/70 text-sm mt-3 font-medium">De un total histórico de ${totalEarnings.toFixed(2)}</p>
                </div>
                <button className="bg-white text-emerald-900 px-8 py-4 rounded-xl font-black text-lg hover:bg-emerald-50 transition-colors shadow-xl w-full md:w-auto">
                   Solicitar Retiro
                </button>
             </div>

             <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-8">
               <h3 className="font-black text-gray-900 text-lg mb-6">Próximos Cobros Pendientes (En Progreso)</h3>
               <div className="space-y-4">
                 {activeCommissions.length === 0 ? <p className="text-gray-400">No hay comisiones en proceso pendientes de cobro.</p> : activeCommissions.map(c => (
                   <div key={c.id} className="flex justify-between items-center bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <div>
                        <p className="font-bold text-gray-900">{c.title}</p>
                        <p className="text-xs text-orange-600 font-bold uppercase mt-1 tracking-wider">{c.status}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-gray-900">${Number(c.agreed_price).toFixed(2)}</p>
                        <p className="text-xs text-gray-400 font-medium">Se liberan al entregar</p>
                      </div>
                   </div>
                 ))}
               </div>
             </div>
           </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && !selectedCommission && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-8 max-w-3xl animation-fade-in">
             <h3 className="text-2xl font-black text-gray-900 mb-8 flex items-center gap-3">
               <Settings className="text-purple-600" /> Configuración del Perfil Profesional
             </h3>

             <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); setSavingSettings(true); setTimeout(() => { setSavingSettings(false); alert('Perfil guardado'); }, 1000)}}>
               <div className="flex flex-col sm:flex-row items-center gap-6 mb-8 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                  <div className="w-24 h-24 rounded-full bg-gray-200 border-4 border-white shadow-lg overflow-hidden flex items-center justify-center relative group cursor-pointer shrink-0">
                     {artistData?.avatar_url || profile?.avatar_url ? (
                       <img src={artistData?.avatar_url || profile?.avatar_url} className="w-full h-full object-cover" alt="Profile" />
                     ) : (
                       <ImageIcon className="w-8 h-8 text-gray-400" />
                     )}
                     <div className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center transition-all">
                       <Upload className="w-6 h-6 text-white" />
                     </div>
                  </div>
                  <div className="text-center sm:text-left">
                    <h4 className="font-black text-gray-900 text-lg">Foto de Perfil del Estudio</h4>
                    <p className="text-sm text-gray-500 mb-3">Recomendado: JPG o PNG cuadrados de hasta 5MB.</p>
                    <button type="button" className="text-sm font-black text-purple-700 bg-purple-100 px-5 py-2.5 rounded-xl hover:bg-purple-200 transition-colors">
                      Subir nueva foto
                    </button>
                  </div>
               </div>

               <div className="space-y-4">
                 <h4 className="font-black text-gray-400 uppercase tracking-widest text-xs">Información Pública</h4>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div>
                     <label className="block text-sm font-bold text-gray-700 mb-2">Tu Nombre Público de Artista</label>
                     <input type="text" defaultValue={artistData?.display_name || profile?.first_name} className="w-full bg-gray-50 border-2 border-gray-100 text-gray-900 font-medium rounded-xl p-4 outline-none focus:border-purple-500" />
                   </div>
                   <div>
                     <label className="block text-sm font-bold text-gray-700 mb-2">Estado de Comisiones</label>
                     <select className="w-full bg-gray-50 border-2 border-gray-100 text-gray-900 font-medium rounded-xl p-4 outline-none focus:border-purple-500">
                       <option value="open">Abierto (Aceptando requests)</option>
                       <option value="busy">Ocupado (Demoras extra)</option>
                       <option value="waitlist">Sólo Lista de Espera</option>
                       <option value="closed">Cerrado (Vacaciones/Full)</option>
                     </select>
                   </div>
                 </div>
                 <div>
                   <label className="block text-sm font-bold text-gray-700 mb-2">Breve Biografía / Pitch</label>
                   <textarea rows={3} className="w-full bg-gray-50 border-2 border-gray-100 text-gray-900 font-medium rounded-xl p-4 outline-none focus:border-purple-500 resize-none"></textarea>
                 </div>
               </div>

               <div className="space-y-4 pt-6 border-t border-gray-100">
                 <h4 className="font-black text-gray-400 uppercase tracking-widest text-xs">Facturación y Retiros</h4>
                 <div>
                   <label className="block text-sm font-bold text-gray-700 mb-2">Método de Traspaso</label>
                   <select className="w-full bg-gray-50 border-2 border-gray-100 text-gray-900 font-medium rounded-xl p-4 outline-none focus:border-purple-500">
                       <option>Cuenta Creador PayPal</option>
                       <option>Transferencia SWIFT / Local</option>
                       <option>USDT Tron (TRC20)</option>
                     </select>
                 </div>
               </div>

               <div className="pt-6 flex justify-end">
                 <button disabled={savingSettings} type="submit" className="bg-purple-600 text-white font-black py-4 px-10 rounded-xl hover:bg-purple-500 transition-colors shadow-lg shadow-purple-900/20 disabled:opacity-50">
                    {savingSettings ? 'Guardando...' : 'Guardar y Publicar Perfil'}
                 </button>
               </div>
             </form>
          </div>
        )}

      </main>
    </div>
  );
}
