import { useEffect, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

/**
 * WhatsApp Floating Action Button
 * 
 * Reads `social_whatsapp_url` and `social_whatsapp_enabled` from site_settings.
 * Shows a pill-shaped FAB at bottom-right with a tooltip message.
 * 
 * To configure: Admin > Configuración > Redes Sociales > WhatsApp
 */
export default function WhatsAppFAB() {
  const [url, setUrl] = useState('');
  const [shown, setShown] = useState(true);
  const [pulsing, setPulsing] = useState(true);

  useEffect(() => {
    supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['social_whatsapp_enabled', 'social_whatsapp_url'])
      .then(({ data }) => {
        const settings: Record<string, string> = {};
        data?.forEach(d => (settings[d.key] = d.value));
        if (settings['social_whatsapp_enabled'] === 'true' && settings['social_whatsapp_url']) {
          setUrl(settings['social_whatsapp_url']);
        }
      });

    // Stop pulsing after 4 seconds (only draw attention once)
    const t = setTimeout(() => setPulsing(false), 4000);
    return () => clearTimeout(t);
  }, []);

  if (!url || !shown) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 group/fab">
      {/* Tooltip bubble */}
      <div className="bg-white text-gray-800 text-sm font-semibold px-4 py-2 rounded-2xl shadow-xl border border-gray-100 opacity-0 translate-y-2 group-hover/fab:opacity-100 group-hover/fab:translate-y-0 transition-all duration-200 whitespace-nowrap">
        💬 ¿Necesitás ayuda?
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-white -mt-px" />
      </div>

      <div className="flex items-center gap-2">
        {/* Dismiss button */}
        <button
          onClick={() => setShown(false)}
          className="w-7 h-7 bg-white/80 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white transition-all opacity-0 group-hover/fab:opacity-100"
          aria-label="Cerrar WhatsApp"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Main button */}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="relative flex items-center justify-center w-14 h-14 bg-[#25D366] hover:bg-[#20b858] text-white rounded-full shadow-[0_8px_30px_rgba(37,211,102,0.4)] hover:shadow-[0_12px_40px_rgba(37,211,102,0.5)] transition-all duration-300 hover:scale-110"
          aria-label="Contactar por WhatsApp"
        >
          {/* Pulse ring */}
          {pulsing && (
            <span className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-40" />
          )}
          <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.878-.788-1.482-1.761-1.655-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a5.8 5.8 0 0 0-.571-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
          </svg>
        </a>
      </div>
    </div>
  );
}
