import React, { useState, useRef, useEffect } from 'react';
import { useCurrency, type Currency } from '../contexts/CurrencyContext';
import { Check, ChevronDown } from 'lucide-react';

// Uruguay active options: USD | UYU (Default USD)
const currencies: { code: Currency; label: string; flag: string }[] = [
  { code: 'USD', label: 'Dólar (USD)', flag: '🇺🇸' },
  { code: 'UYU', label: 'Peso uruguayo (UYU)', flag: '🇺🇾' },
];

export function CurrencySelector() {
  const { selectedCurrency, setSelectedCurrency } = useCurrency();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative z-50" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 hover:border-[#f00856] transition-colors duration-200 text-sm font-medium text-white"
        title="Seleccionar moneda de visualización"
      >
        <span className="font-semibold">{selectedCurrency}</span>
        <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-52 rounded-xl bg-[#111111] border border-white/10 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 origin-top-right">
          <div className="py-1">
            {currencies.map((currency) => {
              const isSelected = selectedCurrency === currency.code;
              return (
                <button
                  key={currency.code}
                  onClick={() => {
                    setSelectedCurrency(currency.code);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-white/5"
                >
                  <span className="flex items-center gap-2">
                    <span>{currency.flag}</span>
                    <span className="w-10 font-bold">
                      {currency.code}
                    </span>
                    <span className="text-xs text-gray-400">{currency.code === 'USD' ? 'Canónica' : 'Local'}</span>
                  </span>
                  {isSelected && <Check size={16} className="text-[#f00856]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
