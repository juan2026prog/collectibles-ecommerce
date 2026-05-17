import React, { useState, useRef, useEffect } from 'react';
import { useCurrency, type Currency } from '../contexts/CurrencyContext';
import { Check, ChevronDown } from 'lucide-react';

const currencies: { code: Currency; label: string }[] = [
  { code: 'UYU', label: 'Peso uruguayo' },
  { code: 'USD', label: 'Dólar' },
  { code: 'ARS', label: 'Peso argentino' },
  { code: 'BRL', label: 'Real brasileño' },
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
        title="Seleccionar moneda"
      >
        <span>{selectedCurrency}</span>
        <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl bg-[#111111] border border-white/10 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 origin-top-right">
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
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-white/5 ${
                    isSelected ? 'text-white font-medium bg-white/5' : 'text-gray-400'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`w-8 font-bold ${isSelected ? 'text-[#f00856]' : 'text-gray-500'}`}>
                      {currency.code}
                    </span>
                    <span>{currency.label}</span>
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
