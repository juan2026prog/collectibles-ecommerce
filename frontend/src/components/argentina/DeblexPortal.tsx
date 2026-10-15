import React, { useState } from 'react';
import { Package, Search, Download, AlertTriangle, CheckCircle, FileSpreadsheet, ShieldAlert, ArrowUpDown, Filter } from 'lucide-react';
import { downloadDeblexExcel, DeblexExportRow } from '../../lib/argentina/excelExporter';

export interface DeblexAdminPackage {
  id: string;
  order_number: string;
  original_tracking_number: string;
  carrier: string;
  recipient_document: string;
  recipient_name: string;
  product_title: string;
  units: number;
  fob_usd: number;
  confirmed_weight_kg?: number;
  estimated_weight_kg: number;
  package_status: string;
  deblex_guide_number?: string;
  consolidation_id?: string;
  created_at: string;
}

interface DeblexPortalProps {
  packages: DeblexAdminPackage[];
  onUpdateStatus?: (packageId: string, newStatus: string, confirmedWeight?: number, guideNumber?: string) => Promise<void>;
}

export const DeblexPortal: React.FC<DeblexPortalProps> = ({ packages, onUpdateStatus }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedPackage, setSelectedPackage] = useState<DeblexAdminPackage | null>(null);
  const [modalWeight, setModalWeight] = useState<string>('');
  const [modalGuide, setModalGuide] = useState<string>('');
  const [modalStatus, setModalStatus] = useState<string>('RECIBIDO_EN_DEPOSITO');
  const [isUpdating, setIsUpdating] = useState(false);

  const filteredPackages = packages.filter(p => {
    const matchesSearch =
      p.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.original_tracking_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.recipient_document?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.recipient_name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || p.package_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleExportExcel = () => {
    const exportRows: DeblexExportRow[] = filteredPackages.map(p => ({
      pedido_collectibles: p.order_number || '',
      tracking_original: p.original_tracking_number || '',
      tipo_documento: 'CUIT/CUIL',
      numero_documento: p.recipient_document || '',
      nombre_destinatario: p.recipient_name || '',
      producto: p.product_title || '',
      cantidad: p.units || 1,
      valor_fob_usd: p.fob_usd,
      peso_kg: p.confirmed_weight_kg || p.estimated_weight_kg,
      id_paquete: p.id,
      codigo_consolidacion: p.consolidation_id || '',
      estado_paquete: p.package_status,
      fecha_registro: p.created_at,
      referencia_logistica: `AR-${p.recipient_document || 'UNASSIGNED'}`,
    }));

    downloadDeblexExcel(exportRows);
  };

  const openStatusModal = (pkg: DeblexAdminPackage) => {
    setSelectedPackage(pkg);
    setModalWeight(String(pkg.confirmed_weight_kg || pkg.estimated_weight_kg || '0.50'));
    setModalGuide(pkg.deblex_guide_number || '');
    setModalStatus(pkg.package_status);
  };

  const handleSaveStatus = async () => {
    if (!selectedPackage || !onUpdateStatus) return;
    setIsUpdating(true);
    try {
      const weightNum = parseFloat(modalWeight) || selectedPackage.estimated_weight_kg;
      await onUpdateStatus(selectedPackage.id, modalStatus, weightNum, modalGuide);
      setSelectedPackage(null);
    } catch (err) {
      console.error('Error actualizando paquete Deblex:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const pendingIdentificationCount = packages.filter(p => p.package_status === 'PENDIENTE_IDENTIFICACION').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-gray-700/60 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-amber-400" />
            Portal de Operaciones Deblex (Suite Central Miami)
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Recepción, identificación por CUIT, pesaje y despacho de paquetes en 2301 NW 107th AVE Ste #102 DAR101334.
          </p>
        </div>

        <button
          onClick={handleExportExcel}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-600/20"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Exportar Manifiesto Excel
        </button>
      </div>

      {pendingIdentificationCount > 0 && (
        <div className="p-4 bg-amber-950/40 border border-amber-800/80 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <span className="text-sm font-bold text-amber-200">
                {pendingIdentificationCount} paquete(s) pendientes de identificación
              </span>
              <p className="text-xs text-amber-300/80 mt-0.5">
                No asignar paquetes automáticamente por coincidencia parcial. Se requiere verificación documental de CUIT.
              </p>
            </div>
          </div>
          <button
            onClick={() => setStatusFilter('PENDIENTE_IDENTIFICACION')}
            className="px-3 py-1.5 bg-amber-500 text-gray-950 text-xs font-bold rounded-lg hover:bg-amber-400"
          >
            Filtrar no identificados
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por Pedido, Tracking Amazon, CUIT o Comprador..."
            className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500"
        >
          <option value="ALL">Todos los Estados</option>
          <option value="EN_TRANSITO_A_MIAMI">En Tránsito a Miami</option>
          <option value="RECIBIDO_EN_DEPOSITO">Recibido en Depósito</option>
          <option value="DISPONIBLE_PARA_CONSOLIDAR">Disponible para Consolidar</option>
          <option value="PENDIENTE_IDENTIFICACION">Pendiente Identificación</option>
          <option value="CONSOLIDACION_CERRADA">Consolidación Cerrada</option>
          <option value="EN_DESPACHO">En Despacho</option>
          <option value="EN_ADUANA">En Aduana</option>
          <option value="ENTREGADO">Entregado</option>
          <option value="INCIDENCIA">Incidencia</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-700/60 bg-gray-800/40">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-900/80 text-gray-400 border-b border-gray-700/60 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="p-3">Pedido / Tracking Amazon</th>
              <th className="p-3">Destinatario / CUIT</th>
              <th className="p-3">Producto</th>
              <th className="p-3">Peso Facturable</th>
              <th className="p-3">FOB USD</th>
              <th className="p-3">Estado</th>
              <th className="p-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/40 text-gray-300">
            {filteredPackages.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500">
                  No se encontraron paquetes con los filtros aplicados.
                </td>
              </tr>
            ) : (
              filteredPackages.map(pkg => (
                <tr key={pkg.id} className="hover:bg-gray-700/20">
                  <td className="p-3 font-mono">
                    <strong className="text-white block">{pkg.order_number || 'S/N'}</strong>
                    <span className="text-gray-400 text-[11px]">{pkg.original_tracking_number || 'Pendiente'}</span>
                  </td>
                  <td className="p-3">
                    <span className="text-white font-medium block">{pkg.recipient_name || 'Sin Asignar'}</span>
                    <span className="font-mono text-gray-400 text-[11px]">
                      {pkg.recipient_document ? `CUIT ${pkg.recipient_document}` : 'PENDIENTE CUIT'}
                    </span>
                  </td>
                  <td className="p-3 max-w-[200px] truncate" title={pkg.product_title}>
                    {pkg.product_title}
                  </td>
                  <td className="p-3 font-semibold text-white">
                    {pkg.confirmed_weight_kg ? (
                      <span className="text-emerald-400">{pkg.confirmed_weight_kg.toFixed(2)} kg (Confirmado)</span>
                    ) : (
                      <span className="text-gray-400">{pkg.estimated_weight_kg.toFixed(2)} kg (Est.)</span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-white">USD {pkg.fob_usd.toFixed(2)}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      pkg.package_status === 'PENDIENTE_IDENTIFICACION'
                        ? 'bg-red-950 text-red-300 border border-red-800'
                        : pkg.package_status === 'RECIBIDO_EN_DEPOSITO' || pkg.package_status === 'DISPONIBLE_PARA_CONSOLIDAR'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-gray-700 text-gray-300'
                    }`}>
                      {pkg.package_status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => openStatusModal(pkg)}
                      className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-[11px] font-medium"
                    >
                      Gestionar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal for Status & Weight Update */}
      {selectedPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-bold text-white">Gestionar Paquete Deblex</h3>
            <p className="text-xs text-gray-400">
              {selectedPackage.order_number} — Tracking: {selectedPackage.original_tracking_number}
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-400 mb-1">Estado Operativo</label>
                <select
                  value={modalStatus}
                  onChange={e => setModalStatus(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg p-2 focus:outline-none focus:border-amber-500"
                >
                  <option value="RECIBIDO_EN_DEPOSITO">RECIBIDO_EN_DEPOSITO</option>
                  <option value="DISPONIBLE_PARA_CONSOLIDAR">DISPONIBLE_PARA_CONSOLIDAR</option>
                  <option value="PENDIENTE_IDENTIFICACION">PENDIENTE_IDENTIFICACION</option>
                  <option value="EN_DESPACHO">EN_DESPACHO</option>
                  <option value="EN_TRANSITO">EN_TRANSITO</option>
                  <option value="EN_ADUANA">EN_ADUANA</option>
                  <option value="ENTREGADO">ENTREGADO</option>
                  <option value="INCIDENCIA">INCIDENCIA</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Peso Confirmado por Deblex (kg)</label>
                <input
                  type="number"
                  step="0.05"
                  value={modalWeight}
                  onChange={e => setModalWeight(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg p-2 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Número de Guía Deblex (Opcional)</label>
                <input
                  type="text"
                  value={modalGuide}
                  onChange={e => setModalGuide(e.target.value)}
                  placeholder="Ej: DBLX-AR-998811"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg p-2 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-800">
              <button
                onClick={() => setSelectedPackage(null)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveStatus}
                disabled={isUpdating}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-xs rounded-lg disabled:opacity-50"
              >
                {isUpdating ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
