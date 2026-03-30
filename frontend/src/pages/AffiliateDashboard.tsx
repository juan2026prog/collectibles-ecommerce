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
    <div className="flex flex-col md:flex-row min-h-screen bg-transparent">
      {/* MAIN CONTENT AREA */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-10">
        {/* 1. WELCOME BANNER */}
        <div className="bg-gradient-to-r from-primary-900 to-indigo-900 rounded-3xl p-8 lg:p-10 text-white shadow-xl relative overflow-hidden mb-8">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 border-4 border-white/10 rounded-full blur-3xl"></div>
          <div className="relative z-10">
            <h1 className="text-3xl lg:text-4xl font-black mb-2 tracking-tight">¡Hola, {profile?.first_name || 'Afiliado'}! 👋</h1>
            <p className="text-primary-100 font-medium text-lg max-w-xl">
              Este es tu Centro de Control. Revisa tus enlaces, monitoriza tus clics y gestiona tus ganancias en tiempo real.
            </p>
          </div>
        </div>

        {/* 2. REFERRAL LINK & CUSTOM CODE CARD (Always visible at the top or in overview) */}
        {(activeTab === 'overview' || activeTab === 'materials') && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-8 mb-8">
            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <LinkIcon className="text-primary-600" /> Tu Código y Enlace (¡Personalízalo!)
            </h3>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* CODE EDITOR */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tu Código de Afiliado</label>
                <div className="flex relative">
                  <input 
                    type="text" 
                    value={customCode} 
                    onChange={e => setCustomCode(e.target.value.toUpperCase().replace(/\s+/g, '-'))}
                    disabled={!isEditingCode || savingCode}
                    className={`flex-1 border text-lg font-black tracking-widest outline-none transition-colors ${
                      isEditingCode 
                        ? 'bg-blue-50 border-blue-400 text-blue-900 px-4 py-3 rounded-l-xl focus:ring-2 focus:ring-blue-500/20' 
                        : 'bg-gray-50 border-gray-200 text-gray-900 px-4 py-3 rounded-l-xl cursor-default'
                    }`} 
                  />
                  {isEditingCode ? (
                    <div className="flex">
                      <button 
                        onClick={() => {
                          setCustomCode(affiliateData?.code || 'AFF-' + user?.id?.substring(0, 6).toUpperCase());
                          setIsEditingCode(false);
                          setCodeError('');
                        }} 
                        className="bg-gray-200 text-gray-600 px-4 hover:bg-gray-300 transition-colors flex justify-center items-center"
                        title="Cancelar"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={handleUpdateCode} 
                        disabled={savingCode}
                        className="bg-green-600 text-white px-6 rounded-r-xl hover:bg-green-700 transition-colors flex justify-center items-center disabled:opacity-50 font-bold"
                      >
                        {savingCode ? <RefreshCw className="w-5 h-5 animate-spin" /> : <span className="flex items-center gap-2"><Save className="w-5 h-5"/> Guardar</span>}
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setIsEditingCode(true)} 
                      className="bg-dark-900 text-white px-6 rounded-r-xl hover:bg-dark-800 transition-colors flex justify-center items-center font-bold"
                    >
                      <span className="flex items-center gap-2"><Edit2 className="w-4 h-4"/> Editar</span>
                    </button>
                  )}
                </div>
                {codeError && (
                  <p className="text-red-500 text-sm font-bold flex items-center gap-1 mt-2">
                    <AlertCircle className="w-4 h-4" /> {codeError}
                  </p>
                )}
                <p className="text-xs text-gray-500 font-medium">Este código sirve como cupón directo en el checkout.</p>
              </div>

              {/* LINK PREVIEW & COPY */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tu Enlace Web Completo</label>
                <div className="flex">
                  <input type="text" readOnly value={referralLink} className="flex-1 bg-gray-50 border border-gray-200 rounded-l-xl py-3 px-4 text-sm text-gray-600 outline-none truncate" />
                  <button onClick={handleCopyLink} className="bg-primary-600 text-white px-6 rounded-r-xl hover:bg-primary-700 transition-colors flex items-center justify-center font-bold w-32 shadow-sm">
                    {copyingLink ? <CheckCircle className="w-5 h-5" /> : <span className="flex items-center gap-2"><Copy className="w-4 h-4"/> Copiar</span>}
                  </button>
                </div>
                <p className="text-xs text-gray-500 font-medium">Cualquier persona que entre con este link sumará comisiones a tu cuenta. ¡Pruébalo modificando tu código!</p>
              </div>
            </div>
          </div>
        )}


        {/* TAB CONTENT SPACES */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animation-fade-in">
            {/* 3. METRICS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col hover:border-blue-200 transition-colors">
                <div className="flex items-center gap-3 text-blue-600 mb-4">
                  <div className="bg-blue-50 p-2.5 rounded-xl"><MousePointerClick className="w-5 h-5" /></div>
                  <h4 className="font-bold text-gray-500 text-sm uppercase tracking-wide">Clics de Link</h4>
                </div>
                <div className="text-4xl font-black text-gray-900">{totalClicks}</div>
              </div>
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col hover:border-emerald-200 transition-colors">
                <div className="flex items-center gap-3 text-emerald-600 mb-4">
                  <div className="bg-emerald-50 p-2.5 rounded-xl"><ShoppingCart className="w-5 h-5" /></div>
                  <h4 className="font-bold text-gray-500 text-sm uppercase tracking-wide">Ventas Reales</h4>
                </div>
                <div className="text-4xl font-black text-gray-900">{totalSales}</div>
              </div>
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col relative overflow-hidden">
                <div className="absolute right-0 top-0 opacity-[0.03] -mt-4 -mr-4"><DollarSign className="w-40 h-40" /></div>
                <div className="flex items-center gap-3 text-orange-500 mb-4 relative z-10">
                  <div className="bg-orange-50 p-2.5 rounded-xl"><DollarSign className="w-5 h-5" /></div>
                  <h4 className="font-bold text-gray-500 text-sm uppercase tracking-wide">Tus Ganancias</h4>
                </div>
                <div className="text-4xl font-black text-gray-900 relative z-10">${totalCommissionsValue.toFixed(2)}</div>
              </div>
              <div className="bg-primary-50 rounded-3xl shadow-sm border border-primary-100 p-6 flex flex-col relative">
                <div className="flex items-center gap-3 text-primary-700 mb-4">
                  <div className="bg-white p-2.5 rounded-xl shadow-sm"><CreditCard className="w-5 h-5" /></div>
                  <h4 className="font-bold text-primary-700 text-sm uppercase tracking-wide">Disponible</h4>
                </div>
                <div className="text-4xl font-black text-primary-700">${availableBalance.toFixed(2)}</div>
              </div>
            </div>

            {/* 4. RECENT ACTIVITY TABLE */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-black text-gray-900 text-lg">Historial de Conversiones Recientes</h3>
                {useDemoData && <span className="text-[10px] bg-yellow-100 text-yellow-800 font-bold px-3 py-1.5 rounded-full tracking-widest uppercase">SandBox Data</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100">
                  <thead className="bg-gray-50/50">
                    <tr>
                      <th className="px-8 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">Fecha y Hora</th>
                      <th className="px-8 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">Atribución / Producto</th>
                      <th className="px-8 py-4 text-center text-[11px] font-black text-gray-400 uppercase tracking-widest">Estado (Comisión)</th>
                      <th className="px-8 py-4 text-right text-[11px] font-black text-gray-400 uppercase tracking-widest">Venta Generada</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-50">
                    {displayCommissions.map((act) => (
                      <tr key={act.id} className="hover:bg-gray-50/80 transition-colors group">
                        <td className="px-8 py-5 whitespace-nowrap text-sm text-gray-500">
                          <span className="font-medium text-gray-700">{new Date(act.date || act.created_at).toLocaleDateString()}</span>
                        </td>
                        <td className="px-8 py-5 whitespace-nowrap">
                          <div className="text-sm font-bold text-gray-900">{act.product_name || `Orden #${act.id.substring(0,6).toUpperCase()}`}</div>
                          <div className="text-xs text-gray-400 mt-0.5">Venta por Link de Afiliado</div>
                        </td>
                        <td className="px-8 py-5 whitespace-nowrap text-center">
                          <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide ${
                            act.status === 'paid' ? 'bg-green-100 text-green-700' :
                            act.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {act.status}
                          </span>
                        </td>
                        <td className="px-8 py-5 whitespace-nowrap text-right text-sm">
                          <span className="font-black text-emerald-600 text-base">+${Number(act.amount).toFixed(2)}</span>
                        </td>
                      </tr>
                    ))}
                    {displayCommissions.length === 0 && (
                      <tr><td colSpan={4} className="px-8 py-16 text-center text-gray-400 font-medium">Nadie ha usado tu link para comprar. ¡Empieza a compartirlo!</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 5. PAYMENTS SECTION */}
        {activeTab === 'payments' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animation-fade-in">
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-dark-900 rounded-3xl p-8 text-white shadow-xl text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary-600 rounded-full blur-[80px] -mt-10 -mr-10 opacity-50"></div>
                <div className="relative z-10">
                  <CreditCard className="w-10 h-10 text-primary-400 mx-auto mb-6" />
                  <p className="text-gray-400 text-xs font-bold tracking-widest mb-2 uppercase">Tu Saldo Retirable</p>
                  <h2 className="text-5xl font-black text-white mb-8">${availableBalance.toFixed(2)}</h2>
                  <button 
                    onClick={handleRequestPayout}
                    disabled={availableBalance <= 0 || requestingPayout}
                    className={`w-full py-4 rounded-xl font-bold text-sm transition-all ${availableBalance > 0 ? 'bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-900/50' : 'bg-dark-800 text-gray-500 cursor-not-allowed'}`}
                  >
                    {requestingPayout ? 'Procesando...' : 'Solicitar Traspaso ahora'}
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-3xl border border-gray-100 p-8 flex justify-between items-center shadow-sm">
                <div>
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Pagos Históricos</p>
                  <div className="text-3xl font-black text-gray-900">${paidCommissions.toFixed(2)}</div>
                </div>
                <div className="bg-green-50 p-3 rounded-2xl"><CheckCircle className="w-6 h-6 text-green-500" /></div>
              </div>
            </div>
            
            <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-8 py-6 border-b border-gray-100">
                <h3 className="font-black text-gray-900 text-lg">Historial de Retiros de Fondos</h3>
              </div>
              <div className="p-8">
                {payouts.length === 0 && !useDemoData ? (
                  <div className="text-center py-16 text-gray-400 font-medium">
                    No has solicitado ningún retiro todavía.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(useDemoData ? [{id:'d1', status:'paid', amount: 150.00, requested_at: new Date(Date.now() - 1000000000).toISOString() }] : payouts).map(p => (
                      <div key={p.id} className="flex justify-between items-center p-5 border border-gray-100 rounded-2xl bg-gray-50 hover:bg-white transition-colors group">
                        <div className="flex items-center gap-5">
                          <div className={`p-4 rounded-xl ${p.status === 'paid' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
                            <DollarSign className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-lg">Abono a tu cuenta ({affiliateData?.payment_method || 'Paypal'})</p>
                            <p className="text-sm font-medium text-gray-500 mt-0.5">{new Date(p.requested_at).toLocaleDateString()} a las {new Date(p.requested_at).toLocaleTimeString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-gray-900 text-xl">${Number(p.amount).toFixed(2)}</p>
                          <p className={`text-xs font-black tracking-widest uppercase mt-1 ${p.status === 'paid' ? 'text-green-600' : 'text-yellow-600'}`}>
                            {p.status}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 6. PROMOTIONAL MATERIALS */}
        {activeTab === 'materials' && (
          <div className="space-y-6 animation-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {promoMaterials.length === 0 ? (
                <div className="col-span-2 text-center text-gray-500 py-16 bg-white rounded-3xl border border-gray-100">
                  <Gift className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="font-medium">No hay campañas de gráficas activas por parte del administrador.</p>
                </div>
              ) : promoMaterials.map(promo => (
                <div key={promo.id} className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden flex flex-col group hover:shadow-lg transition-all">
                  <div className="h-56 overflow-hidden bg-gray-100 relative">
                    {promo.image_url ? (
                      <img src={promo.image_url} alt={promo.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400"><ImageIcon className="w-10 h-10" /></div>
                    )}
                    <div className="absolute top-4 right-4 bg-white/95 backdrop-blur px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest shadow uppercase text-emerald-600">EN CURSO</div>
                  </div>
                  <div className="p-8 flex-1 flex flex-col">
                    <h4 className="text-xl font-black text-gray-900 mb-3">{promo.title}</h4>
                    <p className="text-sm font-medium text-gray-500 mb-6 flex-1 leading-relaxed">{promo.description}</p>
                    
                    <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 mb-6">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sugerencia para Instagram/TikTok</p>
                        <button onClick={() => {
                            navigator.clipboard.writeText(promo.suggested_copy.replace('[CÓDIGO]', referralCode).replace('[LINK]', referralLink));
                            alert('Texto copiado al portapapeles');
                          }}
                          className="bg-white p-2 rounded-lg shadow-sm border border-gray-200 text-gray-500 hover:text-primary-600 transition-colors">
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-sm text-gray-700 font-medium italic">
                        "{promo.suggested_copy.replace('[CÓDIGO]', referralCode).replace('[LINK]', referralLink)}"
                      </p>
                    </div>
                    
                    {promo.image_url && (
                      <a href={promo.image_url} download target="_blank" rel="noreferrer" className="w-full bg-dark-900 hover:bg-dark-800 text-white py-3.5 rounded-xl text-sm font-bold flex justify-center items-center gap-2 transition-colors shadow-md">
                        <Download className="w-5 h-5" /> Descargar Asset Original
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7. SETTINGS */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-10 max-w-3xl animation-fade-in space-y-10">
            {/* Global Preferences Panel */}
            <div>
               <div className="flex items-center gap-4 mb-6">
                 <div className="bg-purple-50 p-3 rounded-2xl text-purple-600">
                   <Settings className="w-6 h-6"/>
                 </div>
                 <div>
                   <h3 className="text-2xl font-black text-gray-900 mb-1">Preferencias Globales</h3>
                   <p className="text-gray-500 font-medium">Idioma y moneda para visualizar la plataforma.</p>
                 </div>
               </div>
               
               <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                    <label className="block text-xs font-black tracking-widest text-gray-500 uppercase mb-3">Idioma del Panel</label>
                    <select
                       className="w-full bg-white border-2 border-transparent text-gray-900 text-base font-medium rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 p-4 outline-none transition-all"
                       value={language}
                       onChange={e => setLanguage(e.target.value as any)}
                    >
                       <option value="es">Español</option>
                       <option value="en">English (US)</option>
                    </select>
                 </div>
                 <div>
                    <label className="block text-xs font-black tracking-widest text-gray-500 uppercase mb-3">Moneda de Visualización</label>
                    <select
                       className="w-full bg-white border-2 border-transparent text-gray-900 text-base font-medium rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 p-4 outline-none transition-all"
                       value={currency}
                       onChange={e => setCurrency(e.target.value as any)}
                    >
                       <option value="UYU">Pesos Uruguayos (UYU)</option>
                       <option value="USD">Dólares Estadounidenses (USD)</option>
                       <option value="ARS">Pesos Argentinos (ARS)</option>
                    </select>
                 </div>
               </div>
            </div>

            <div className="border-t border-gray-100 pt-10">
              <div className="flex items-center gap-4 mb-8">
                <div className="bg-emerald-50 p-3 rounded-2xl text-emerald-600">
                  <CreditCard className="w-6 h-6"/>
                </div>
                <div>
                  <h3 className="text-2xl font-black text-gray-900 mb-1">Tus Datos de Facturación</h3>
                  <p className="text-gray-500 font-medium">Cómo y dónde quieres recibir las comisiones generadas.</p>
                </div>
              </div>
              
              <form onSubmit={handleUpdateSettings} className="space-y-8">
                <div>
                  <label className="block text-xs font-black tracking-widest text-gray-500 uppercase mb-3">Método de Transferencia Preferido</label>
                <select 
                  value={paymentMethod} 
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full bg-gray-50 border-2 border-gray-100 text-gray-900 text-base font-medium rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 p-4 outline-none transition-all"
                >
                  <option value="paypal">Abono Internacional (PayPal)</option>
                  <option value="bank_transfer">Banca Local (CBU/ALIAS)</option>
                  <option value="crypto">Billetera Cripto USDT (TRC20)</option>
                  <option value="store_credit">Fidelidad: Crédito en la Tienda (+10% Bonus)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-black tracking-widest text-gray-500 uppercase mb-3">Información de Destino EXACTA</label>
                <textarea 
                  value={paymentDetails}
                  onChange={e => setPaymentDetails(e.target.value)}
                  placeholder='Ej: "PayPal: micorreo@ejemplo.com" o "Binance Pay ID: 123456"'
                  rows={4}
                  className="w-full bg-gray-50 border-2 border-gray-100 text-gray-900 text-base font-medium rounded-xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 p-4 outline-none transition-all resize-none"
                />
                <div className="flex items-start gap-2 mt-3 bg-yellow-50 text-yellow-800 p-3 rounded-xl text-xs font-bold">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>Asegúrate de no tener errores de tipeo. Si la transferencia rebota, el proceso demorará hasta 7 días hábiles en reintentarse.</p>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end">
                <button disabled={updatingSettings} type="submit" className="w-full sm:w-auto bg-primary-600 text-white font-black py-4 px-10 rounded-xl hover:bg-primary-500 transition-colors shadow-lg shadow-primary-900/20 disabled:opacity-50 flex justify-center items-center gap-2 tracking-wide">
                  {updatingSettings ? <RefreshCw className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5" />}
                  GUARDAR CONFIGURACIÓN
                </button>
              </div>
            </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
