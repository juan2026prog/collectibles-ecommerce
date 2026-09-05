import React, { useState } from 'react';
import { X, MapPin, Copy, Check, Shield, Info } from 'lucide-react';
import type { UserImportProfile, ImportCourier } from '../../plugins/collector-import-hub/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile: UserImportProfile | null;
  couriers: ImportCourier[];
  onSaveProfile: (profile: Partial<UserImportProfile>) => void;
}

export const UserCourierProfileModal: React.FC<Props> = ({
  isOpen,
  onClose,
  profile,
  couriers,
  onSaveProfile
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [suiteNumber, setSuiteNumber] = useState(profile?.suite_number || '');
  const [accountName, setAccountName] = useState(profile?.account_name || '');
  const [selectedCourierCode, setSelectedCourierCode] = useState(profile?.preferred_courier_code || 'USX');
  const [addressLine1, setAddressLine1] = useState(profile?.usa_address_line1 || '8298 NW 68th St');
  const [addressLine2, setAddressLine2] = useState(profile?.usa_address_line2 || '');
  const [city, setCity] = useState(profile?.usa_city || 'Miami');
  const [state, setState] = useState(profile?.usa_state || 'FL');
  const [zip, setZip] = useState(profile?.usa_zip || '33166');
  const [phone, setPhone] = useState(profile?.phone || '+1 (305) 592-0839');

  if (!isOpen) return null;

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveProfile({
      preferred_courier_code: selectedCourierCode,
      suite_number: suiteNumber,
      account_name: accountName,
      usa_address_line1: addressLine1,
      usa_address_line2: suiteNumber ? `Suite ${suiteNumber}` : addressLine2,
      usa_city: city,
      usa_state: state,
      usa_zip: zip,
      phone: phone
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-white text-lg">Dirección de Envío Miami (USA Casillero)</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5 overflow-y-auto">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-white mb-0.5">Usa estos datos en eBay, Amazon o tiendas de USA</p>
              <p className="text-slate-400">
                Al comprar en el exterior, coloca exactamente tu número de suite o casilla para que el courier asocie el paquete a tu cuenta sin demoras.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Courier Principal
              </label>
              <select
                value={selectedCourierCode}
                onChange={(e) => setSelectedCourierCode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              >
                {couriers.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                N° de Suite / Casillero *
              </label>
              <input
                type="text"
                required
                placeholder="Ej: USX-84920"
                value={suiteNumber}
                onChange={(e) => setSuiteNumber(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-mono font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Nombre en la Cuenta (Full Name)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Tu Nombre Completo"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
              {accountName && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(accountName, 'name')}
                  className="px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl flex items-center gap-1 text-xs"
                >
                  {copiedField === 'name' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-800">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dirección Física en Miami</h4>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Address Line 1 (Calle):</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(addressLine1, 'addr1')}
                  className="px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl flex items-center text-xs"
                >
                  {copiedField === 'addr1' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Address Line 2 (Suite / Unit):</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={suiteNumber ? `Suite ${suiteNumber}` : addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(suiteNumber ? `Suite ${suiteNumber}` : addressLine2, 'addr2')}
                  className="px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl flex items-center text-xs"
                >
                  {copiedField === 'addr2' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">City:</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">State:</label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">ZIP Code:</label>
                <input
                  type="text"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              Cerrar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 rounded-xl transition-all shadow-lg shadow-amber-500/20"
            >
              Guardar Perfil de Casilla
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
