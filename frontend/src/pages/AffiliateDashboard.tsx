import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../contexts/LocaleContext';
import { 
  Copy, CheckCircle, BarChart3, DollarSign, MousePointerClick, 
  ShoppingCart, Gift, Link as LinkIcon, Download, Settings, RefreshCw, CreditCard,
  AlertCircle, Edit2, Save, X
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

export default function AffiliateDashboard() {
  const { user, profile } = useAuth();
  const { language, currency, setLanguage, setCurrency } = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';
  const setActiveTab = (tab: string) => setSearchParams({ tab });
  
  // Data States
  const [affiliateData, setAffiliateData] = useState<any>(null);
  const [clicks, setClicks] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [promoMaterials, setPromoMaterials] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copyingLink, setCopyingLink] = useState(false);
  
  // Custom Code Feature
  const [customCode, setCustomCode] = useState('');
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [savingCode, setSavingCode] = useState(false);
  const [codeError, setCodeError] = useState('');

  // Settings State
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentDetails, setPaymentDetails] = useState('');
  const [updatingSettings, setUpdatingSettings] = useState(false);

  // Payout State
  const [requestingPayout, setRequestingPayout] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchDashboardData();
    }
  }, [user]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const { data: aff, error: affErr } = await supabase
        .from('affiliates')
        .select('*')
        .eq('id', user?.id)
        .single();
      
      if (!affErr && aff) {
        setAffiliateData(aff);
        setCustomCode(aff.code || 'AFF-' + user?.id?.substring(0, 6).toUpperCase());
        setPaymentMethod(aff.payment_method || 'paypal');
        setPaymentDetails(aff.payment_details ? JSON.stringify(aff.payment_details) : '');
      }

      const { data: clks } = await supabase.from('affiliate_clicks').select('*').eq('affiliate_id', user?.id).order('clicked_at', { ascending: false });
      setClicks(clks || []);

      const { data: comms } = await supabase.from('affiliate_commissions').select('*').eq('affiliate_id', user?.id).order('created_at', { ascending: false });
      setCommissions(comms || []);

      const { data: pays } = await supabase.from('affiliate_payout_requests').select('*').eq('affiliate_id', user?.id).order('requested_at', { ascending: false });
      setPayouts(pays || []);

      const { data: promos } = await supabase.from('promo_materials').select('*').eq('status', 'active');
      setPromoMaterials(promos || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const domain = window.location.origin;
  const referralLink = `${domain}/?ref=${customCode}`; // Dynamically uses the state

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopyingLink(true);
    setTimeout(() => setCopyingLink(false), 2000);
  };

  const handleUpdateCode = async () => {
    if (!customCode.trim()) {
      setCodeError('El código no puede estar vacío.');
      return;
    }
    
    // Clean code: uppercase, no spaces
    const cleanCode = customCode.trim().toUpperCase().replace(/\s+/g, '-');
    
    setSavingCode(true);
    setCodeError('');
    try {
      const { error } = await supabase.from('affiliates').update({ code: cleanCode }).eq('id', user?.id);
      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          throw new Error('Este código ya está en uso por otro afiliado.');
        }
        throw error;
      }
      setCustomCode(cleanCode);
      setIsEditingCode(false);
      setAffiliateData({ ...affiliateData, code: cleanCode }); // Update local instance
    } catch (err: any) {
      setCodeError(err.message || 'Error al guardar el código.');
    } finally {
      setSavingCode(false);
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingSettings(true);
    try {
      let detailsJson = null;
      try { detailsJson = paymentDetails ? JSON.parse(paymentDetails) : null; } 
      catch (err) { detailsJson = { account: paymentDetails }; }

      await supabase.from('affiliates').update({
        payment_method: paymentMethod,
        payment_details: detailsJson
      }).eq('id', user?.id);
      
      alert('Configuración actualizada correctamente');
      fetchDashboardData();
    } catch (err) {
      alert('Error actualizando configuración');
    } finally {
      setUpdatingSettings(false);
    }
  };

  const handleRequestPayout = async () => {
    if (availableBalance <= 0) return alert('No tienes saldo disponible para retirar.');
    setRequestingPayout(true);
    try {
      await supabase.from('affiliate_payout_requests').insert({ affiliate_id: user?.id, amount: availableBalance, status: 'pending' });
      alert('Solicitud de pago enviada. En breve la procesaremos.');
      fetchDashboardData();
    } catch (err) {
      alert('Error solicitando pago.');
    } finally {
      setRequestingPayout(false);
    }
  };

  const useDemoData = commissions.length === 0;
  const totalClicks = useDemoData ? 1245 : clicks.length;
  const totalSales = useDemoData ? 47 : commissions.length;
  const totalCommissionsValue = useDemoData ? 450.50 : commissions.reduce((sum, c) => sum + Number(c.amount), 0);
  const paidCommissions = useDemoData ? 150.00 : payouts.filter(p => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount), 0);
  const pendingPayouts = useDemoData ? 0 : payouts.filter(p => p.status === 'pending').reduce((sum, p) => sum + Number(p.amount), 0);
  const availableBalance = useDemoData ? (totalCommissionsValue - paidCommissions) : (totalCommissionsValue - paidCommissions - pendingPayouts);

  const demoActivity = [
    { id: '1', date: new Date().toISOString(), product_name: 'Figura Marvel Legends', status: 'confirmed', amount: 15.50 },
    { id: '2', date: new Date(Date.now() - 86400000).toISOString(), product_name: 'Funko Pop Batman', status: 'pending', amount: 5.00 },
    { id: '3', date: new Date(Date.now() - 172800000).toISOString(), product_name: 'Comic Variant Cover', status: 'paid', amount: 12.00 },
  ];

  const displayCommissions = useDemoData ? demoActivity : commissions;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><RefreshCw className="w-8 h-8 animate-spin text-primary-600" /></div>;
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-transparent text-white">
      {/* MAIN CONTENT AREA */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-10">
        
        {/* TAB NAVIGATION */}
        <div className="flex items-center gap-1 mb-12 border-b border-white/5 overflow-x-auto no-scrollbar">
           {[
              { id: 'overview', label: 'Dashboard', icon: BarChart3 },
              { id: 'payments', label: 'Finanzas', icon: DollarSign },
              { id: 'materials', label: 'Recursos', icon: Gift },
              { id: 'settings', label: 'Configuración', icon: Settings }
           ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                 <button 
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-8 py-4 text-xs font-black uppercase tracking-[0.2em] transition-all relative ${
                    isActive ? 'text-[#f00856]' : 'text-slate-500 hover:text-white'
                  }`}
                 >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                    {isActive && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#f00856]" />}
                 </button>
              );
           })}
        </div>

        {/* 1. WELCOME BANNER */}
        {activeTab === 'overview' && (
           <div className="relative border border-white/10 bg-[#0a0c14] p-12 overflow-hidden mb-12 group">
              <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#f00856]/10 blur-[100px] -mr-40 -mt-40 transition-transform group-hover:scale-110 duration-700" />
              <div className="relative z-10">
                 <div className="text-[10px] text-[#f00856] font-black uppercase tracking-[0.4em] mb-4">Affiliate Program</div>
                 <h1 className="text-4xl lg:text-6xl font-black mb-6 tracking-tight">¡Hola, {profile?.first_name || 'Afiliado'}!</h1>
                 <p className="text-slate-400 font-bold text-xl max-w-2xl leading-relaxed">
                    Gestiona tus enlaces, monitorea clics y optimiza tus ganancias desde tu centro de mando editorial.
                 </p>
              </div>
           </div>
        )}

        {/* 2. REFERRAL LINK & CUSTOM CODE CARD */}
        {(activeTab === 'overview' || activeTab === 'materials') && (
          <div className="glass border border-white/10 p-10 mb-12">
            <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-8 flex items-center gap-3">
              <LinkIcon className="w-4 h-4 text-[#f00856]" /> Tu identidad de afiliado
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* CODE EDITOR */}
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Código personalizado</label>
                <div className="flex bg-white/5 border border-white/10">
                  <input 
                    type="text" 
                    value={customCode} 
                    onChange={e => setCustomCode(e.target.value.toUpperCase().replace(/\s+/g, '-'))}
                    disabled={!isEditingCode || savingCode}
                    className={`flex-1 bg-transparent text-xl font-black tracking-[0.2em] outline-none p-4 transition-colors ${
                      isEditingCode ? 'text-[#f00856]' : 'text-white'
                    }`} 
                  />
                  {isEditingCode ? (
                    <div className="flex border-l border-white/10">
                      <button 
                        onClick={() => {
                          setCustomCode(affiliateData?.code || 'AFF-' + user?.id?.substring(0, 6).toUpperCase());
                          setIsEditingCode(false);
                          setCodeError('');
                        }} 
                        className="p-4 hover:bg-white/5 text-slate-400 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={handleUpdateCode} 
                        disabled={savingCode}
                        className="p-4 bg-[#f00856] text-white hover:bg-[#d0074a] transition-colors disabled:opacity-50"
                      >
                        {savingCode ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5"/>}
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setIsEditingCode(true)} 
                      className="p-4 hover:bg-white/5 text-[#f00856] border-l border-white/10 transition-colors uppercase text-[10px] font-black tracking-widest"
                    >
                      Editar
                    </button>
                  )}
                </div>
                {codeError && <p className="text-red-500 text-[10px] font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {codeError}</p>}
              </div>

              {/* LINK PREVIEW & COPY */}
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Enlace web directo</label>
                <div className="flex bg-white/5 border border-white/10 overflow-hidden">
                  <input type="text" readOnly value={referralLink} className="flex-1 bg-transparent p-4 text-xs font-bold text-slate-400 outline-none truncate" />
                  <button onClick={handleCopyLink} className="p-4 bg-white/10 text-white hover:bg-white/20 transition-colors uppercase text-[10px] font-black tracking-widest w-32 border-l border-white/10">
                    {copyingLink ? <CheckCircle className="w-4 h-4 mx-auto" /> : 'Copiar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB CONTENT SPACES */}
        {activeTab === 'overview' && (
          <div className="space-y-12 animate-fade-in">
            {/* METRICS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-1">
              {[
                { label: 'Clics de Link', value: totalClicks, icon: MousePointerClick, color: 'text-blue-400' },
                { label: 'Ventas Reales', value: totalSales, icon: ShoppingCart, color: 'text-emerald-400' },
                { label: 'Ganancias', value: `$${totalCommissionsValue.toFixed(2)}`, icon: DollarSign, color: 'text-amber-400' },
                { label: 'Disponible', value: `$${availableBalance.toFixed(2)}`, icon: CreditCard, color: 'text-[#f00856]' }
              ].map((stat, i) => (
                <div key={i} className="glass border border-white/10 p-8 hover:bg-white/5 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</span>
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                  <div className="text-3xl font-black text-white">{stat.value}</div>
                </div>
              ))}
            </div>

            {/* RECENT ACTIVITY */}
            <div className="glass border border-white/10 overflow-hidden">
              <div className="px-10 py-8 border-b border-white/10 flex items-center justify-between">
                 <div>
                    <div className="text-[10px] text-[#f00856] font-black uppercase tracking-widest mb-1">Live Feed</div>
                    <h3 className="font-black text-xl text-white">Actividad Reciente</h3>
                 </div>
                 {useDemoData && <span className="text-[10px] border border-amber-500/20 text-amber-500 font-black px-3 py-1 tracking-[0.2em] uppercase bg-amber-500/5">SandBox</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="px-10 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Fecha</th>
                      <th className="px-10 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Atribución</th>
                      <th className="px-10 py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest">Estado</th>
                      <th className="px-10 py-4 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {displayCommissions.map((act) => (
                      <tr key={act.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-10 py-6 text-sm font-bold text-slate-400">
                          {new Date(act.date || act.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-10 py-6">
                          <div className="text-sm font-black text-white">{act.product_name || `Orden #${act.id.substring(0,6).toUpperCase()}`}</div>
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Direct attribution</div>
                        </td>
                        <td className="px-10 py-6 text-center">
                          <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 ${
                            act.status === 'paid' ? 'text-emerald-500' :
                            act.status === 'confirmed' ? 'text-blue-500' :
                            'text-amber-500'
                          }`}>
                            {act.status}
                          </span>
                        </td>
                        <td className="px-10 py-6 text-right">
                          <span className="font-black text-white text-lg">${Number(act.amount).toFixed(2)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* PAYMENTS SECTION */}
        {activeTab === 'payments' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-1 animate-fade-in">
            <div className="lg:col-span-1 space-y-1">
              <div className="glass border border-white/10 p-10 text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-[#f00856]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <CreditCard className="w-12 h-12 text-[#f00856] mx-auto mb-8" />
                <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Saldo Neto Retirable</div>
                <h2 className="text-5xl font-black text-white mb-10">${availableBalance.toFixed(2)}</h2>
                <button 
                  onClick={handleRequestPayout}
                  disabled={availableBalance <= 0 || requestingPayout}
                  className={`w-full py-5 font-black text-xs uppercase tracking-[0.2em] transition-all border ${
                    availableBalance > 0 
                      ? 'bg-[#f00856] border-[#f00856] text-white hover:bg-transparent hover:text-[#f00856]' 
                      : 'bg-white/5 border-white/10 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  {requestingPayout ? 'Procesando...' : 'Solicitar Retiro'}
                </button>
              </div>
              <div className="glass border border-white/10 p-10 flex justify-between items-center">
                <div>
                  <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Pagos Procesados</div>
                  <div className="text-3xl font-black text-white">${paidCommissions.toFixed(2)}</div>
                </div>
                <CheckCircle className="w-8 h-8 text-emerald-500 opacity-20" />
              </div>
            </div>
            
            <div className="lg:col-span-2 glass border border-white/10 flex flex-col">
              <div className="px-10 py-8 border-b border-white/10">
                <div className="text-[10px] text-[#f00856] font-black uppercase tracking-widest mb-1">Transactions</div>
                <h3 className="font-black text-xl text-white">Historial de Retiros</h3>
              </div>
              <div className="flex-1 p-10 overflow-y-auto no-scrollbar max-h-[600px]">
                {payouts.length === 0 && !useDemoData ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4">
                    <DollarSign className="w-12 h-12 opacity-20" />
                    <p className="font-black text-xs uppercase tracking-widest">No hay movimientos registrados</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(useDemoData ? [{id:'d1', status:'paid', amount: 150.00, requested_at: new Date(Date.now() - 1000000000).toISOString() }] : payouts).map(p => (
                      <div key={p.id} className="flex justify-between items-center p-8 bg-white/5 border border-white/5 hover:border-white/10 transition-all">
                        <div className="flex items-center gap-6">
                           <div className={`w-12 h-12 flex items-center justify-center border ${p.status === 'paid' ? 'border-emerald-500/20 text-emerald-500' : 'border-amber-500/20 text-amber-500'}`}>
                             <Download className="w-5 h-5" />
                           </div>
                           <div>
                              <div className="text-sm font-black text-white">Abono {affiliateData?.payment_method || 'Standard'}</div>
                              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                                {new Date(p.requested_at).toLocaleDateString()} • {new Date(p.requested_at).toLocaleTimeString()}
                              </div>
                           </div>
                        </div>
                        <div className="text-right">
                           <div className="text-xl font-black text-white">${Number(p.amount).toFixed(2)}</div>
                           <div className={`text-[10px] font-black uppercase tracking-widest mt-1 ${p.status === 'paid' ? 'text-emerald-500' : 'text-amber-500'}`}>{p.status}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MATERIALS SECTION */}
        {activeTab === 'materials' && (
          <div className="space-y-1 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
              {promoMaterials.length === 0 ? (
                <div className="col-span-2 glass border border-white/10 p-20 text-center flex flex-col items-center gap-6">
                  <Gift className="w-12 h-12 text-slate-700" />
                  <p className="font-black text-xs text-slate-500 uppercase tracking-[0.2em]">Próximamente nuevas campañas</p>
                </div>
              ) : promoMaterials.map(promo => (
                <div key={promo.id} className="glass border border-white/10 group overflow-hidden">
                  <div className="h-72 overflow-hidden relative">
                    {promo.image_url ? (
                      <img src={promo.image_url} alt={promo.title} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-800 bg-white/5"><Gift className="w-12 h-12" /></div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent h-1/2" />
                    <div className="absolute bottom-6 left-6 text-[10px] font-black tracking-widest uppercase bg-[#f00856] px-4 py-1 text-white">Activa</div>
                  </div>
                  <div className="p-10">
                    <h4 className="text-2xl font-black text-white mb-4 leading-tight">{promo.title}</h4>
                    <p className="text-slate-400 font-bold text-sm mb-10 leading-relaxed">{promo.description}</p>
                    
                    <div className="bg-white/5 p-6 border-l-2 border-[#f00856] mb-10">
                       <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Sugerencia de posteo</div>
                       <p className="text-sm text-slate-300 font-bold italic italic leading-relaxed">"{promo.suggested_copy}"</p>
                    </div>
                    
                    <div className="flex gap-1">
                       <button 
                        onClick={() => {
                          navigator.clipboard.writeText(promo.suggested_copy);
                          alert('Copiado');
                        }}
                        className="p-4 bg-white/5 hover:bg-white/10 text-white transition-all"
                       >
                          <Copy className="w-5 h-5" />
                       </button>
                       {promo.image_url && (
                        <a href={promo.image_url} download target="_blank" rel="noreferrer" className="flex-1 bg-white text-black p-4 text-[10px] font-black uppercase tracking-widest text-center hover:bg-[#f00856] hover:text-white transition-all">
                          Descargar Asset
                        </a>
                       )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SETTINGS SECTION */}
        {activeTab === 'settings' && (
          <div className="animate-fade-in max-w-4xl">
            <div className="glass border border-white/10 p-12 mb-1">
               <div className="text-[10px] text-[#f00856] font-black uppercase tracking-widest mb-10">Account Settings</div>
               <div className="grid md:grid-cols-2 gap-12">
                  <div className="space-y-4">
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Idioma de Interfaz</label>
                     <select
                        className="w-full bg-white/5 border border-white/10 p-4 text-sm font-bold text-white outline-none focus:border-[#f00856] transition-colors"
                        value={language}
                        onChange={e => setLanguage(e.target.value as any)}
                     >
                        <option value="es" className="bg-[#0a0c14]">Español</option>
                        <option value="en" className="bg-[#0a0c14]">English</option>
                     </select>
                  </div>
                  <div className="space-y-4">
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Moneda del Panel</label>
                     <select
                        className="w-full bg-white/5 border border-white/10 p-4 text-sm font-bold text-white outline-none focus:border-[#f00856] transition-colors"
                        value={currency}
                        onChange={e => setCurrency(e.target.value as any)}
                     >
                        <option value="UYU" className="bg-[#0a0c14]">Pesos (UYU)</option>
                        <option value="USD" className="bg-[#0a0c14]">Dólares (USD)</option>
                     </select>
                  </div>
               </div>
            </div>

            <div className="glass border border-white/10 p-12">
              <form onSubmit={handleUpdateSettings} className="space-y-10">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Método de cobro</label>
                  <select 
                    value={paymentMethod} 
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 p-4 text-sm font-bold text-white outline-none focus:border-[#f00856] transition-colors"
                  >
                    <option value="paypal" className="bg-[#0a0c14]">PayPal</option>
                    <option value="bank_transfer" className="bg-[#0a0c14]">Transferencia Bancaria</option>
                    <option value="crypto" className="bg-[#0a0c14]">USDT (Crypto)</option>
                    <option value="store_credit" className="bg-[#0a0c14]">Crédito Tienda (+10% Bonus)</option>
                  </select>
                </div>
                
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Detalles de cuenta</label>
                  <textarea 
                    value={paymentDetails}
                    onChange={e => setPaymentDetails(e.target.value)}
                    rows={4}
                    className="w-full bg-white/5 border border-white/10 p-4 text-sm font-bold text-white outline-none focus:border-[#f00856] transition-colors resize-none"
                    placeholder="Ej: CBU, Alias o Email de PayPal..."
                  />
                </div>

                <button 
                  disabled={updatingSettings} 
                  type="submit" 
                  className="w-full py-5 bg-white text-black font-black text-xs uppercase tracking-[0.3em] hover:bg-[#f00856] hover:text-white transition-all disabled:opacity-50"
                >
                  {updatingSettings ? 'Procesando...' : 'Guardar Cambios'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
