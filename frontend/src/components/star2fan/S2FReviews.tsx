import { Star, ThumbsUp, Clock, CheckCircle, TrendingUp } from 'lucide-react';

interface Props {
  reviews: any[];
  requests: any[];
}

export default function S2FReviews({ reviews, requests }: Props) {
  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) : 0;
  const totalDelivered = requests.filter(r => ['delivered', 'completed'].includes(r.status)).length;
  const totalAccepted = requests.filter(r => !['rejected', 'cancelled'].includes(r.status)).length;
  const totalRequests = requests.length;
  const acceptRate = totalRequests > 0 ? ((totalAccepted / totalRequests) * 100).toFixed(0) : '—';

  const onTimeDelivered = requests.filter(r => r.delivered_at && r.delivery_deadline && new Date(r.delivered_at) <= new Date(r.delivery_deadline)).length;
  const onTimeRate = totalDelivered > 0 ? ((onTimeDelivered / totalDelivered) * 100).toFixed(0) : '—';

  const deliveredWithTime = requests.filter(r => r.delivered_at && (r.purchase_date || r.created_at));
  const avgDeliveryHours = deliveredWithTime.length > 0
    ? Math.round(deliveredWithTime.reduce((s, r) => s + (new Date(r.delivered_at).getTime() - new Date(r.purchase_date || r.created_at).getTime()) / 3600000, 0) / deliveredWithTime.length)
    : 0;

  const ratingDistribution = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews.filter(r => r.rating === star).length,
    pct: reviews.length > 0 ? (reviews.filter(r => r.rating === star).length / reviews.length) * 100 : 0,
  }));

  return (
    <div className="space-y-6 max-w-5xl">
      <h2 className="text-3xl font-black text-gray-900 tracking-tight">Reputación & Reseñas</h2>

      {/* Top Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Star} label="Rating Promedio" value={avgRating > 0 ? avgRating.toFixed(1) : '—'} sub={`${reviews.length} reseñas`} color="yellow" />
        <StatCard icon={ThumbsUp} label="Tasa Aceptación" value={`${acceptRate}%`} sub={`${totalAccepted}/${totalRequests}`} color="green" />
        <StatCard icon={CheckCircle} label="Entrega a Tiempo" value={`${onTimeRate}%`} sub={`${onTimeDelivered}/${totalDelivered}`} color="blue" />
        <StatCard icon={Clock} label="Tiempo Prom. Entrega" value={avgDeliveryHours > 0 ? `${avgDeliveryHours}h` : '—'} sub="promedio" color="purple" />
        <StatCard icon={TrendingUp} label="Videos Entregados" value={String(totalDelivered)} sub="total" color="rose" />
      </div>

      {/* Two columns: Distribution + Comments */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rating Distribution */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-base font-black text-gray-900 mb-5">Distribución de Ratings</h3>
          <div className="space-y-3">
            {ratingDistribution.map(d => (
              <div key={d.star} className="flex items-center gap-3">
                <span className="text-sm font-black text-gray-600 w-8">{d.star}★</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${d.pct}%` }}></div>
                </div>
                <span className="text-sm font-bold text-gray-500 w-8 text-right">{d.count}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <p className="text-5xl font-black text-gray-900">{avgRating > 0 ? avgRating.toFixed(1) : '—'}</p>
            <div className="flex justify-center gap-0.5 mt-2">
              {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} className={`w-5 h-5 ${s <= Math.round(avgRating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">{reviews.length} opiniones</p>
          </div>
        </div>

        {/* Reviews List */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gray-50">
            <h3 className="text-base font-black text-gray-900">Opiniones de Fans</h3>
          </div>
          <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
            {reviews.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">Aún no tenés reseñas.</div>}
            {reviews.map(r => (
              <div key={r.id} className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm font-black text-gray-900">{r.reviewer_name || 'Fan'}</p>
                    <p className="text-[10px] text-gray-400">{new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={`w-4 h-4 ${s <= r.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
                    ))}
                  </div>
                </div>
                {r.comment && <p className="text-sm text-gray-600 leading-relaxed">"{r.comment}"</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub: string; color: string }) {
  const colors: Record<string, string> = {
    yellow: 'bg-yellow-50 text-yellow-600', green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600', purple: 'bg-purple-50 text-purple-600',
    rose: 'bg-rose-50 text-rose-600',
  };
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${colors[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-xl font-black text-gray-900">{value}</p>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{label}</p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </div>
  );
}
