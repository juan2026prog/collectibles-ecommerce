import React from 'react';
import type { UserImportShipment, LogisticsTrackingStatus } from '../../plugins/collector-import-hub/types';
import { Package, Truck, CheckCircle2, Clock, AlertCircle, MapPin, ExternalLink } from 'lucide-react';

interface Props {
  shipments: UserImportShipment[];
}

const STAGES: { key: LogisticsTrackingStatus; label: string }[] = [
  { key: 'ORDER_CONFIRMED', label: 'Pedido Confirmado' },
  { key: 'SHIPPED_TO_USA_COURIER', label: 'En camino a Casillero Miami' },
  { key: 'RECEIVED_AT_USA_COURIER', label: 'Recibido en Miami' },
  { key: 'IN_INTERNATIONAL_TRANSIT', label: 'Tránsito Internacional' },
  { key: 'ARRIVED_IN_URUGUAY', label: 'Arribo a Uruguay' },
  { key: 'CUSTOMS_PROCESSING', label: 'Proceso Aduanero' },
  { key: 'CUSTOMS_CLEARED', label: 'Liberado por Aduana' },
  { key: 'IN_LOCAL_DISTRIBUTION', label: 'En Reparto Local' },
  { key: 'DELIVERED', label: 'Entregado' }
];

export const MyShipmentsSection: React.FC<Props> = ({ shipments }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
          <Truck className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Seguimiento de Envíos & Tracking</h2>
          <p className="text-xs text-slate-400">
            Monitorea el avance logístico internacional etapa por etapa desde Miami hasta tu domicilio.
          </p>
        </div>
      </div>

      {shipments.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
          No tienes envíos internacionales activos en este momento.
        </div>
      ) : (
        <div className="space-y-6">
          {shipments.map((shipment) => {
            const currentIdx = STAGES.findIndex(s => s.key === shipment.current_status);

            return (
              <div
                key={shipment.id}
                className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-white text-base">{shipment.title}</h4>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      <span>Courier: <strong className="text-slate-300">{shipment.courier_name}</strong></span>
                      {shipment.tracking_code && (
                        <span>• Tracking: <strong className="text-amber-400 font-mono">{shipment.tracking_code}</strong></span>
                      )}
                    </div>
                  </div>

                  {shipment.estimated_delivery && (
                    <div className="text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
                      Entrega Estimada: <strong className="text-amber-400">{shipment.estimated_delivery}</strong>
                    </div>
                  )}
                </div>

                <div className="py-2">
                  <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2 text-center text-[10px]">
                    {STAGES.map((st, idx) => {
                      const isPast = idx < currentIdx;
                      const isCurrent = idx === currentIdx;

                      return (
                        <div key={st.key} className="flex flex-col items-center">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold mb-1 ${
                              isCurrent
                                ? 'bg-amber-500 text-slate-950 ring-4 ring-amber-500/20 animate-pulse'
                                : isPast
                                ? 'bg-emerald-500 text-slate-950'
                                : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            {isPast ? '✓' : idx + 1}
                          </div>
                          <span className={`line-clamp-2 ${isCurrent ? 'text-amber-400 font-bold' : isPast ? 'text-slate-300' : 'text-slate-600'}`}>
                            {st.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {shipment.last_checkpoint_detail && (
                  <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80 text-xs flex items-center justify-between text-slate-400">
                    <div>
                      Última actualización: <span className="text-white">{shipment.last_checkpoint_detail}</span>
                    </div>
                    {shipment.last_checkpoint_at && (
                      <span className="text-[10px] text-slate-500">{shipment.last_checkpoint_at}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
