import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Globe, DollarSign } from 'lucide-react';
import { useLocale } from '../contexts/LocaleContext';

type Mode = 'language' | 'currency' | 'both';

interface LocaleSwitcherProps {
  mode?: Mode;
  compact?: boolean;   // show flags/codes only (for header)
  className?: string;
}

const LANGUAGES = [
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
] as const;

const CURRENCIES = [
  { code: 'UYU', label: 'Peso Uruguayo', symbol: '$U', flag: '🇺🇾' },
  { code: 'USD', label: 'US Dollar',     symbol: 'US$', flag: '🇺🇸' },
  { code: 'ARS', label: 'Peso Argentino', symbol: '$', flag: '🇦🇷' },
] as const;

export default function LocaleSwitcher({ mode = 'both', compact = false, className = '' }: LocaleSwitcherProps) {
  const { language, currency, setLanguage, setCurrency } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentLang = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];
  const currentCurr = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0];

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (mode === 'language' || mode === 'currency') {
    // Simple inline selects — used on profile pages
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {mode === 'language' && (
          <label className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-gray-400" />
            <select
              value={language}
              onChange={e => setLanguage(e.target.value as any)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer"
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
              ))}
            </select>
          </label>
        )}
        {mode === 'currency' && (
          <label className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-gray-400" />
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value as any)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer"
            >
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.flag} {c.symbol} - {c.label}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    );
  }

  // 'both' mode — dropdown panel for header
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 ${compact
          ? 'px-2 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors'
          : 'px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors'
        }`}
        aria-label="Idioma y moneda"
      >
        {/* Language: flag + code */}
        <span className="text-base leading-none">{currentLang.flag}</span>
        <span className="font-bold">{currentLang.code.toUpperCase()}</span>
        <span className="opacity-30 mx-0.5">|</span>
        {/* Currency: $ sign + code */}
        <span className="font-bold text-gray-500">$</span>
        <span className="font-bold">{currentCurr.code}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Language section */}
          <div className="p-3 border-b border-gray-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 px-1">
              <Globe className="inline w-3 h-3 mr-1" />Idioma
            </p>
            <div className="grid grid-cols-2 gap-1">
              {LANGUAGES.map(l => (
                <button
                  key={l.code}
                  onClick={() => { setLanguage(l.code as any); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                    language === l.code
                      ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-300'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-lg">{l.flag}</span>
                  <span>{l.label}</span>
                  {language === l.code && <span className="ml-auto text-primary-500">✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Currency section */}
          <div className="p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 px-1">
              <DollarSign className="inline w-3 h-3 mr-1" />Moneda
            </p>
            <div className="flex flex-col gap-1">
              {CURRENCIES.map(c => (
                <button
                  key={c.code}
                  onClick={() => { setCurrency(c.code as any); }}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                    currency === c.code
                      ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-300'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-lg">{c.flag}</span>
                  <div className="text-left">
                    <div className="font-bold">{c.code}</div>
                    <div className="text-xs text-gray-500 font-normal">{c.label}</div>
                  </div>
                  {currency === c.code && <span className="ml-auto text-primary-500">✓</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
            <p className="text-center text-xs text-gray-400">
              {language === 'es' ? 'Cambios guardados automáticamente' : 'Changes saved automatically'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Export subcomponents for reuse
export function LanguageSelector({ className = '' }: { className?: string }) {
  return <LocaleSwitcher mode="language" className={className} />;
}

export function CurrencySelector({ className = '' }: { className?: string }) {
  return <LocaleSwitcher mode="currency" className={className} />;
}
