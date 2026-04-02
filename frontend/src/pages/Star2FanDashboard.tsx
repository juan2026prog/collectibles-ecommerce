import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { Video, RefreshCw } from 'lucide-react';

import S2FOverview from '../components/star2fan/S2FOverview';
import S2FRequests from '../components/star2fan/S2FRequests';
import S2FHistory from '../components/star2fan/S2FHistory';
import S2FEarnings from '../components/star2fan/S2FEarnings';
import S2FProfile from '../components/star2fan/S2FProfile';
import S2FReviews from '../components/star2fan/S2FReviews';
import S2FSupport from '../components/star2fan/S2FSupport';

export default function Star2FanDashboard() {
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';
  const setActiveTab = (tab: string) => setSearchParams({ tab });

  const [creatorData, setCreatorData] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.id) fetchDashboardData();
  }, [user]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const { data: creator } = await supabase.from('star2fan_creators').select('*').eq('id', user?.id).single();
      if (creator) setCreatorData(creator);

      const { data: reqs } = await supabase.from('star2fan_requests').select('*').eq('creator_id', user?.id).order('created_at', { ascending: false });
      setRequests(reqs || []);

      const { data: earns } = await supabase.from('star2fan_earnings').select('*').eq('creator_id', user?.id).order('created_at', { ascending: false });
      setEarnings(earns || []);

      const { data: revs } = await supabase.from('star2fan_reviews').select('*').eq('creator_id', user?.id).order('created_at', { ascending: false });
      setReviews(revs || []);

      const { data: notifs } = await supabase.from('star2fan_notifications').select('*').eq('creator_id', user?.id).order('created_at', { ascending: false });
      setNotifications(notifs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInitialize = async () => {
    setLoading(true);
    try {
      if (!user?.id) return;
      await supabase.from('star2fan_creators').insert({
        id: user.id, email: user.email,
        stage_name: profile?.first_name || 'Star', category: 'Actor',
        short_bio: 'Disponible para tus saludos personalizados!',
        standard_price: 50, premium_price: 150, rush_delivery_price: 20,
        country: 'Argentina', languages: ['es'],
      });

      const { data: r1 } = await supabase.from('star2fan_requests').insert({
        creator_id: user.id, fan_buyer_name: 'Martín López', recipient_name: 'Sofía',
        occasion: 'birthday', instructions: 'Decile feliz cumple a mi novia Sofía, le encantan tus videos!',
        price: 50, priority: 'normal', status: 'new', name_pronunciation: 'So-FÍ-a',
        delivery_deadline: new Date(Date.now() + 86400000 * 3).toISOString(),
      }).select().single();

      const { data: r2 } = await supabase.from('star2fan_requests').insert({
        creator_id: user.id, fan_buyer_name: 'Laura García', recipient_name: 'Pedro',
        occasion: 'anniversary', instructions: 'Es nuestro décimo aniversario, mandále un saludo cariñoso a Pedro.',
        price: 70, priority: 'urgent', status: 'pending_acceptance',
        delivery_deadline: new Date(Date.now() + 86400000).toISOString(),
      }).select().single();

      const { data: r3 } = await supabase.from('star2fan_requests').insert({
        creator_id: user.id, fan_buyer_name: 'Carlos Ruiz', recipient_name: 'Carlos',
        occasion: 'motivation', instructions: 'Un saludo motivacional para mí mismo en mi nuevo emprendimiento.',
        price: 50, priority: 'normal', status: 'delivered',
        delivery_deadline: new Date(Date.now() - 86400000 * 2).toISOString(),
        delivered_at: new Date(Date.now() - 86400000).toISOString(),
      }).select().single();

      const { data: r4 } = await supabase.from('star2fan_requests').insert({
        creator_id: user.id, fan_buyer_name: 'Ana Martínez', recipient_name: 'Lucía',
        occasion: 'congratulation', instructions: 'Felicitá a Lucía por recibirse de médica!',
        price: 60, priority: 'normal', status: 'completed',
        delivery_deadline: new Date(Date.now() - 86400000 * 5).toISOString(),
        delivered_at: new Date(Date.now() - 86400000 * 4).toISOString(),
      }).select().single();

      if (r3) {
        await supabase.from('star2fan_earnings').insert({
          creator_id: user.id, request_id: r3.id,
          gross_amount: 50, platform_fee: 10, net_amount: 40,
          payment_status: 'pending', available_at: new Date(Date.now() + 86400000 * 2).toISOString(),
        });
      }
      if (r4) {
        await supabase.from('star2fan_earnings').insert({
          creator_id: user.id, request_id: r4.id,
          gross_amount: 60, platform_fee: 12, net_amount: 48,
          payment_status: 'available', available_at: new Date().toISOString(),
        });
        await supabase.from('star2fan_reviews').insert({
          creator_id: user.id, request_id: r4.id,
          rating: 5, comment: 'Increíble! Lucía lloró de la emoción. Super recomendado.',
          reviewer_name: 'Ana Martínez',
        });
      }

      if (r1) {
        await supabase.from('star2fan_notifications').insert([
          { creator_id: user.id, type: 'new_request', title: '🎬 Nueva Solicitud', message: 'Martín López quiere un video para Sofía (cumpleaños).', related_request_id: r1.id },
        ]);
      }
      if (r2) {
        await supabase.from('star2fan_notifications').insert([
          { creator_id: user.id, type: 'urgent_request', title: '🔴 Pedido Urgente!', message: 'Laura García necesita un video urgente para Pedro (aniversario).', related_request_id: r2.id },
        ]);
      }
      await supabase.from('star2fan_notifications').insert([
        { creator_id: user.id, type: 'payout_released', title: '💰 Pago Liberado', message: 'Se liberaron $48.00 del pedido de Ana Martínez.' },
        { creator_id: user.id, type: 'new_review', title: '⭐ Nueva Reseña', message: 'Ana Martínez te dejó 5 estrellas!' },
      ]);

      await fetchDashboardData();
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (requestId: string, status: string) => {
    try {
      const updates: any = { status };
      if (status === 'delivered') updates.delivered_at = new Date().toISOString();
      const { error } = await supabase.from('star2fan_requests').update(updates).eq('id', requestId);
      if (!error) {
        setRequests(prev => prev.map(r => r.id === requestId ? { ...r, ...updates } : r));
        if (selectedRequest?.id === requestId) setSelectedRequest((prev: any) => ({ ...prev, ...updates }));
      }
    } catch (err) { console.error(err); }
  };

  const handleUploadVideo = async (requestId: string, file: File) => {
    console.log('Uploading video for', requestId, file.name);
    try {
       const fileExt = file.name.split('.').pop();
       const fileName = `${requestId}_${Date.now()}.${fileExt}`;
       const filePath = `requests/${user?.id}/${fileName}`;

       const { error: uploadError } = await supabase.storage
         .from('private-videos')
         .upload(filePath, file);

       if (uploadError) throw uploadError;

       const { data: videoData, error: dbError } = await supabase
         .from('star2fan_request_videos')
         .insert({
           request_id: requestId,
           creator_id: user?.id,
           video_url: filePath,
           file_name: file.name,
           file_size: file.size,
           is_final: true
         })
         .select()
         .single();

       if (dbError) throw dbError;

       // Update request status to delivered and link final video
       await supabase.from('star2fan_deliveries').insert({
         request_id: requestId,
         creator_id: user?.id,
         final_video_url: filePath,
         delivery_status: 'delivered'
       });

       alert('¡Video subido y entregado con éxito!');
       fetchDashboardData();
    } catch (err: any) {
       console.error('Error uploading video:', err);
       alert(`Error al subir video: ${err.message}`);
    }
  };

  const handleSaveProfile = async (data: any) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('star2fan_creators').update(data).eq('id', user?.id);
      if (!error) setCreatorData((prev: any) => ({ ...prev, ...data }));
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  // Loading
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-rose-500 animate-spin" />
      </div>
    );
  }

  // Onboarding
  if (!creatorData) {
    return (
      <div className="flex-1 p-10 max-w-4xl mx-auto flex flex-col justify-center items-center text-center min-h-[60vh]">
        <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mb-6">
          <Video className="w-10 h-10 text-rose-500" />
        </div>
        <h1 className="text-3xl font-black text-gray-900 mb-2">Bienvenido a Star2Fan</h1>
        <p className="text-gray-500 mb-8 max-w-md">Conectá con tus fans a través de saludos personalizados en video. Configurá tu perfil, poné tu precio y empezá a ganar.</p>
        <button onClick={handleInitialize}
          className="bg-rose-600 text-white px-10 py-4 rounded-full font-black hover:bg-rose-700 shadow-xl transition-all hover:scale-105 hover:shadow-2xl">
          Inicializar Mi Perfil de Creador
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {activeTab === 'overview' && (
        <S2FOverview creatorData={creatorData} requests={requests} earnings={earnings}
          reviews={reviews} notifications={notifications}
          onSelectRequest={setSelectedRequest} onChangeTab={setActiveTab} />
      )}
      {activeTab === 'requests' && (
        <S2FRequests requests={requests} selectedRequest={selectedRequest}
          onSelectRequest={setSelectedRequest} onUpdateStatus={handleUpdateStatus}
          onUploadVideo={handleUploadVideo} />
      )}
      {activeTab === 'history' && (
        <S2FHistory requests={requests} onSelectRequest={setSelectedRequest} onChangeTab={setActiveTab} />
      )}
      {activeTab === 'earnings' && (
        <S2FEarnings earnings={earnings} requests={requests} />
      )}
      {activeTab === 'profile' && (
        <S2FProfile creatorData={creatorData} onSave={handleSaveProfile} saving={saving} />
      )}
      {activeTab === 'reviews' && (
        <S2FReviews reviews={reviews} requests={requests} />
      )}
      {activeTab === 'support' && (
        <S2FSupport />
      )}
    </div>
  );
}
