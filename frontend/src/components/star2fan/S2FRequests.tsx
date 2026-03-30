import { useState } from 'react';
import { Video, DollarSign, Calendar, Upload, CheckCircle, Clock, AlertCircle, ChevronRight, Play, ChevronLeft, FileVideo, X } from 'lucide-react';

interface Props {
  requests: any[];
  selectedRequest: any | null;
  onSelectRequest: (r: any | null) => void;
  onUpdateStatus: (id: string, status: string) => void;
  onUploadVideo: (requestId: string, file: File) => void;
}

export default function S2FRequests({ requests, selectedRequest, onSelectRequest, onUpdateStatus, onUploadVideo }: Props) {
  const [filter, setFilter] = useState<'active' | 'completed'>('active');
  const [dragOver, setDragOver] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const activeStatuses = ['new', 'pending_acceptance', 'accepted', 'recording', 'internal_review'];
  const completedStatuses = ['delivered', 'completed', 'rejected', 'cancelled'];
  const filtered = filter === 'active'
    ? requests.filter(r => activeStatuses.includes(r.status) || (r.status !== 'completed' && r.status !== 'cancelled' && r.status !== 'rejected' && r.status !== 'delivered' && new Date(r.delivery_deadline) < new Date()))
    : requests.filter(r => completedStatuses.includes(r.status));

  const statusColors: Record<string, string> = {
    new: 'bg-blue-50 border-blue-200 text-blue-700',
    pending_acceptance: 'bg-orange-50 border-orange-200 text-orange-700',
    accepted: 'bg-sky-50 border-sky-200 text-sky-700',
    recording: 'bg-purple-50 border-purple-200 text-purple-700',
    internal_review: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    delivered: 'bg-green-50 border-green-200 text-green-700',
    completed: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    rejected: 'bg-red-50 border-red-200 text-red-700',
    cancelled: 'bg-gray-50 border-gray-200 text-gray-700',
  };

  const statusLabels: Record<string, string> = {
    new: 'Nuevo', pending_acceptance: 'Pend. Aceptación', accepted: 'Aceptado',
    recording: 'En Grabación', internal_review: 'Revisión Interna', delivered: 'Entregado',
    completed: 'Completado', rejected: 'Rechazado', cancelled: 'Cancelado',
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith('video/') || file.name.match(/\.(mp4|mov|webm|avi)$/i))) {
      if (file.size <= 500 * 1024 * 1024) setUploadFile(file);
      else alert('Archivo demasiado grande. Máximo 500MB.');
    } else alert('Formato no soportado. Usa MP4, MOV, WEB o AVI.');
  };

  // ========= LIST VIEW =========
  if (!selectedRequest) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">Gestor de Pedidos</h2>
            <p className="text-gray-500 font-medium mt-1">{filtered.length} solicitudes {filter === 'active' ? 'activas' : 'cerradas'}</p>
          </div>
          <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner">
            <button onClick={() => setFilter('active')} className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${filter === 'active' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}>Activos</button>
            <button onClick={() => setFilter('completed')} className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${filter === 'completed' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}>Cerrados</button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="p-3 pl-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Fan / Destinatario</th>
                  <th className="p-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Ocasión</th>
                  <th className="p-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Límite</th>
                  <th className="p-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Precio</th>
                  <th className="p-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Prioridad</th>
                  <th className="p-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Estado</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(req => {
                  const overdue = new Date(req.delivery_deadline) < new Date() && !completedStatuses.includes(req.status);
                  return (
                    <tr key={req.id} onClick={() => onSelectRequest(req)} className="hover:bg-gray-50 transition-colors cursor-pointer group">
                      <td className="p-3 pl-5">
                        <p className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                          {overdue && <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0"></span>}
                          Para: {req.recipient_name}
                        </p>
                        <p className="text-[11px] text-gray-500">Comprador: {req.fan_buyer_name}</p>
                      </td>
                      <td className="p-3"><span className="bg-gray-100 text-gray-600 text-[11px] font-bold px-2.5 py-1 rounded-full capitalize">{req.occasion}</span></td>
                      <td className="p-3"><p className={`font-bold text-sm ${overdue ? 'text-red-500' : 'text-gray-700'}`}>{new Date(req.delivery_deadline).toLocaleDateString()}</p></td>
                      <td className="p-3 font-black text-gray-900">${req.price}</td>
                      <td className="p-3">
                        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${req.priority === 'urgent' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                          {req.priority}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`text-[10px] font-bold uppercase tracking-wide border px-2.5 py-1 rounded-lg ${statusColors[req.status] || 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                          {statusLabels[req.status] || req.status}
                        </span>
                      </td>
                      <td className="p-3 pr-5">
                        <div className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center group-hover:bg-rose-500 group-hover:border-rose-500 group-hover:text-white transition-all ml-auto text-gray-400">
                          <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-400 text-sm">No hay solicitudes en esta categoría.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ========= DETAIL VIEW =========
  const req = selectedRequest;
  const overdue = new Date(req.delivery_deadline) < new Date() && !completedStatuses.includes(req.status);

  return (
    <div className="space-y-6 pb-10">
      <button onClick={() => { onSelectRequest(null); setUploadFile(null); }} className="text-sm font-bold text-gray-500 hover:text-rose-600 flex items-center gap-1 transition-colors">
        <ChevronLeft className="w-4 h-4" /> Volver a Solicitudes
      </button>

      <div className="bg-gray-900 rounded-[1.5rem] shadow-2xl overflow-hidden border border-gray-800 text-white flex flex-col lg:flex-row">
        {/* Left: Info */}
        <div className="w-full lg:w-[420px] border-r border-gray-800 p-6 lg:p-8 flex flex-col lg:min-h-[680px]">
          <div className="flex justify-between items-center mb-6">
            <span className="text-[10px] font-black tracking-widest uppercase text-gray-500 px-2.5 py-1 border border-gray-800 rounded-full">ID: {req.id?.substring(0, 8)}</span>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${req.priority === 'urgent' ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-white/10 text-gray-300'}`}>
              {req.priority}
            </span>
          </div>

          <h2 className="text-2xl font-black mb-1 leading-tight">Video para {req.recipient_name}</h2>
          <p className="text-gray-400 font-medium mb-6">Comprado por {req.fan_buyer_name}</p>

          <div className="space-y-5 flex-1 text-sm">
            <InfoBlock label="Ocasión" value={req.occasion} />
            <InfoBlock label="Instrucciones del Fan" value={`"${req.instructions || 'Sin instrucciones'}"` } large />
            {req.name_pronunciation && <InfoBlock label="Pronunciación" value={req.name_pronunciation} />}
            {req.requested_language && <InfoBlock label="Idioma" value={req.requested_language} />}
            <InfoBlock label="Fecha de Compra" value={new Date(req.purchase_date || req.created_at).toLocaleDateString()} />
            <InfoBlock label="Estado del Pago" value={req.payment_status || 'pendiente'} />
            {req.internal_notes && <InfoBlock label="Notas Internas" value={req.internal_notes} />}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-800 text-sm font-medium text-gray-400 flex justify-between">
            <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-gray-500" /> {overdue ? <span className="text-red-400">VENCIDO</span> : new Date(req.delivery_deadline).toLocaleDateString()}</span>
            <span className="flex items-center gap-1.5"><DollarSign className="w-4 h-4 text-green-500" /> ${req.price}</span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex-1 p-6 lg:p-10 flex flex-col justify-center items-center relative bg-gradient-to-br from-gray-900 to-gray-950">
          <div className="w-full max-w-lg text-center">

            {/* NEW / PENDING */}
            {['new', 'pending_acceptance'].includes(req.status) && (
              <div className="bg-white/5 border border-white/10 p-8 rounded-2xl backdrop-blur-md">
                <Video className="w-14 h-14 text-rose-500 mx-auto mb-5 opacity-80" />
                <h3 className="text-2xl font-black mb-2">¿Aceptas esta solicitud?</h3>
                <p className="text-gray-400 text-sm mb-6">Tendrás hasta el {new Date(req.delivery_deadline).toLocaleDateString()} para entregar.</p>
                <div className="flex flex-col gap-3">
                  <button onClick={() => onUpdateStatus(req.id, 'accepted')} className="bg-rose-600 text-white font-black py-3.5 rounded-xl hover:bg-rose-500 transition-colors shadow-lg">Aceptar Solicitud</button>
                  <button onClick={() => onUpdateStatus(req.id, 'rejected')} className="bg-white/10 text-white font-bold py-3.5 rounded-xl hover:bg-white/20 transition-colors">Rechazar (Reembolso)</button>
                </div>
              </div>
            )}

            {/* ACCEPTED */}
            {req.status === 'accepted' && (
              <div className="bg-white/5 border border-white/10 p-8 rounded-2xl backdrop-blur-md">
                <Clock className="w-14 h-14 text-sky-400 mx-auto mb-5" />
                <h3 className="text-2xl font-black mb-2">Solicitud Aceptada</h3>
                <p className="text-gray-400 text-sm mb-6">Cuando estés listo, pasá a modo grabación.</p>
                <button onClick={() => onUpdateStatus(req.id, 'recording')} className="bg-purple-600 text-white font-black py-3.5 rounded-xl hover:bg-purple-500 transition-colors w-full shadow-lg">
                  Iniciar Grabación
                </button>
              </div>
            )}

            {/* RECORDING */}
            {req.status === 'recording' && (
              <div className="w-full">
                <div
                  className={`aspect-[9/16] max-h-[500px] bg-black rounded-2xl border-2 ${dragOver ? 'border-rose-500 bg-rose-500/5' : 'border-dashed border-gray-700'} shadow-2xl relative overflow-hidden flex flex-col items-center justify-center cursor-pointer transition-all`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => document.getElementById('video-upload-input')?.click()}
                >
                  <input id="video-upload-input" type="file" accept="video/*" className="hidden" onChange={e => {
                    const f = e.target.files?.[0];
                    if (f && f.size <= 500 * 1024 * 1024) setUploadFile(f);
                    else if (f) alert('Máximo 500MB');
                  }} />

                  {uploadFile ? (
                    <div className="text-center p-6">
                      <FileVideo className="w-12 h-12 text-rose-400 mx-auto mb-3" />
                      <p className="text-white font-bold text-sm mb-1">{uploadFile.name}</p>
                      <p className="text-gray-400 text-xs">{(uploadFile.size / 1024 / 1024).toFixed(1)} MB</p>
                      <button onClick={(e) => { e.stopPropagation(); setUploadFile(null); }} className="mt-3 text-red-400 text-xs font-bold hover:text-red-300 flex items-center gap-1 mx-auto">
                        <X className="w-3 h-3" /> Quitar
                      </button>
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <Upload className="w-10 h-10 text-gray-500 mb-3 mx-auto" />
                      <h3 className="text-white font-black text-base mb-1">Subir Video</h3>
                      <p className="text-xs text-gray-400">Arrastrá MP4, MOV, WEBM.<br />Máximo 500MB. Ratio 9:16 ideal.</p>
                      <div className="mt-4 text-[10px] text-gray-600 space-y-0.5">
                        <p>✓ Duración sugerida: 30s – 2min</p>
                        <p>✓ Buena iluminación frontal</p>
                        <p>✓ Audio claro</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-6 space-y-3">
                  <button onClick={() => onUpdateStatus(req.id, 'internal_review')} className="bg-indigo-600 text-white w-full py-3.5 rounded-xl font-black flex items-center justify-center gap-2 hover:bg-indigo-500 transition-colors">
                    Enviar a Revisión Interna
                  </button>
                  {uploadFile && (
                    <button onClick={() => { onUploadVideo(req.id, uploadFile); onUpdateStatus(req.id, 'delivered'); }} className="bg-rose-600 text-white w-full py-3.5 rounded-xl font-black shadow-lg flex items-center justify-center gap-2 hover:bg-rose-500 transition-colors">
                      <CheckCircle className="w-5 h-5" /> Entregar Video
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* INTERNAL REVIEW */}
            {req.status === 'internal_review' && (
              <div className="bg-indigo-500/10 border border-indigo-500/20 p-8 rounded-2xl">
                <Clock className="w-14 h-14 text-indigo-400 mx-auto mb-5" />
                <h3 className="text-2xl font-black mb-2">En Revisión Interna</h3>
                <p className="text-gray-400 text-sm mb-6">Revisá el video antes de enviarlo al fan.</p>
                <div className="space-y-3">
                  <button onClick={() => onUpdateStatus(req.id, 'recording')} className="bg-white/10 text-white font-bold py-3.5 rounded-xl hover:bg-white/20 transition-colors w-full">Volver a Grabar</button>
                  <button onClick={() => onUpdateStatus(req.id, 'delivered')} className="bg-rose-600 text-white font-black py-3.5 rounded-xl hover:bg-rose-500 w-full shadow-lg">Entregar al Fan</button>
                </div>
              </div>
            )}

            {/* DELIVERED */}
            {req.status === 'delivered' && (
              <div className="bg-green-500/10 border border-green-500/20 p-8 rounded-2xl">
                <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-5" />
                <h3 className="text-2xl font-black mb-2">¡Video Entregado!</h3>
                <p className="text-green-200/60 text-sm mb-6">El fan recibirá el link mágico. Tu pago se libera al ser visto o en 72hs.</p>
                <div className="aspect-video bg-black/50 border border-white/10 rounded-xl flex items-center justify-center mb-5 cursor-pointer hover:border-white/30 transition-colors">
                  <Play className="w-10 h-10 text-white/40" />
                </div>
                <button onClick={() => onUpdateStatus(req.id, 'recording')} className="bg-white/10 text-white font-bold py-3 px-6 rounded-xl hover:bg-white/20 transition-colors border border-white/10">
                  Reemplazar Video (Corrección)
                </button>
              </div>
            )}

            {/* COMPLETED */}
            {req.status === 'completed' && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-8 rounded-2xl text-center">
                <CheckCircle className="w-14 h-14 text-emerald-400 mx-auto mb-5" />
                <h3 className="text-2xl font-black mb-2">Pedido Completado ✓</h3>
                <p className="text-gray-400 text-sm">El fan confirmó la recepción. Pago liberado.</p>
              </div>
            )}

            {/* REJECTED */}
            {req.status === 'rejected' && (
              <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-2xl text-center">
                <X className="w-14 h-14 text-red-400 mx-auto mb-5" />
                <h3 className="text-2xl font-black mb-2">Solicitud Rechazada</h3>
                <p className="text-gray-400 text-sm">El fan ha sido reembolsado.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div>
      <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1.5">{label}</h4>
      <p className={`text-gray-300 bg-white/5 px-3.5 py-2.5 rounded-xl border border-white/10 capitalize ${large ? 'min-h-[100px] text-sm leading-relaxed' : ''}`}>{value}</p>
    </div>
  );
}
