import React from 'react';
import { Truck, CheckCircle2, Clock, MapPin, FileText, ChevronRight, AlertCircle, Layers } from 'lucide-react';

export interface MyShipmentItem {
  id: string;
  tracking_number: string;
  carrier_guide?: string;
  type: 'INDIVIDUAL' | 'CONSOLIDATED';
  consolidation_code?: string;
  package_count: number;
  total_fob_usd: number;
  total_weight_kg: number;
  status: string;
  destination_city: string;
  destination_province: string;
  created_at: string;
  dispatched_at?: string;
  delivered_at?: string;
  history?: Array<{
    date: string;
    status: string;
    description: string;
  }>;
}

interface MyShipmentsTabProps {
  shipments: MyShipmentItem[];
}

export const MyShipmentsTab: React.FC<MyShipmentsTabProps> = ({ shipments }) => {
  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-gray-700/60">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Truck className="w-5 h-5 text-sky-400" />
          Mis Envíos Internacionales (Deblex)
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Seguí el estado de tus despachos individuales y consolidados desde Miami hasta tu domicilio en Argentina.
        </p>
      </div>

      {shipments.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/40 border border-gray-700/40 rounded-xl">
          <Truck className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-300">No tenés envíos en tránsito</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
            Los despachos cerrados e individuales aparecerán aquí con su número de guía de Deblex y seguimiento punto a punto.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {shipments.map(shipment => (
            <div
              key={shipment.id}
              className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-5 hover:border-gray-600 transition-all space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-700/40 gap-2">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 ${
                    shipment.type === 'CONSOLIDATED'
                      ? 'bg-purple-950/80 text-purple-300 border border-purple-800'
                      : 'bg-sky-950/80 text-sky-300 border border-sky-800'
                  }`}>
                    {shipment.type === 'CONSOLIDATED' ? <Layers className="w-3.5 h-3.5" /> : <Truck className="w-3.5 h-3.5" />}
                    {shipment.type === 'CONSOLIDATED' ? `Consolidado (${shipment.package_count} paquetes)` : 'Envío Individual'}
                  </span>
                  <span className="font-mono text-xs text-gray-300">
                    Guía Deblex: <strong className="text-white">{shipment.carrier_guide || 'Por asignar'}</strong>
                  </span>
                </div>

                <span className={`text-xs px-3 py-1 rounded-full font-medium self-start sm:self-auto ${
                  shipment.status === 'ENTREGADO'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : shipment.status === 'EN_TRANSITO'
                    ? 'bg-sky-950 text-sky-300 border border-sky-800'
                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                }`}>
                  {shipment.status.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-gray-500 block text-[10px]">Destino</span>
                  <span className="font-semibold text-gray-200">
                    {shipment.destination_city}, {shipment.destination_province}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[10px]">FOB Total</span>
                  <span className="font-semibold text-white">USD {shipment.total_fob_usd.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[10px]">Peso Facturable</span>
                  <span className="font-semibold text-white">{shipment.total_weight_kg.toFixed(2)} kg</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[10px]">Fecha de Despacho</span>
                  <span className="font-semibold text-gray-300">
                    {shipment.dispatched_at ? new Date(shipment.dispatched_at).toLocaleDateString() : 'En preparación'}
                  </span>
                </div>
              </div>

              {shipment.history && shipment.history.length > 0 && (
                <div className="bg-gray-900/60 p-3 rounded-lg border border-gray-700/40 space-y-2">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">
                    Historial de Seguimiento
                  </span>
                  <div className="space-y-1.5">
                    {shipment.history.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs">
                        <Clock className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
                        <span className="text-gray-400 font-mono text-[11px] shrink-0">{step.date}:</span>
                        <span className="text-gray-200">{step.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
