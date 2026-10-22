import React, { useState } from 'react';
import { 
  Package, Search, Download, AlertTriangle, CheckCircle, FileSpreadsheet, 
  ArrowUpDown, Filter, ChevronDown, ChevronRight, Edit3, Plus, Trash2, 
  RotateCcw, RefreshCw, Eye, FileText, Check, X, ShieldAlert, Upload, Layers 
} from 'lucide-react';
import { downloadDeblexExcel, DeblexExportRow } from '../../lib/argentina/excelExporter';
import { supabase } from '../../lib/supabase';

export interface DeblexPackageDocument {
  id: string;
  package_id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  file_size?: number;
  mime_type: string;
  uploaded_by?: string;
  uploader_email?: string;
  status: string;
  deletion_reason?: string;
  replaced_by_id?: string;
  replacement_reason?: string;
  created_at: string;
  updated_at: string;
}

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
  is_available_for_consolidation?: boolean;
  user_id?: string;
  created_at: string;
  dispatched_at?: string;
  delivered_at?: string;
  argentina_package_documents?: DeblexPackageDocument[];
}

export interface DeblexConsolidation {
  id: string;
  consolidation_code: string;
  legacy_consolidation_code?: string;
  user_id: string;
  recipient_document: string;
  recipient_name: string;
  destination_zone: string;
  package_count: number;
  total_fob_usd: number;
  total_weight_kg: number;
  freight_usd: number;
  single_logistic_pack_usd: number;
  total_calculated_logistics_usd: number;
  total_previous_logistics_paid_usd: number;
  net_difference_usd: number;
  status: string;
  version?: number;
  deblex_master_guide?: string;
  confirmed_at: string;
  dispatched_at?: string;
  delivered_at?: string;
  created_at: string;
}

export interface ConsolidationHistoryItem {
  id: string;
  action: string;
  performer_email?: string;
  reason: string;
  version_number: number;
  created_at: string;
  snapshot_data: any;
  financial_delta_usd?: number;
}

interface DeblexPortalProps {
  packages: DeblexAdminPackage[];
  consolidations: DeblexConsolidation[];
  userRole: 'deblex_admin' | 'deblex_operator';
  onRefreshData: () => Promise<void>;
  onShowToast: (msg: string) => void;
}

export const DeblexPortal: React.FC<DeblexPortalProps> = ({
  packages,
  consolidations,
  userRole,
  onRefreshData,
  onShowToast,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INDIVIDUAL' | 'CONSOLIDATED'>('ALL');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Edit consolidation modal state
  const [editingConsolidation, setEditingConsolidation] = useState<DeblexConsolidation | null>(null);
  const [editPackageIds, setEditPackageIds] = useState<string[]>([]);
  const [editWeights, setEditWeights] = useState<Record<string, string>>({});
  const [editZone, setEditZone] = useState<string>('CABA');
  const [editReason, setEditReason] = useState<string>('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Undo modal state
  const [undoConsolidation, setUndoConsolidation] = useState<DeblexConsolidation | null>(null);
  const [undoReason, setUndoReason] = useState<string>('');
  const [undoSubmitting, setUndoSubmitting] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);

  // History modal state
  const [historyConsolidation, setHistoryConsolidation] = useState<DeblexConsolidation | null>(null);
  const [historyItems, setHistoryItems] = useState<ConsolidationHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Status change loading
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  // Multi-selection for manual consolidation
  const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createZone, setCreateZone] = useState<string>('CABA');
  const [createReason, setCreateReason] = useState<string>('Consolidación manual operativa Deblex');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Invoices management modals
  const [uploadInvoicePkg, setUploadInvoicePkg] = useState<DeblexAdminPackage | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoiceDocType, setInvoiceDocType] = useState<string>('COMMERCIAL_INVOICE');
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const [substituteDoc, setSubstituteDoc] = useState<DeblexPackageDocument | null>(null);
  const [substituteFile, setSubstituteFile] = useState<File | null>(null);
  const [substituteReason, setSubstituteReason] = useState<string>('');
  const [substituteSubmitting, setSubstituteSubmitting] = useState(false);
  const [substituteError, setSubstituteError] = useState<string | null>(null);

  const [deleteDoc, setDeleteDoc] = useState<DeblexPackageDocument | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    const next = new Set(expandedRows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedRows(next);
  };

  // Group standalone packages (not consolidated)
  const standalonePackages = packages.filter(p => !p.consolidation_id);

  // Build combined shipment records for table view
  const shipmentRecords = [
    // Consolidated shipments
    ...consolidations.map(c => {
      const childPackages = packages.filter(p => p.consolidation_id === c.id);
      return {
        id: c.id,
        code: c.consolidation_code,
        legacyCode: c.legacy_consolidation_code,
        isConsolidation: true as const,
        recipientName: c.recipient_name,
        recipientDoc: c.recipient_document,
        zone: c.destination_zone,
        weight: Number(c.total_weight_kg || 0),
        fob: Number(c.total_fob_usd || 0),
        freight: Number(c.freight_usd || 0),
        logisticPack: Number(c.single_logistic_pack_usd || 0),
        totalLogistics: Number(c.total_calculated_logistics_usd || 0),
        status: c.status,
        guide: c.deblex_master_guide,
        dispatchedAt: c.dispatched_at,
        deliveredAt: c.delivered_at,
        children: childPackages,
        rawConsolidation: c as DeblexConsolidation | undefined,
        rawPackage: undefined as DeblexAdminPackage | undefined,
      };
    }),
    // Individual standalone packages
    ...standalonePackages.map(p => {
      const weight = Number(p.confirmed_weight_kg || p.estimated_weight_kg || 0.5);
      const freight = weight * 19.0;
      const logisticPack = 20.0; // Default CABA reference for single display
      return {
        id: p.id,
        code: p.order_number || p.original_tracking_number || p.id.slice(0, 8),
        legacyCode: undefined,
        isConsolidation: false as const,
        recipientName: p.recipient_name || 'Comprador Argentina',
        recipientDoc: p.recipient_document || 'N/A',
        zone: 'CABA',
        weight,
        fob: Number(p.fob_usd || 0),
        freight,
        logisticPack,
        totalLogistics: freight + logisticPack,
        status: p.package_status,
        guide: p.deblex_guide_number,
        dispatchedAt: p.dispatched_at,
        deliveredAt: p.delivered_at,
        children: [p],
        rawConsolidation: undefined as DeblexConsolidation | undefined,
        rawPackage: p as DeblexAdminPackage | undefined,
      };
    })
  ];

  // Filtering
  const filteredRecords = shipmentRecords.filter(r => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch = !q || 
      r.code.toLowerCase().includes(q) ||
      (r.legacyCode && r.legacyCode.toLowerCase().includes(q)) ||
      r.recipientName.toLowerCase().includes(q) ||
      r.recipientDoc.toLowerCase().includes(q) ||
      (r.guide && r.guide.toLowerCase().includes(q)) ||
      r.children.some(c => 
        (c.original_tracking_number && c.original_tracking_number.toLowerCase().includes(q)) ||
        (c.product_title && c.product_title.toLowerCase().includes(q))
      );

    const matchesStatus = statusFilter === 'ALL' 
      ? (r.status !== 'CANCELLED') // Excluir consolidados anulados de la vista operativa normal
      : r.status === statusFilter;
    const matchesType = typeFilter === 'ALL' || 
      (typeFilter === 'CONSOLIDATED' && r.isConsolidation) ||
      (typeFilter === 'INDIVIDUAL' && !r.isConsolidation);

    return matchesSearch && matchesStatus && matchesType;
  });

  // Export CSV
  const handleExportCsv = () => {
    const headers = ['Tipo', 'Codigo / ID', 'Destinatario', 'Documento', 'Trackings', 'FOB USD', 'Peso kg', 'Flete USD', 'LP USD', 'Total Logistica USD', 'Guia Deblex', 'Estado'];
    const rows = filteredRecords.map(r => [
      r.isConsolidation ? 'Consolidado' : 'Individual',
      r.code,
      r.recipientName,
      r.recipientDoc,
      r.children.map(c => c.original_tracking_number || c.order_number).join(' | '),
      r.fob.toFixed(2),
      r.weight.toFixed(2),
      r.freight.toFixed(2),
      r.logisticPack.toFixed(2),
      r.totalLogistics.toFixed(2),
      r.guide || '',
      r.status
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `envios_deblex_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onShowToast('CSV de envíos exportado exitosamente.');
  };

  // Status transitions
  const handleStateChange = async (record: typeof shipmentRecords[0], newStatus: string) => {
    setUpdatingStatusId(record.id);
    try {
      const { data, error } = await supabase.rpc('deblex_set_shipment_status', {
        p_id: record.id,
        p_is_consolidation: record.isConsolidation,
        p_new_status: newStatus,
        p_reason: `Actualización manual de estado a ${newStatus} desde portal Deblex`
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'Error al actualizar estado');

      onShowToast(`Estado actualizado a: ${newStatus}`);
      await onRefreshData();
    } catch (err: any) {
      console.error('Error actualizando estado:', err);
      alert(err.message || 'Error al actualizar estado');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  // Open Edit Consolidation Modal
  const openEditModal = (cons: DeblexConsolidation) => {
    setEditingConsolidation(cons);
    const childs = packages.filter(p => p.consolidation_id === cons.id);
    setEditPackageIds(childs.map(c => c.id));
    const weights: Record<string, string> = {};
    childs.forEach(c => {
      weights[c.id] = String(c.confirmed_weight_kg || c.estimated_weight_kg || '0.50');
    });
    setEditWeights(weights);
    setEditZone(cons.destination_zone || 'CABA');
    setEditReason('');
    setEditError(null);
  };

  // Save Edit Consolidation
  const handleSaveConsolidationEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConsolidation) return;
    if (!editReason.trim()) {
      setEditError('El motivo del cambio es obligatorio.');
      return;
    }
    if (editPackageIds.length === 0) {
      setEditError('La consolidación debe contener al menos un paquete.');
      return;
    }

    setEditSubmitting(true);
    setEditError(null);
    try {
      const weightsPayload: Record<string, number> = {};
      Object.entries(editWeights).forEach(([k, v]) => {
        weightsPayload[k] = parseFloat(v) || 0.50;
      });

      const { data, error } = await supabase.rpc('deblex_edit_consolidation', {
        p_consolidation_id: editingConsolidation.id,
        p_package_ids: editPackageIds,
        p_package_weights: weightsPayload,
        p_destination_zone: editZone,
        p_reason: editReason.trim()
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'Error al guardar edición');

      onShowToast(`Consolidado ${editingConsolidation.consolidation_code} actualizado (v${data.version}).`);
      setEditingConsolidation(null);
      await onRefreshData();
    } catch (err: any) {
      console.error('Error editando consolidación:', err);
      setEditError(err.message || 'Error al editar consolidación');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Open Undo Modal
  const openUndoModal = (cons: DeblexConsolidation) => {
    setUndoConsolidation(cons);
    setUndoReason('');
    setUndoError(null);
  };

  // Confirm Undo
  const handleConfirmUndo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!undoConsolidation) return;
    if (!undoReason.trim()) {
      setUndoError('El motivo para deshacer el consolidado es obligatorio.');
      return;
    }

    setUndoSubmitting(true);
    setUndoError(null);
    try {
      const { data, error } = await supabase.rpc('deblex_undo_consolidation', {
        p_consolidation_id: undoConsolidation.id,
        p_reason: undoReason.trim()
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'Error al deshacer consolidado');

      onShowToast(`Consolidado ${undoConsolidation.consolidation_code} deshecho. ${data.released_packages_count} paquetes liberados.`);
      setUndoConsolidation(null);
      await onRefreshData();
    } catch (err: any) {
      console.error('Error deshaciendo consolidado:', err);
      setUndoError(err.message || 'Error al deshacer consolidación');
    } finally {
      setUndoSubmitting(false);
    }
  };

  // Redo Consolidation
  const handleRedo = async (cons: DeblexConsolidation) => {
    const reason = prompt(`Motivo para rehacer la consolidación ${cons.consolidation_code}:`, 'Reactivación de consolidado');
    if (!reason || !reason.trim()) return;

    try {
      // Tomar paquetes que pertenecían previamente o paquetes disponibles del mismo comprador
      const eligiblePackages = packages.filter(p => 
        p.user_id === cons.user_id && 
        (p.consolidation_id === cons.id || p.is_available_for_consolidation)
      );

      if (eligiblePackages.length === 0) {
        alert('No se encontraron paquetes elegibles disponibles para este comprador.');
        return;
      }

      const { data, error } = await supabase.rpc('deblex_redo_consolidation', {
        p_consolidation_id: cons.id,
        p_package_ids: eligiblePackages.map(p => p.id),
        p_destination_zone: cons.destination_zone,
        p_reason: reason.trim()
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'Error al rehacer consolidación');

      onShowToast(`Consolidado ${cons.consolidation_code} reconstruido exitosamente.`);
      await onRefreshData();
    } catch (err: any) {
      console.error('Error al rehacer:', err);
      alert(err.message || 'Error al rehacer consolidado');
    }
  };

  // Open History
  const openHistoryModal = async (cons: DeblexConsolidation) => {
    setHistoryConsolidation(cons);
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('argentina_consolidation_history')
        .select('*')
        .eq('consolidation_id', cons.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHistoryItems((data || []) as any);
    } catch (err: any) {
      console.error('Error cargando historial:', err);
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Multi-select toggle for individual packages
  const toggleSelectPackage = (pkgId: string) => {
    setSelectedPackageIds(prev => 
      prev.includes(pkgId) ? prev.filter(id => id !== pkgId) : [...prev, pkgId]
    );
  };

  // Eligible packages for consolidation
  const selectedPackagesList = packages.filter(p => selectedPackageIds.includes(p.id));
  const selectedBuyers = Array.from(new Set(selectedPackagesList.map(p => p.recipient_document || p.user_id || 'DESCONOCIDO')));
  const hasSingleBuyer = selectedBuyers.length <= 1;
  const selectedFobTotal = selectedPackagesList.reduce((sum, p) => sum + Number(p.fob_usd || 0), 0);
  const selectedWeightTotal = selectedPackagesList.reduce((sum, p) => sum + Number(p.confirmed_weight_kg || p.estimated_weight_kg || 0.5), 0);

  // Open Create Consolidation Modal
  const openCreateConsolidationModal = () => {
    if (selectedPackageIds.length === 0) {
      onShowToast('Debe seleccionar al menos un paquete para consolidar.');
      return;
    }
    if (!hasSingleBuyer) {
      alert('Todos los paquetes seleccionados deben pertenecer al mismo comprador / destinatario.');
      return;
    }
    setCreateError(null);
    setShowCreateModal(true);
  };

  // Confirm Create Consolidation
  const handleConfirmCreateConsolidation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPackageIds.length === 0) return;
    if (!hasSingleBuyer) {
      setCreateError('Todos los paquetes deben pertenecer al mismo comprador.');
      return;
    }
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const { data, error } = await supabase.rpc('deblex_create_consolidation', {
        p_package_ids: selectedPackageIds,
        p_destination_zone: createZone,
        p_reason: createReason.trim() || 'Consolidación manual operativa Deblex'
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'Error al crear consolidación');

      onShowToast('Consolidado ' + data.consolidation_code + ' creado exitosamente (' + data.package_count + ' paquetes).');
      setSelectedPackageIds([]);
      setShowCreateModal(false);
      await onRefreshData();
    } catch (err: any) {
      console.error('Error creando consolidación manual:', err);
      setCreateError(err.message || 'Error al consolidar paquetes');
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Invoice Document Real Actions
  const handleDownloadDocument = async (doc: DeblexPackageDocument) => {
    setDownloadingDocId(doc.id);
    try {
      const { data, error } = await supabase.storage
        .from('deblex-invoices')
        .createSignedUrl(doc.file_path, 3600);

      if (error) throw error;
      if (!data?.signedUrl) throw new Error('No se pudo generar enlace firmado');

      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = doc.file_name;
      a.click();
      onShowToast('Descargando ' + doc.file_name + '...');
    } catch (err: any) {
      console.error('Error al descargar comprobante:', err);
      alert(err.message || 'Error al descargar comprobante desde storage');
    } finally {
      setDownloadingDocId(null);
    }
  };

  const handleUploadInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadInvoicePkg || !invoiceFile) return;

    setInvoiceSubmitting(true);
    setInvoiceError(null);
    try {
      const ext = invoiceFile.name.split('.').pop() || 'pdf';
      const cleanName = invoiceFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = uploadInvoicePkg.id + '/' + Date.now() + '_' + cleanName;

      const { error: storageError } = await supabase.storage
        .from('deblex-invoices')
        .upload(storagePath, invoiceFile, {
          contentType: invoiceFile.type || 'application/pdf',
          upsert: false
        });

      if (storageError) throw storageError;

      const { data, error: rpcError } = await supabase.rpc('deblex_register_package_document', {
        p_package_id: uploadInvoicePkg.id,
        p_file_name: invoiceFile.name,
        p_file_path: storagePath,
        p_file_size: invoiceFile.size,
        p_mime_type: invoiceFile.type || 'application/pdf',
        p_document_type: invoiceDocType
      });

      if (rpcError) throw rpcError;
      if (data && !data.success) throw new Error(data.error || 'Error registrando factura');

      onShowToast('Factura subida exitosamente para el paquete.');
      setUploadInvoicePkg(null);
      setInvoiceFile(null);
      await onRefreshData();
    } catch (err: any) {
      console.error('Error subiendo factura:', err);
      setInvoiceError(err.message || 'Error al subir factura a storage');
    } finally {
      setInvoiceSubmitting(false);
    }
  };

  const handleSubstituteInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!substituteDoc || !substituteFile) return;
    if (!substituteReason.trim()) {
      setSubstituteError('El motivo de sustitución es obligatorio.');
      return;
    }

    setSubstituteSubmitting(true);
    setSubstituteError(null);
    try {
      const cleanName = substituteFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = substituteDoc.package_id + '/' + Date.now() + '_' + cleanName;

      const { error: storageError } = await supabase.storage
        .from('deblex-invoices')
        .upload(storagePath, substituteFile, {
          contentType: substituteFile.type || 'application/pdf',
          upsert: false
        });

      if (storageError) throw storageError;

      const { data, error: rpcError } = await supabase.rpc('deblex_replace_package_document', {
        p_old_document_id: substituteDoc.id,
        p_file_name: substituteFile.name,
        p_file_path: storagePath,
        p_file_size: substituteFile.size,
        p_mime_type: substituteFile.type || 'application/pdf',
        p_reason: substituteReason.trim()
      });

      if (rpcError) throw rpcError;
      if (data && !data.success) throw new Error(data.error || 'Error sustituyendo documento');

      onShowToast('Factura sustituida exitosamente con motivo registrado.');
      setSubstituteDoc(null);
      setSubstituteFile(null);
      setSubstituteReason('');
      await onRefreshData();
    } catch (err: any) {
      console.error('Error sustituyendo factura:', err);
      setSubstituteError(err.message || 'Error al sustituir documento');
    } finally {
      setSubstituteSubmitting(false);
    }
  };

  const handleDeleteInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteDoc) return;
    if (!deleteReason.trim()) {
      setDeleteError('El motivo de eliminación es obligatorio.');
      return;
    }

    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('deblex_delete_package_document', {
        p_document_id: deleteDoc.id,
        p_reason: deleteReason.trim()
      });

      if (rpcError) throw rpcError;
      if (data && !data.success) throw new Error(data.error || 'Error al eliminar documento');

      onShowToast('Documento eliminado y archivado con motivo de auditoría.');
      setDeleteDoc(null);
      setDeleteReason('');
      await onRefreshData();
    } catch (err: any) {
      console.error('Error eliminando factura:', err);
      setDeleteError(err.message || 'Error al eliminar documento');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Download mock/real invoice
  const handleDownloadInvoice = (pkg: DeblexAdminPackage) => {
    const content = [
      'DOCUMENTO LOGÍSTICO DE IMPORTACIÓN - COLLECTIBLES / DEBLEX',
      `Identificador: ${pkg.id}`,
      `Pedido: ${pkg.order_number}`,
      `Tracking Original: ${pkg.original_tracking_number}`,
      `Destinatario: ${pkg.recipient_name} (${pkg.recipient_document})`,
      `Producto: ${pkg.product_title}`,
      `Valor FOB: USD ${Number(pkg.fob_usd || 0).toFixed(2)}`,
      `Peso Confirmado: ${(pkg.confirmed_weight_kg || pkg.estimated_weight_kg || 0).toFixed(2)} kg`,
      `Fecha Recepción Miami: ${pkg.created_at}`,
      'ESTADO: Factura comercial archivada en bóveda segura de aduanas.'
    ].join('\r\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FACT_${pkg.original_tracking_number || pkg.id.slice(0, 8)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onShowToast(`Factura de ${pkg.original_tracking_number || pkg.product_title} descargada.`);
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar — Compact */}
      <div className="bg-white border border-[#dce6eb] rounded-xl p-3.5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#182f3c] flex items-center gap-1.5">
              <Package className="w-4 h-4 text-[#146981]" />
              Envíos y Consolidados
            </h2>
            <p className="text-[11px] text-[#6b808d] mt-0.5">
              Administración de envíos individuales y consolidados
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-64 min-w-[170px]">
              <Search className="w-3.5 h-3.5 text-[#8ea4b0] absolute left-2.5 top-2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar tracking, código CS, cliente..."
                className="w-full pl-8 pr-2.5 py-1 text-xs bg-white border border-[#cddbe1] rounded-lg text-[#182f3c] placeholder-[#9fb5c0] focus:outline-none focus:ring-1 focus:ring-[#146981]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1 text-xs bg-white border border-[#cddbe1] rounded-lg text-[#182f3c] focus:outline-none focus:ring-1 focus:ring-[#146981]"
            >
              <option value="ALL">Todos los estados</option>
              <option value="RECIBIDO_EN_DEPOSITO">Recibido en Miami</option>
              <option value="DISPONIBLE_PARA_CONSOLIDAR">Disponible p/ consolidar</option>
              <option value="CONFIRMED">Consolidado confirmado</option>
              <option value="DISPATCHED">En tránsito a Argentina</option>
              <option value="DELIVERED">Entregado</option>
              <option value="CANCELLED">Cancelado / Anulado (Histórico)</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="px-2.5 py-1 text-xs bg-white border border-[#cddbe1] rounded-lg text-[#182f3c] focus:outline-none focus:ring-1 focus:ring-[#146981]"
            >
              <option value="ALL">Todos los tipos</option>
              <option value="CONSOLIDATED">Solo consolidados</option>
              <option value="INDIVIDUAL">Solo individuales</option>
            </select>

            <button
              onClick={openCreateConsolidationModal}
              className={`px-2.5 py-1 font-semibold text-xs rounded-lg transition flex items-center gap-1 cursor-pointer shadow-xs ${
                selectedPackageIds.length > 0
                  ? 'bg-[#146981] hover:bg-[#0e5266] text-white'
                  : 'bg-white border border-[#cedbe1] hover:bg-[#edf6f8] text-[#146981]'
              }`}
              title="Consolidar paquetes seleccionados para un mismo destinatario"
            >
              <Layers className="w-3 h-3" />
              <span>+ Crear consolidado{selectedPackageIds.length > 0 ? ` (${selectedPackageIds.length})` : ''}</span>
            </button>

            <button
              onClick={handleExportCsv}
              className="px-2.5 py-1 bg-white border border-[#cedbe1] hover:bg-[#edf6f8] text-[#173846] font-semibold text-xs rounded-lg transition flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <Download className="w-3 h-3 text-[#146981]" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* Shipments Table — 100% width, flexible columns */}
        <div className="mt-3 overflow-x-auto border border-[#edf1f4] rounded-lg w-full bg-white">
          <table className="w-full text-xs text-left border-collapse table-auto">
            <thead>
              <tr className="bg-[#f5f8fa] text-[#698190] border-b border-[#edf1f4]">
                <th className="py-2 px-2 font-semibold text-center whitespace-nowrap text-[11px] w-[35px]">
                <input
                  type="checkbox"
                  checked={standalonePackages.filter(p => p.is_available_for_consolidation || p.package_status === 'DISPONIBLE_PARA_CONSOLIDAR' || p.package_status === 'RECIBIDO_EN_DEPOSITO').length > 0 && selectedPackageIds.length === standalonePackages.filter(p => p.is_available_for_consolidation || p.package_status === 'DISPONIBLE_PARA_CONSOLIDAR' || p.package_status === 'RECIBIDO_EN_DEPOSITO').length}
                  onChange={(e) => {
                    const eligible = standalonePackages.filter(p => p.is_available_for_consolidation || p.package_status === 'DISPONIBLE_PARA_CONSOLIDAR' || p.package_status === 'RECIBIDO_EN_DEPOSITO');
                    if (e.target.checked) setSelectedPackageIds(eligible.map(p => p.id));
                    else setSelectedPackageIds([]);
                  }}
                  className="rounded border-[#cedbe1] text-[#146981] focus:ring-[#146981] cursor-pointer"
                  title="Seleccionar todos los paquetes elegibles disponibles"
                />
              </th>
              <th className="py-2 px-2 font-semibold whitespace-nowrap text-[11px] w-[130px]">ID / Tipo</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap text-[11px] min-w-[110px]">Destinatario</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap text-[11px] min-w-[120px]">Tracking Number(s)</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap text-[11px] min-w-[110px]">Producto(s)</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap text-[11px] w-[70px]">FOB Total</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap text-[11px] min-w-[105px]">Logística</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap text-[11px] min-w-[75px]">Facturas</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap text-[11px] min-w-[125px]">Estado Logístico</th>
                <th className="py-2 px-2 font-semibold text-right whitespace-nowrap text-[11px] w-[105px]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1f4]">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-[#718895] text-xs">
                    No se encontraron envíos ni consolidados con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => {
                  const isExpanded = expandedRows.has(r.id);
                  const isLocked = r.status === 'DISPATCHED' || r.status === 'DELIVERED';
                  const isCancelled = r.status === 'CANCELLED';

                  return (
                    <React.Fragment key={r.id}>
                      <tr className={`hover:bg-[#f8fbfc] transition ${isExpanded ? 'bg-[#f8fbfc]' : ''}`}>
                        {!r.isConsolidation && r.rawPackage && (r.rawPackage.is_available_for_consolidation || r.rawPackage.package_status === 'DISPONIBLE_PARA_CONSOLIDAR' || r.rawPackage.package_status === 'RECIBIDO_EN_DEPOSITO') ? (
                        <td className="py-1.5 px-2 align-middle text-center w-[35px]">
                          <input
                            type="checkbox"
                            checked={selectedPackageIds.includes(r.id)}
                            onChange={() => toggleSelectPackage(r.id)}
                            className="rounded border-[#cedbe1] text-[#146981] focus:ring-[#146981] cursor-pointer"
                          />
                        </td>
                      ) : (
                        <td className="py-1.5 px-2 align-middle text-center text-[#c2d3dc] w-[35px] text-[10px]">
                          {r.isConsolidation ? '—' : ''}
                        </td>
                      )}
                      <td className="py-1.5 px-2 align-top">
                          <div className="flex items-start gap-1">
                            <button
                              onClick={() => toggleExpand(r.id)}
                              className="p-0.5 hover:bg-[#e2edf1] rounded text-[#6b808d] cursor-pointer mt-0.5 shrink-0"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3 h-3 text-[#146981]" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                            </button>
                            <div className="min-w-0">
                              <span className="font-mono font-bold text-[#182f3c] block text-[11px] whitespace-nowrap tracking-tight [font-variant-numeric:tabular-nums]">
                                {r.code}
                              </span>
                              {r.legacyCode && (
                                <span className="text-[9px] text-[#8ea4b0] block font-mono whitespace-nowrap">
                                  Ref: {r.legacyCode}
                                </span>
                              )}
                              {r.isConsolidation ? (
                                <span className="inline-flex items-center gap-0.5 mt-0.5 px-1 py-0.2 rounded text-[9px] font-bold bg-[#dff2e9] text-[#146946] whitespace-nowrap">
                                  CONSOLIDADO (v{r.rawConsolidation?.version || 1})
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1 py-0.2 rounded text-[9px] font-medium bg-[#f0f4f7] text-[#6b808d] mt-0.5 whitespace-nowrap">
                                  Individual
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-1.5 px-2 align-top">
                          <strong className="block text-[#182f3c] font-semibold text-[11px] leading-tight">
                            {r.recipientName}
                          </strong>
                          <span className="text-[10px] text-[#718795] block whitespace-nowrap mt-0.5">
                            {r.recipientDoc}
                          </span>
                          <span className="text-[9px] text-[#8fa5b1] block">
                            Zona: {r.zone}
                          </span>
                        </td>

                        <td className="py-1.5 px-2 align-top">
                          <div className="flex flex-wrap gap-0.5 max-w-[170px]">
                            {r.children.map((c, i) => (
                              <span
                                key={i}
                                className="font-mono text-[9px] bg-[#edf3f5] px-1 py-0.2 rounded text-[#182f3c] border border-[#dbe6ec] whitespace-nowrap"
                              >
                                {c.original_tracking_number || c.order_number || 'N/A'}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="py-1.5 px-2 align-top text-[#182f3c]">
                          <span className="font-semibold text-[11px]">{r.children.length} pieza(s)</span>
                          <span className="block text-[10px] text-[#718795] truncate max-w-[140px]" title={r.children.map(c => c.product_title).join(' | ')}>
                            {r.children[0]?.product_title || 'Coleccionables'}
                          </span>
                        </td>

                        <td className="py-1.5 px-2 align-top font-semibold text-[#182f3c] whitespace-nowrap font-mono text-[11px]">
                          USD {r.fob.toFixed(2)}
                        </td>

                        <td className="py-1.5 px-2 align-top whitespace-nowrap">
                          <strong className="block text-[#182f3c] font-mono text-[11px] leading-tight">
                            USD {r.totalLogistics.toFixed(2)}
                          </strong>
                          <span className="text-[9px] text-[#718795] block font-mono mt-0.5">
                            {r.weight.toFixed(2)} kg · LP {r.logisticPack.toFixed(2)}
                          </span>
                        </td>

                        <td className="py-1.5 px-2 align-top">
                          <div className="flex flex-wrap gap-1 items-center">
                            {(() => {
                              const allDocs = r.children.flatMap(c => (c.argentina_package_documents || []).filter(d => d.status === 'ACTIVE'));
                              if (allDocs.length === 0) {
                                return (
                                  <span className="text-[9px] text-[#8ea4b0] italic">Sin factura</span>
                                );
                              }
                              return allDocs.map((doc, i) => (
                                <button
                                  key={doc.id || i}
                                  onClick={() => handleDownloadDocument(doc)}
                                  disabled={downloadingDocId === doc.id}
                                  className="px-1.5 py-0.5 bg-[#edf6f8] border border-[#b8d9e2] hover:bg-[#d6edf2] text-[#146981] text-[9px] rounded font-semibold cursor-pointer whitespace-nowrap flex items-center gap-0.5"
                                  title={`Descargar ${doc.file_name}`}
                                >
                                  <FileText className="w-2.5 h-2.5" />
                                  <span>{doc.file_name.length > 12 ? doc.file_name.slice(0, 10) + '…' : doc.file_name}</span>
                                </button>
                              ));
                            })()}
                          </div>
                        </td>

                        <td className="py-1.5 px-2 align-top">
                          <select
                            value={r.status}
                            disabled={updatingStatusId === r.id}
                            onChange={(e) => handleStateChange(r, e.target.value)}
                            className="w-full px-1.5 py-0.5 text-[10px] bg-white border border-[#cedbe1] rounded text-[#182f3c] focus:outline-none focus:ring-1 focus:ring-[#146981] disabled:opacity-50"
                          >
                            <option value="RECIBIDO_EN_DEPOSITO">Recibido Miami</option>
                            <option value="DISPONIBLE_PARA_CONSOLIDAR">Disp. consolidar</option>
                            <option value="CONFIRMED">Confirmado</option>
                            <option value="DISPATCHED">En tránsito AR</option>
                            <option value="EN_TRANSITO">En tránsito AR</option>
                            <option value="DELIVERED">Entregado</option>
                            <option value="CANCELLED">Cancelado</option>
                          </select>
                          {r.dispatchedAt && (
                            <span className="text-[9px] text-[#146946] block mt-0.5 whitespace-nowrap font-mono">
                              Desp: {new Date(r.dispatchedAt).toLocaleDateString('es-AR')}
                            </span>
                          )}
                        </td>

                        <td className="py-1.5 px-2 align-top text-right whitespace-nowrap">
                          {r.isConsolidation && r.rawConsolidation && (
                            <div className="flex items-center justify-end gap-0.5">
                              {!isLocked && !isCancelled && (
                                <button
                                  onClick={() => openEditModal(r.rawConsolidation!)}
                                  className="px-1.5 py-0.5 bg-white border border-[#cedbe1] hover:bg-[#edf6f8] text-[#146981] font-semibold text-[10px] rounded transition cursor-pointer"
                                  title="Editar paquetes, pesos y zona"
                                >
                                  <Edit3 className="w-2.5 h-2.5 inline mr-0.5" />
                                  Editar
                                </button>
                              )}

                              {!isLocked && !isCancelled && (
                                <button
                                  onClick={() => openUndoModal(r.rawConsolidation!)}
                                  className="px-1.5 py-0.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 font-semibold text-[10px] rounded transition cursor-pointer"
                                  title="Deshacer y liberar paquetes"
                                >
                                  Deshacer
                                </button>
                              )}

                              <button
                                onClick={() => openHistoryModal(r.rawConsolidation!)}
                                className="px-1.5 py-0.5 bg-white border border-[#dce6eb] hover:bg-[#f0f4f7] text-[#617885] font-semibold text-[10px] rounded transition cursor-pointer"
                                title="Ver historial de cambios"
                              >
                                Historial
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Expanded child detail — Compact */}
                      {isExpanded && (
                        <tr className="bg-[#f8fbfc] border-b border-[#edf1f4]">
                          <td colSpan={10} className="p-2.5 pl-6">
                            <div className="bg-white border border-[#dce6eb] rounded-lg p-2.5">
                              <h4 className="text-[10px] font-bold text-[#182f3c] uppercase tracking-wider mb-1.5">
                                Detalle de Paquetes Integrantes ({r.children.length})
                              </h4>
                              <table className="w-full text-[10px] text-left">
                                <thead>
                                  <tr className="border-b border-[#edf1f4] text-[#698190]">
                                    <th className="py-1 px-1.5 font-semibold">Tracking Original</th>
                                    <th className="py-1 px-1.5 font-semibold">Producto</th>
                                    <th className="py-1 px-1.5 font-semibold">Peso Confirmado</th>
                                    <th className="py-1 px-1.5 font-semibold">Valor FOB</th>
                                    <th className="py-1 px-1.5 font-semibold">Estado</th>
                                    <th className="py-1 px-1.5 font-semibold text-right">Comprobante</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#edf1f4]">
                                  {r.children.map((child) => {
                                    const activeDocs = (child.argentina_package_documents || []).filter(d => d.status === 'ACTIVE');
                                    return (
                                      <tr key={child.id} className="hover:bg-[#fbfdfe]">
                                        <td className="py-1.5 px-1.5 font-mono font-medium text-[#182f3c]">
                                          {child.original_tracking_number || child.order_number}
                                        </td>
                                        <td className="py-1.5 px-1.5 text-[#182f3c]">
                                          {child.product_title}
                                        </td>
                                        <td className="py-1.5 px-1.5 text-[#617885]">
                                          {(child.confirmed_weight_kg || child.estimated_weight_kg || 0.50).toFixed(2)} kg
                                        </td>
                                        <td className="py-1.5 px-1.5 text-[#182f3c] font-medium font-mono">
                                          USD {Number(child.fob_usd || 0).toFixed(2)}
                                        </td>
                                        <td className="py-1.5 px-1.5">
                                          <span className="px-1 py-0.2 rounded text-[9px] bg-[#edf3f5] text-[#146981] font-semibold">
                                            {child.package_status}
                                          </span>
                                        </td>
                                        <td className="py-1.5 px-1.5 text-right align-middle">
                                          <div className="flex items-center justify-end gap-1 flex-wrap">
                                            {activeDocs.length === 0 ? (
                                              <button
                                                onClick={() => {
                                                  setUploadInvoicePkg(child);
                                                  setInvoiceFile(null);
                                                  setInvoiceError(null);
                                                }}
                                                className="px-2 py-0.5 bg-[#146981] hover:bg-[#0e5266] text-white font-semibold text-[9px] rounded transition cursor-pointer flex items-center gap-0.5"
                                              >
                                                <Upload className="w-2.5 h-2.5" />
                                                <span>+ Subir factura</span>
                                              </button>
                                            ) : (
                                              activeDocs.map((doc) => (
                                                <div key={doc.id} className="flex items-center gap-1 bg-[#edf6f8] px-1.5 py-0.5 rounded border border-[#b8d9e2]">
                                                  <button
                                                    onClick={() => handleDownloadDocument(doc)}
                                                    disabled={downloadingDocId === doc.id}
                                                    className="text-[9px] text-[#146981] hover:underline font-semibold flex items-center gap-0.5 cursor-pointer"
                                                    title={`Descargar ${doc.file_name}`}
                                                  >
                                                    <FileText className="w-2.5 h-2.5" />
                                                    <span className="truncate max-w-[90px]">{doc.file_name}</span>
                                                  </button>
                                                  <button
                                                    onClick={() => {
                                                      setSubstituteDoc(doc);
                                                      setSubstituteFile(null);
                                                      setSubstituteReason('');
                                                      setSubstituteError(null);
                                                    }}
                                                    className="text-[9px] text-[#718795] hover:text-[#182f3c] font-medium ml-1 cursor-pointer"
                                                    title="Sustituir documento"
                                                  >
                                                    Sustituir
                                                  </button>
                                                  <button
                                                    onClick={() => {
                                                      setDeleteDoc(doc);
                                                      setDeleteReason('');
                                                      setDeleteError(null);
                                                    }}
                                                    className="text-[9px] text-red-500 hover:text-red-700 font-medium ml-0.5 cursor-pointer"
                                                    title="Eliminar documento"
                                                  >
                                                    Eliminar
                                                  </button>
                                                </div>
                                              ))
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Consolidation Modal — Compact */}
      {editingConsolidation && (
        <div className="fixed inset-0 z-50 bg-[#123040]/40 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="max-w-xl w-full bg-white border border-[#dce6eb] rounded-xl shadow-[0_8px_30px_rgba(18,48,64,0.15)] p-4 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#edf1f4]">
              <div>
                <h3 className="text-sm font-bold text-[#182f3c] flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5 text-[#146981]" />
                  Modificar Consolidado {editingConsolidation.consolidation_code}
                </h3>
                <span className="text-[11px] text-[#6b808d]">
                  Comprador: <strong>{editingConsolidation.recipient_name}</strong> ({editingConsolidation.recipient_document})
                </span>
              </div>
              <button
                onClick={() => setEditingConsolidation(null)}
                className="p-1 text-[#6b808d] hover:text-[#182f3c] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveConsolidationEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#182f3c] mb-1">
                  Zona de Destino (Logistic Pack)
                </label>
                <select
                  value={editZone}
                  onChange={(e) => setEditZone(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#cedbe1] rounded-lg text-[#182f3c]"
                >
                  <option value="CABA">CABA (Logistic Pack USD 20.00)</option>
                  <option value="AMBA">AMBA (Logistic Pack USD 34.00)</option>
                  <option value="INTERIOR">INTERIOR (Logistic Pack USD 43.00)</option>
                </select>
              </div>

              {/* Package selection and weight corrections */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-[#182f3c]">
                    Paquetes Integrantes & Pesos Confirmados (kg)
                  </label>
                  <span className="text-[10px] text-[#6b808d]">
                    Tarifa: USD 19/kg exacto + LP
                  </span>
                </div>

                <div className="border border-[#edf1f4] rounded-lg divide-y divide-[#edf1f4] max-h-48 overflow-y-auto">
                  {/* Paquetes del comprador */}
                  {packages
                    .filter(p => p.user_id === editingConsolidation.user_id && (p.consolidation_id === editingConsolidation.id || p.is_available_for_consolidation))
                    .map(pkg => {
                      const isIncluded = editPackageIds.includes(pkg.id);
                      return (
                        <div key={pkg.id} className="p-2 flex items-center justify-between gap-2.5 text-xs">
                          <label className="flex items-center gap-1.5 cursor-pointer flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={isIncluded}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditPackageIds([...editPackageIds, pkg.id]);
                                  if (!editWeights[pkg.id]) {
                                    setEditWeights({
                                      ...editWeights,
                                      [pkg.id]: String(pkg.confirmed_weight_kg || pkg.estimated_weight_kg || '0.50')
                                    });
                                  }
                                } else {
                                  setEditPackageIds(editPackageIds.filter(id => id !== pkg.id));
                                }
                              }}
                              className="rounded border-[#cedbe1] text-[#146981] focus:ring-[#146981]"
                            />
                            <div className="min-w-0 truncate">
                              <strong className="block text-[#182f3c] font-mono text-[10px]">
                                {pkg.original_tracking_number || pkg.order_number}
                              </strong>
                              <span className="text-[10px] text-[#718795] block truncate max-w-[220px]">
                                {pkg.product_title} · FOB USD {Number(pkg.fob_usd || 0).toFixed(2)}
                              </span>
                            </div>
                          </label>

                          {isIncluded && (
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[10px] text-[#617885]">Peso kg:</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0.05"
                                max="50"
                                value={editWeights[pkg.id] || ''}
                                onChange={(e) => setEditWeights({ ...editWeights, [pkg.id]: e.target.value })}
                                className="w-16 px-1.5 py-0.5 text-xs border border-[#cedbe1] rounded text-[#182f3c] text-right font-mono"
                                required
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#182f3c] mb-1">
                  Motivo obligatorio del cambio / auditoría <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Ej: Corrección de pesaje de báscula en Miami y agregado de paquete recibido hoy."
                  rows={2}
                  required
                  className="w-full p-2 text-xs bg-white border border-[#cedbe1] rounded-lg text-[#182f3c] focus:outline-none focus:ring-1 focus:ring-[#146981]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#edf1f4]">
                <button
                  type="button"
                  onClick={() => setEditingConsolidation(null)}
                  className="px-3 py-1.5 bg-white border border-[#cedbe1] hover:bg-[#edf6f8] text-[#173846] text-xs font-semibold rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-3 py-1.5 bg-[#146981] hover:bg-[#0e5266] text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {editSubmitting ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Guardar Cambios & Recalcular</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Undo Modal — Compact */}
      {undoConsolidation && (
        <div className="fixed inset-0 z-50 bg-[#123040]/40 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="max-w-md w-full bg-white border border-[#dce6eb] rounded-xl shadow-[0_8px_30px_rgba(18,48,64,0.15)] p-4 space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#edf1f4]">
              <h3 className="text-sm font-bold text-[#182f3c] flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Deshacer Consolidado {undoConsolidation.consolidation_code}
              </h3>
              <button
                onClick={() => setUndoConsolidation(null)}
                className="p-1 text-[#6b808d] hover:text-[#182f3c] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-[#617885]">
              Al deshacer, los paquetes se liberan y vuelven a estar disponibles en Miami para consolidaciones futuras. Se registrará un asiento compensatorio inmutable en el historial contable.
            </p>

            {undoError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                {undoError}
              </div>
            )}

            <form onSubmit={handleConfirmUndo} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#182f3c] mb-1">
                  Motivo obligatorio de anulación <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={undoReason}
                  onChange={(e) => setUndoReason(e.target.value)}
                  placeholder="Ej: Solicitud expresa del cliente para esperar otra encomienda antes de despachar."
                  rows={2}
                  required
                  className="w-full p-2 text-xs bg-white border border-[#cedbe1] rounded-lg text-[#182f3c] focus:outline-none focus:ring-1 focus:ring-[#146981]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#edf1f4]">
                <button
                  type="button"
                  onClick={() => setUndoConsolidation(null)}
                  className="px-3 py-1.5 bg-white border border-[#cedbe1] hover:bg-[#edf6f8] text-[#173846] text-xs font-semibold rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={undoSubmitting}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {undoSubmitting ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>Confirmar y Deshacer</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal — Compact */}
      {historyConsolidation && (
        <div className="fixed inset-0 z-50 bg-[#123040]/40 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="max-w-xl w-full bg-white border border-[#dce6eb] rounded-xl shadow-[0_8px_30px_rgba(18,48,64,0.15)] p-4 space-y-3 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#edf1f4]">
              <div>
                <h3 className="text-sm font-bold text-[#182f3c] flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-[#146981]" />
                  Historial de Auditoría — {historyConsolidation.consolidation_code}
                </h3>
                <span className="text-[11px] text-[#6b808d]">
                  Versión actual: v{historyConsolidation.version || 1}
                </span>
              </div>
              <button
                onClick={() => setHistoryConsolidation(null)}
                className="p-1 text-[#6b808d] hover:text-[#182f3c] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {historyLoading ? (
              <div className="py-6 text-center text-[#718895] text-xs">
                Cargando historial de auditoría...
              </div>
            ) : historyItems.length === 0 ? (
              <div className="py-6 text-center text-[#718895] text-xs">
                No hay registros de cambios para esta consolidación.
              </div>
            ) : (
              <div className="space-y-2">
                {historyItems.map((item) => (
                  <div key={item.id} className="p-2.5 bg-[#f8fbfc] border border-[#e2edf1] rounded-lg text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#146981] uppercase tracking-wide text-[9px]">
                        Acción: {item.action} (v{item.version_number})
                      </span>
                      <span className="text-[9px] text-[#8fa5b1]">
                        {new Date(item.created_at).toLocaleString('es-AR')}
                      </span>
                    </div>
                    <p className="text-[#182f3c] font-medium text-[11px]">
                      Motivo: {item.reason}
                    </p>
                    <div className="text-[10px] text-[#718795] flex items-center justify-between pt-0.5">
                      <span>Operador: {item.performer_email || 'Sistema'}</span>
                      {item.financial_delta_usd !== undefined && item.financial_delta_usd !== 0 && (
                        <span className="font-semibold text-[#182f3c] font-mono">
                          Delta: USD {Number(item.financial_delta_usd).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-[#edf1f4]">
              <button
                onClick={() => setHistoryConsolidation(null)}
                className="px-3 py-1.5 bg-white border border-[#cedbe1] hover:bg-[#edf6f8] text-[#173846] text-xs font-semibold rounded-lg"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal 1: Create Consolidation Modal (Manual Operator) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-[#123040]/40 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="max-w-lg w-full bg-white border border-[#dce6eb] rounded-xl shadow-[0_8px_30px_rgba(18,48,64,0.15)] p-4 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#edf1f4]">
              <div>
                <h3 className="text-sm font-bold text-[#182f3c] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#146981]" />
                  Crear Consolidado Manualmente
                </h3>
                <span className="text-[11px] text-[#6b808d]">
                  {selectedPackagesList.length} paquete(s) seleccionado(s)
                </span>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-[#6b808d] hover:text-[#182f3c] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmCreateConsolidation} className="space-y-3">
              <div className="bg-[#f8fbfc] border border-[#e2edf1] rounded-lg p-2.5 space-y-1.5 text-xs">
                <div className="flex justify-between text-[#182f3c]">
                  <span className="text-[#698190]">Destinatario:</span>
                  <strong className="truncate max-w-[200px]">{selectedPackagesList[0]?.recipient_name || 'Comprador Argentina'}</strong>
                </div>
                <div className="flex justify-between text-[#182f3c]">
                  <span className="text-[#698190]">Documento:</span>
                  <span className="font-mono">{selectedPackagesList[0]?.recipient_document || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-[#182f3c]">
                  <span className="text-[#698190]">FOB Total:</span>
                  <strong className="font-mono">USD {selectedFobTotal.toFixed(2)}</strong>
                </div>
                <div className="flex justify-between text-[#182f3c]">
                  <span className="text-[#698190]">Peso Total Estimado:</span>
                  <strong className="font-mono">{selectedWeightTotal.toFixed(2)} kg</strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#182f3c] mb-1">
                  Zona de Destino (Logistic Pack)
                </label>
                <select
                  value={createZone}
                  onChange={(e) => setCreateZone(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#cedbe1] rounded-lg text-[#182f3c] focus:outline-none focus:ring-1 focus:ring-[#146981]"
                >
                  <option value="CABA">CABA (Logistic Pack USD 20.00)</option>
                  <option value="AMBA">AMBA (Logistic Pack USD 34.00)</option>
                  <option value="INTERIOR">INTERIOR (Logistic Pack USD 43.00)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#182f3c] mb-1">
                  Motivo / Observación operativa
                </label>
                <textarea
                  value={createReason}
                  onChange={(e) => setCreateReason(e.target.value)}
                  placeholder="Ej: Consolidación solicitada por cliente o agrupación de compras en Miami."
                  rows={2}
                  required
                  className="w-full p-2 text-xs bg-white border border-[#cedbe1] rounded-lg text-[#182f3c] focus:outline-none focus:ring-1 focus:ring-[#146981]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#edf1f4]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 bg-white border border-[#cedbe1] hover:bg-[#edf6f8] text-[#173846] text-xs font-semibold rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-3 py-1.5 bg-[#146981] hover:bg-[#0e5266] text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {createSubmitting ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Crear Consolidado</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Upload Invoice Modal */}
      {uploadInvoicePkg && (
        <div className="fixed inset-0 z-50 bg-[#123040]/40 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="max-w-md w-full bg-white border border-[#dce6eb] rounded-xl shadow-[0_8px_30px_rgba(18,48,64,0.15)] p-4 space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#edf1f4]">
              <div>
                <h3 className="text-sm font-bold text-[#182f3c] flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-[#146981]" />
                  Subir Factura Comercial
                </h3>
                <span className="text-[11px] text-[#6b808d]">
                  Tracking: <strong>{uploadInvoicePkg.original_tracking_number || uploadInvoicePkg.order_number}</strong>
                </span>
              </div>
              <button
                onClick={() => setUploadInvoicePkg(null)}
                className="p-1 text-[#6b808d] hover:text-[#182f3c] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {invoiceError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <span>{invoiceError}</span>
              </div>
            )}

            <form onSubmit={handleUploadInvoice} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#182f3c] mb-1">
                  Archivo (PDF, JPG, PNG - Máx 10 MB)
                </label>
                <input
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  required
                  onChange={(e) => setInvoiceFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full text-xs text-[#182f3c] border border-[#cedbe1] rounded-lg p-2 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#edf6f8] file:text-[#146981] hover:file:bg-[#d6edf2]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#182f3c] mb-1">
                  Tipo de Documento
                </label>
                <select
                  value={invoiceDocType}
                  onChange={(e) => setInvoiceDocType(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#cedbe1] rounded-lg text-[#182f3c]"
                >
                  <option value="COMMERCIAL_INVOICE">Factura Comercial (Commercial Invoice)</option>
                  <option value="PURCHASE_RECEIPT">Comprobante de Compra / Orden</option>
                  <option value="CUSTOMS_DECLARATION">Declaración de Aduana</option>
                  <option value="OTHER">Otro comprobante</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#edf1f4]">
                <button
                  type="button"
                  onClick={() => setUploadInvoicePkg(null)}
                  className="px-3 py-1.5 bg-white border border-[#cedbe1] hover:bg-[#edf6f8] text-[#173846] text-xs font-semibold rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={invoiceSubmitting || !invoiceFile}
                  className="px-3 py-1.5 bg-[#146981] hover:bg-[#0e5266] text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {invoiceSubmitting ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>Subir Factura</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Substitute Invoice Modal */}
      {substituteDoc && (
        <div className="fixed inset-0 z-50 bg-[#123040]/40 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="max-w-md w-full bg-white border border-[#dce6eb] rounded-xl shadow-[0_8px_30px_rgba(18,48,64,0.15)] p-4 space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#edf1f4]">
              <div>
                <h3 className="text-sm font-bold text-[#182f3c] flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-[#146981]" />
                  Sustituir Factura Comercial
                </h3>
                <span className="text-[11px] text-[#6b808d]">
                  Documento actual: <strong>{substituteDoc.file_name}</strong>
                </span>
              </div>
              <button
                onClick={() => setSubstituteDoc(null)}
                className="p-1 text-[#6b808d] hover:text-[#182f3c] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {substituteError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <span>{substituteError}</span>
              </div>
            )}

            <form onSubmit={handleSubstituteInvoice} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#182f3c] mb-1">
                  Nuevo Archivo de Reemplazo (PDF, JPG, PNG)
                </label>
                <input
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  required
                  onChange={(e) => setSubstituteFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full text-xs text-[#182f3c] border border-[#cedbe1] rounded-lg p-2 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#edf6f8] file:text-[#146981] hover:file:bg-[#d6edf2]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#182f3c] mb-1">
                  Motivo obligatorio de sustitución <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={substituteReason}
                  onChange={(e) => setSubstituteReason(e.target.value)}
                  placeholder="Ej: Corrección de CUIT/RUT del comprador, actualización de desglose de ítems."
                  rows={2}
                  required
                  className="w-full p-2 text-xs bg-white border border-[#cedbe1] rounded-lg text-[#182f3c] focus:outline-none focus:ring-1 focus:ring-[#146981]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#edf1f4]">
                <button
                  type="button"
                  onClick={() => setSubstituteDoc(null)}
                  className="px-3 py-1.5 bg-white border border-[#cedbe1] hover:bg-[#edf6f8] text-[#173846] text-xs font-semibold rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={substituteSubmitting || !substituteFile}
                  className="px-3 py-1.5 bg-[#146981] hover:bg-[#0e5266] text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {substituteSubmitting ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Confirmar Sustitución</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Delete Invoice Modal */}
      {deleteDoc && (
        <div className="fixed inset-0 z-50 bg-[#123040]/40 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="max-w-md w-full bg-white border border-[#dce6eb] rounded-xl shadow-[0_8px_30px_rgba(18,48,64,0.15)] p-4 space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#edf1f4]">
              <div>
                <h3 className="text-sm font-bold text-red-600 flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar Factura
                </h3>
                <span className="text-[11px] text-[#6b808d]">
                  Archivo: <strong>{deleteDoc.file_name}</strong>
                </span>
              </div>
              <button
                onClick={() => setDeleteDoc(null)}
                className="p-1 text-[#6b808d] hover:text-[#182f3c] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {deleteError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            <form onSubmit={handleDeleteInvoice} className="space-y-3">
              <p className="text-xs text-[#4e6573]">
                El archivo se desvinculará y su registro quedará archivado con motivo de auditoría inmutable.
              </p>

              <div>
                <label className="block text-xs font-semibold text-[#182f3c] mb-1">
                  Motivo obligatorio de eliminación <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Ej: Factura ilegible o subida erróneamente en otro paquete."
                  rows={2}
                  required
                  className="w-full p-2 text-xs bg-white border border-[#cedbe1] rounded-lg text-[#182f3c] focus:outline-none focus:ring-1 focus:ring-[#146981]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#edf1f4]">
                <button
                  type="button"
                  onClick={() => setDeleteDoc(null)}
                  className="px-3 py-1.5 bg-white border border-[#cedbe1] hover:bg-[#edf6f8] text-[#173846] text-xs font-semibold rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={deleteSubmitting}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {deleteSubmitting ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>Confirmar Eliminación</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
