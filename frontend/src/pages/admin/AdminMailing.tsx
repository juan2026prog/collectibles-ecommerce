import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Mail, Plus, Send, Trash2, Save, X, Users, Clock, CheckCircle2, Download, AlertCircle, History } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function AdminMailing() {
  const [activeTab, setActiveTab] = useState<'campaigns' | 'logs'>('campaigns');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [customerCount, setCustomerCount] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => { 
    fetchCustomerCount(); 
    if (activeTab === 'campaigns') fetchCampaigns();
    if (activeTab === 'logs') fetchEmailLogs();
  }, [activeTab]);

  async function fetchCampaigns() {
    setLoading(true);
    const { data } = await supabase.from('mailing_campaigns').select('*').order('created_at', { ascending: false });
    setCampaigns(data || []);
    setLoading(false);
  }

  async function fetchEmailLogs() {
    setLoading(true);
    const { data } = await supabase.from('email_logs').select('*').order('created_at', { ascending: false }).limit(100);
    setEmailLogs(data || []);
    setLoading(false);
  }

  async function fetchCustomerCount() {
    const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).not('email', 'is', null);
    setCustomerCount(count || 0);
  }

  function startNew() {
    setEditing({
      name: '', subject: '', body_html: '', segment: 'all',
      status: 'draft', scheduled_at: null,
    });
  }

  async function saveCampaign() {
    if (!editing || !editing.name || !editing.subject) return;
    if (editing.id) {
      await supabase.from('mailing_campaigns').update(editing).eq('id', editing.id);
    } else {
      await supabase.from('mailing_campaigns').insert(editing);
    }
    setSaved(true); setTimeout(() => setSaved(false), 2000);
    setEditing(null); fetchCampaigns();
  }

  async function deleteCampaign(id: string) {
    if (!confirm('¿Eliminar esta campaña?')) return;
    await supabase.from('mailing_campaigns').delete().eq('id', id);
    fetchCampaigns();
  }

  async function sendCampaign(campaign: any) {
    if (!confirm(`¿Estás seguro de enviar la campaña "${campaign.name}" a ${customerCount} destinatarios activos en este instante?`)) return;
    
    // Mark as sent in DB
    await supabase.from('mailing_campaigns').update({ 
      status: 'sent', 
      sent_at: new Date().toISOString(),
      recipients_count: customerCount 
    }).eq('id', campaign.id);
    
    // Log the action to the generic email logs for audit
    await supabase.from('email_logs').insert({
      recipient_email: 'Mailing Masivo (Auditoría)',
      subject: campaign.subject,
      email_type: 'newsletter',
      status: 'sent',
      metadata: { campaign_id: campaign.id, count: customerCount }
    });
    
    // Call Edge Function to process Queue
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transactional-emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ type: 'campaign', campaign_id: campaign.id }),
      });
    } catch (err) { console.error('Error invocando el worker de envío masivo:', err); }
    
    fetchCampaigns();
  }

  async function exportSubscribers() {
    const { data } = await supabase.from('profiles').select('email, first_name, last_name, created_at, is_vendor, is_artist, is_affiliate').not('email', 'is', null);
    if (!data || data.length === 0) return alert('No hay suscriptores para exportar.');
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Suscriptores');
    XLSX.writeFile(wb, `Suscriptores_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  const statusConfig: Record<string, { label: string; cls: string; icon: any }> = {
    draft: { label: 'Borrador', cls: 'bg-gray-100 text-gray-600 border-gray-200', icon: Clock },
    scheduled: { label: 'Programada', cls: 'bg-blue-100 text-blue-700 border-blue-200', icon: Clock },
    sent: { label: 'Enviada', cls: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle2 },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Mail className="w-6 h-6 text-primary-600" /> Comunicación y Marketing
          </h2>
          <p className="text-sm text-gray-500 mt-1">Automatizaciones, Newsletters e Historial Transaccional</p>
        </div>
        <div className="flex gap-2">
          {saved && <span className="text-sm font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 flex items-center gap-1"><Save className="w-4 h-4" /> Guardado</span>}
          <button onClick={exportSubscribers} className="btn-secondary flex items-center gap-2"><Download className="w-4 h-4" /> Exportar Suscriptores</button>
          {activeTab === 'campaigns' && <button onClick={startNew} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Nueva Campaña</button>}
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-4 border-b border-gray-200">
        <button 
          onClick={() => setActiveTab('campaigns')}
          className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'campaigns' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
        >
          Campañas de Mailing
        </button>
        <button 
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'logs' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
        >
          Historial Transaccional <span className="hidden sm:inline">(Avisos y Logs)</span>
        </button>
      </div>

      {activeTab === 'campaigns' && (
        <>
          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg"><Users className="w-5 h-5 text-blue-600" /></div>
                <div>
                  <p className="text-2xl font-black text-gray-900">{customerCount}</p>
                  <p className="text-xs text-gray-500">Suscriptores / Clientes Disponibles</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-50 rounded-lg"><Send className="w-5 h-5 text-green-600" /></div>
                <div>
                  <p className="text-2xl font-black text-gray-900">{campaigns.filter(c => c.status === 'sent').length}</p>
                  <p className="text-xs text-gray-500">Campañas Enviadas Exitosamente</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-50 rounded-lg"><Clock className="w-5 h-5 text-yellow-600" /></div>
                <div>
                  <p className="text-2xl font-black text-gray-900">{campaigns.filter(c => c.status === 'draft').length}</p>
                  <p className="text-xs text-gray-500">Borradores Pendientes</p>
                </div>
              </div>
            </div>
          </div>

          {/* Editor */}
          {editing && (
            <div className="bg-white rounded-xl border-2 border-primary-200 shadow-lg p-6 space-y-5">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-lg">{editing.id ? 'Modificar' : 'Orquestar Nueva'} Campaña de Publicidad</h3>
                <button onClick={() => setEditing(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5 text-gray-400" /></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Nombre Organizativo (Interno)</label>
                  <input className="form-input w-full" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Ej. Hot Sale 2026 - Lote 1" />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Asunto de Email a mostrar al cliente</label>
                  <input className="form-input w-full" value={editing.subject} onChange={e => setEditing({ ...editing, subject: e.target.value })} placeholder="🔥 Abrí o te pierdes estas Novedades..." />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Segmento del Público</label>
                  <select className="form-input w-full" value={editing.segment} onChange={e => setEditing({ ...editing, segment: e.target.value })}>
                    <option value="all">Todos los contactos de la base (Default)</option>
                    <option value="customers">Solo compradores verídicos</option>
                    <option value="vip">Usuarios VIP (+3 compras)</option>
                    <option value="inactive">Inactivos / Sin compras por 3 meses</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Fecha de Programación del Envío (Opcional)</label>
                  <input type="datetime-local" className="form-input w-full" value={editing.scheduled_at || ''} onChange={e => setEditing({ ...editing, scheduled_at: e.target.value || null })} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Diseño del Email (Plantilla HTML Compatible)</label>
                <textarea rows={8} className="form-input w-full font-mono text-xs" value={editing.body_html} onChange={e => setEditing({ ...editing, body_html: e.target.value })}
                  placeholder={'<html>\n<body>\n  <h1>¡Buenas [user.name]!</h1>\n  <p>Encontramos esto para ti...</p>\n</body>\n</html>'} />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setEditing(null)} className="btn-secondary text-sm">Descartar Cambios</button>
                <button onClick={saveCampaign} className="btn-primary text-sm flex items-center gap-2"><Save className="w-4 h-4" /> Guardar Campaña en Base</button>
              </div>
            </div>
          )}

          {/* Campaigns List */}
          {loading ? (
            <div className="text-center py-12 text-gray-400 animate-pulse">Obteniendo campañas...</div>
          ) : campaigns.length === 0 && !editing ? (
            <div className="bg-white p-12 rounded-xl border border-dashed border-gray-300 text-center">
              <Mail className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-bold text-gray-600">No tienes ninguna campaña activa</p>
              <p className="text-sm text-gray-500 mt-1">Crea un newsletter para anunciar descuentos o un nuevo producto.</p>
              <button onClick={startNew} className="mt-4 btn-primary text-sm mx-auto">Empezar a diseñar Campaña</button>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map(c => {
                const sc = statusConfig[c.status] || statusConfig.draft;
                const StatusIcon = sc.icon;
                return (
                  <div key={c.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center justify-between hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary-100/50 rounded-lg flex items-center justify-center"><Mail className="w-5 h-5 text-primary-600" /></div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-gray-900 text-sm">{c.name}</h4>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border flex items-center gap-1 ${sc.cls}`}>
                            <StatusIcon className="w-3 h-3" /> {sc.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Asunto real: <span className="text-gray-900 font-medium">"{c.subject}"</span>
                          {c.recipients_count ? ` · Llegó a ${c.recipients_count} casillas` : ''}
                          {c.sent_at ? ` · Disparada el ${new Date(c.sent_at).toLocaleDateString('es-UY')}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {c.status === 'draft' && (
                        <button onClick={() => sendCampaign(c)} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1 bg-green-600 border-green-600 hover:bg-green-700 hover:border-green-700">
                          <Send className="w-3 h-3" /> Realizar Envío Seguro
                        </button>
                      )}
                      <button onClick={() => setEditing(c)} className="btn-secondary text-xs py-1.5 px-3">Inspeccionar / Editar</button>
                      <button onClick={() => deleteCampaign(c.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900">Registro de Mails Transaccionales (Logs)</h3>
              <p className="text-sm text-gray-500 mt-1">Conformaciones de órden, Avisos de Despacho y más (últimos 100 correos)</p>
            </div>
            <History className="w-6 h-6 text-gray-300" />
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Fecha / Hora</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Tipo Operación</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Destino (Email)</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Asunto</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status SMTP</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">Leyendo logs transaccionales...</td></tr>
              ) : emailLogs.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 flex items-center justify-center gap-2"><AlertCircle className="w-5 h-5"/> Aún no hubo disparos de notificaciones automáticas.</td></tr>
              ) : emailLogs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-sm text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleString('es-UY')}</td>
                  <td className="px-6 py-3 text-sm">
                    <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border border-gray-200">{log.email_type}</span>
                  </td>
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">{log.recipient_email}</td>
                  <td className="px-6 py-3 text-sm text-gray-600 truncate max-w-[250px]">{log.subject}</td>
                  <td className="px-6 py-3 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      log.status === 'sent' ? 'bg-green-100 text-green-700' :
                      log.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {log.status === 'sent' ? 'Entregado OK' : log.status === 'failed' ? 'Error SMTP' : log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
