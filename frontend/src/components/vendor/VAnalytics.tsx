import { BarChart3, TrendingUp, TrendingDown, ShoppingCart, Package, MapPin } from 'lucide-react';

const data = {
  salesByDay: [
    { day: 'Lun', amount: 12400 }, { day: 'Mar', amount: 18900 }, { day: 'Mie', amount: 15200 },
    { day: 'Jue', amount: 22100 }, { day: 'Vie', amount: 28400 }, { day: 'Sab', amount: 19800 }, { day: 'Dom', amount: 8200 },
  ],
  topProducts: [
    { name: 'Jean Slim Fit Premium', sold: 45, revenue: 220050 },
    { name: 'Remera Oversize Urban', sold: 38, revenue: 75620 },
    { name: 'Zapatillas Runner X', sold: 22, revenue: 142780 },
    { name: 'Campera Puffer Light', sold: 18, revenue: 161820 },
    { name: 'Gorra Snapback Classic', sold: 15, revenue: 14850 },
  ],
  topZones: [
    { zone: 'Zona 6 (Centro/Pocitos)', orders: 45, pct: 35 },
    { zone: 'Zona 5 (Carrasco/Malvín)', orders: 28, pct: 22 },
    { zone: 'Zona 7 (Prado/La Teja)', orders: 18, pct: 14 },
    { zone: 'Zona 10 (Costa)', orders: 15, pct: 12 },
    { zone: 'Interior', orders: 12, pct: 9 },
  ],
  deadStock: [
    { name: 'Bufanda Lana Merino', sku: 'BUF-001', lastSale: '15/01/2026', stock: 34 },
    { name: 'Cinturón Cuero Classic', sku: 'CIN-002', lastSale: '28/02/2026', stock: 12 },
  ],
  kpis: { avgTicket: 3240, cancellations: 3, returns: 1, conversionRate: 4.2, totalOrders: 128 },
};

export default function VAnalytics() {
  const max = Math.max(...data.salesByDay.map(d => d.amount));

  return (
    <div className="max-w-7xl space-y-8 animation-fade-in pb-20">
      <div>
         <div className="text-[11px] text-[#f00856] font-black uppercase tracking-[0.4em] mb-3">Intelligence Hub</div>
         <h2 className="text-5xl font-black text-white">Análisis de Desempeño</h2>
         <p className="text-sm text-slate-500 font-bold mt-3 uppercase tracking-[0.2em]">Métricas críticas de conversión y optimización de catálogo</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat label="Total Orders" value={data.kpis.totalOrders} />
        <Stat label="Avg Ticket" value={`$${data.kpis.avgTicket.toLocaleString()}`} />
        <Stat label="Cancellations" value={data.kpis.cancellations} />
        <Stat label="Returns" value={data.kpis.returns} />
        <Stat label="Conv. Rate" value={`${data.kpis.conversionRate}%`} />
      </div>

      {/* Sales Chart */}
      <div className="glass rounded-[2.5rem] border border-white/10 p-12 group hover:bg-white/[0.04] transition-all shadow-2xl">
        <div className="flex justify-between items-center mb-12">
           <div className="flex items-center gap-6">
              <div className="w-12 h-12 rounded-2xl bg-[#f00856]/10 flex items-center justify-center shadow-[0_0_20px_rgba(240,8,86,0.1)]">
                 <BarChart3 className="w-6 h-6 text-[#f00856]" />
              </div>
              <div>
                 <h3 className="text-[11px] font-black text-[#f00856] uppercase tracking-[0.4em] mb-1">Revenue Stream</h3>
                 <h4 className="text-2xl font-black text-white uppercase tracking-widest">Ventas Diarias (Última Semana)</h4>
              </div>
           </div>
           <div className="text-right">
              <p className="text-4xl font-black text-white group-hover:text-[#f00856] transition-colors">$153,000</p>
              <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest mt-2 flex items-center justify-end gap-2">
                <TrendingUp className="w-4 h-4" /> 12.4% vs last period
              </p>
           </div>
        </div>
        <div className="flex items-end gap-3 h-72">
          {data.salesByDay.map(d => (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-6 group/bar">
              <span className="text-[11px] font-black text-slate-700 group-hover/bar:text-white transition-colors uppercase tracking-widest">${(d.amount / 1000).toFixed(0)}k</span>
              <div className="w-full bg-white/5 relative rounded-xl group-hover/bar:border-[#f00856]/30 transition-all overflow-hidden border border-white/5" style={{ height: `${(d.amount / max) * 100}%` }}>
                <div className="absolute inset-0 bg-gradient-to-t from-[#f00856] to-[#ff2c68] opacity-80 transform translate-y-full group-hover/bar:translate-y-0 transition-transform duration-700 ease-out shadow-[0_0_40px_rgba(240,8,86,0.2)]"></div>
                <div className="absolute inset-0 bg-white/5 group-hover/bar:opacity-0 transition-opacity"></div>
              </div>
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest group-hover/bar:text-white transition-colors">{d.day}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Products */}
        <div className="glass rounded-[2rem] border border-white/10 overflow-hidden shadow-2xl">
          <div className="p-10 border-b border-white/5 bg-white/[0.03] flex items-center gap-6">
             <div className="w-10 h-10 rounded-xl bg-[#f00856]/10 flex items-center justify-center">
                <Package className="w-5 h-5 text-[#f00856]" />
             </div>
             <h3 className="text-[11px] font-black text-white uppercase tracking-[0.4em]">Top Selling Assets</h3>
          </div>
          <div className="divide-y divide-white/5">
            {data.topProducts.map((p, i) => (
              <div key={p.name} className="p-8 flex items-center gap-8 hover:bg-white/[0.02] transition-colors group">
                <span className="text-3xl font-black text-slate-800 group-hover:text-[#f00856] transition-colors w-10">0{i + 1}</span>
                <div className="flex-1">
                   <p className="text-lg font-black text-white uppercase tracking-widest group-hover:translate-x-3 transition-transform">{p.name}</p>
                   <p className="text-[11px] text-slate-600 font-black uppercase tracking-widest mt-2">{p.sold} units displaced</p>
                </div>
                <span className="font-black text-xl text-white group-hover:text-emerald-500 transition-colors tracking-tighter">${p.revenue.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Zones */}
        <div className="glass rounded-[2rem] border border-white/10 overflow-hidden shadow-2xl">
          <div className="p-10 border-b border-white/5 bg-white/[0.03] flex items-center gap-6">
             <div className="w-10 h-10 rounded-xl bg-[#f00856]/10 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-[#f00856]" />
             </div>
             <h3 className="text-[11px] font-black text-white uppercase tracking-[0.4em]">Regional Density</h3>
          </div>
          <div className="divide-y divide-white/5">
            {data.topZones.map(z => (
              <div key={z.zone} className="p-8 flex items-center gap-10 hover:bg-white/[0.02] transition-colors group">
                <div className="flex-1">
                   <p className="text-lg font-black text-white uppercase tracking-widest group-hover:translate-x-3 transition-transform">{z.zone}</p>
                   <p className="text-[11px] text-slate-600 font-black uppercase tracking-widest mt-2">{z.orders} total orders</p>
                </div>
                <div className="w-48">
                   <div className="flex justify-between items-center mb-3">
                      <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{z.pct}%</span>
                   </div>
                   <div className="w-full h-2 bg-white/5 rounded-full border border-white/5 overflow-hidden shadow-inner">
                      <div className="h-full bg-gradient-to-r from-[#f00856] to-[#ff2c68] rounded-full group-hover:scale-x-110 transition-transform origin-left shadow-[0_0_15px_rgba(240,8,86,0.3)]" style={{ width: `${z.pct}%` }}></div>
                   </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dead Stock */}
      <div className="glass rounded-[2rem] border border-[#f00856]/30 bg-[#f00856]/5 p-12 group hover:bg-[#f00856]/10 transition-all shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
           <TrendingDown className="w-48 h-48 text-white -rotate-12" />
        </div>
        <div className="flex items-center gap-6 mb-12 relative z-10">
           <div className="w-16 h-16 rounded-2xl bg-[#f00856]/20 flex items-center justify-center border border-[#f00856]/30 shadow-[0_0_30px_rgba(240,8,86,0.2)]">
              <TrendingDown className="w-8 h-8 text-[#f00856]" />
           </div>
           <div>
              <h3 className="text-[11px] font-black text-[#f00856] uppercase tracking-[0.4em] mb-1">Stock Warning</h3>
              <h4 className="text-2xl font-black text-white uppercase tracking-widest">Inventory Stagnation / Dead Stock</h4>
           </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
          {data.deadStock.map(d => (
            <div key={d.sku} className="soft rounded-[1.5rem] p-8 border border-white/10 bg-black/60 flex justify-between items-center group-hover:border-[#f00856]/40 transition-all hover:scale-[1.02] shadow-xl">
              <div>
                 <span className="text-lg font-black text-white uppercase tracking-widest">{d.name}</span>
                 <p className="text-[11px] text-slate-500 font-black uppercase tracking-widest mt-2 bg-white/5 px-2 py-1 rounded inline-block">Ref: {d.sku}</p>
              </div>
              <div className="text-right">
                 <p className="text-lg text-[#f00856] font-black uppercase tracking-tighter">Stock: {d.stock}</p>
                 <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest mt-2">Last activity: {d.lastSale}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="soft rounded-3xl p-10 group hover:bg-white/[0.04] transition-all border border-white/5 hover:border-[#f00856]/30 shadow-xl">
      <p className="text-3xl font-black text-white group-hover:text-[#f00856] transition-colors mb-4 tracking-tighter">{value}</p>
      <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em]">{label}</p>
    </div>
  );
}
