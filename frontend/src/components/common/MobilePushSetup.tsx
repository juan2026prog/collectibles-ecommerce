import React, { useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Share2,
  ChevronDown,
  ChevronUp,
  Smartphone,
} from 'lucide-react';
import {
  getMobilePlatform,
  isStandaloneMode,
  type PushStatusInfo,
  type MobilePlatform,
} from '../../lib/pushNotifications';

export interface MobilePushSetupProps {
  userId: string;
  vendorId?: string | null;
  pushStatus: PushStatusInfo;
  onActivate: () => Promise<void>;
  onDeactivate: () => Promise<void>;
  onTest: (e: React.MouseEvent) => Promise<void>;
  registeringPush?: boolean;
  sendingTest?: boolean;
}

export function MobilePushSetup({
  pushStatus,
  onActivate,
  onDeactivate,
  onTest,
  registeringPush = false,
  sendingTest = false,
}: MobilePushSetupProps) {
  const platform: MobilePlatform = getMobilePlatform();
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  // Requirement 2 & 9: NEVER render on Desktop
  if (platform === 'desktop') {
    return null;
  }

  const isIOS = platform === 'ios';
  const standalone = isIOS ? isStandaloneMode() : false;
  const isGranted = pushStatus.state === 'granted';
  const isDenied = pushStatus.state === 'denied';

  return (
    <div
      data-testid="mobile-push-setup-card"
      className="bg-gradient-to-r from-indigo-50/50 to-purple-50/50 p-5 rounded-xl border border-indigo-100 mb-8 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-3">
        <Smartphone className="w-5 h-5 text-indigo-600" />
        <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
          Notificaciones en este celular
        </h4>
      </div>

      {/* CASE 1: iOS Non-Standalone (Safari browser mode) */}
      {isIOS && !standalone && (
        <div className="space-y-4">
          <p className="text-xs text-gray-700 font-medium leading-relaxed">
            Para recibir avisos aunque Collectibles esté cerrado, primero agregá
            Collectibles a tu pantalla de inicio.
          </p>

          <button
            type="button"
            onClick={() => setShowIOSInstructions(!showIOSInstructions)}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
          >
            {showIOSInstructions ? (
              <>
                <span>Ocultar instrucciones</span>
                <ChevronUp className="w-4 h-4" />
              </>
            ) : (
              <>
                <span>Cómo instalar</span>
                <ChevronDown className="w-4 h-4" />
              </>
            )}
          </button>

          {showIOSInstructions && (
            <div
              data-testid="ios-pwa-instructions"
              className="bg-white/80 p-4 rounded-lg border border-indigo-100 text-xs text-gray-700 space-y-2 mt-2"
            >
              <p className="font-bold text-gray-900 mb-2">Instrucciones de instalación:</p>
              <ol className="list-decimal list-inside space-y-1.5 font-medium text-gray-600">
                <li>Abrí Collectibles en Safari.</li>
                <li className="flex items-center gap-1 inline-flex flex-wrap">
                  Tocá Compartir <Share2 className="w-3.5 h-3.5 inline text-indigo-600 mx-0.5" />.
                </li>
                <li>Elegí &quot;Agregar a pantalla de inicio&quot;.</li>
                <li>Abrí Collectibles desde el nuevo icono.</li>
                <li>Volvé a Configuración &gt; Notificaciones.</li>
              </ol>
            </div>
          )}
        </div>
      )}

      {/* CASE 2: iOS Standalone or Android or Other Mobile */}
      {(!isIOS || standalone) && (
        <div className="space-y-4">
          {/* iOS Standalone Status Header */}
          {isIOS && standalone && (
            <p className="text-xs text-gray-700 font-medium">
              Collectibles está instalado en este celular.
            </p>
          )}

          {/* Android / Other Mobile Subtitle */}
          {!isIOS && !isGranted && !isDenied && (
            <p className="text-xs text-gray-700 font-medium">
              Recibí avisos de nuevas ventas y eventos importantes aunque Collectibles esté cerrado.
            </p>
          )}

          {/* PERMISSION DENIED STATE */}
          {isDenied && (
            <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-lg text-xs text-amber-800 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Las notificaciones están bloqueadas para Collectibles en este navegador.</span>
              </div>
              <p className="pl-5 text-amber-700">
                Permitilas desde Configuración del sitio &gt; Notificaciones.
              </p>
            </div>
          )}

          {/* ACTIVE / GRANTED STATE */}
          {isGranted && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>✅ Este celular recibe notificaciones en segundo plano.</span>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={onTest}
                  disabled={sendingTest}
                  className="text-xs bg-emerald-600 text-white font-bold px-3.5 py-2 rounded-lg hover:bg-emerald-700 transition-all shadow-sm active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${sendingTest ? 'animate-spin' : ''}`} />
                  {sendingTest ? 'Enviando...' : 'Enviar prueba'}
                </button>

                <button
                  type="button"
                  onClick={onDeactivate}
                  className="text-xs bg-white text-red-600 border border-red-200 font-bold px-3.5 py-2 rounded-lg hover:bg-red-50 transition-all active:scale-95 shadow-sm"
                >
                  Desactivar
                </button>
              </div>
            </div>
          )}

          {/* INACTIVE / DEFAULT STATE (Can request permission) */}
          {!isGranted && !isDenied && (
            <div className="pt-1">
              <button
                type="button"
                onClick={onActivate}
                disabled={registeringPush}
                className="text-xs bg-indigo-600 text-white font-bold px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition-all shadow-sm active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                <BellRing className="w-4 h-4" />
                {registeringPush ? 'Activando...' : 'Activar notificaciones'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MobilePushSetup;
