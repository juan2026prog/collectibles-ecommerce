import { useState, useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';

interface AddressAutocompleteProps {
  value: string;
  onChange: (val: string) => void;
  onSelect: (details: any) => void;
}

export default function AddressAutocomplete({ value, onChange, onSelect }: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [skipSearch, setSkipSearch] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync internal query with external value if it changes independently
  useEffect(() => {
    if (value !== query) {
      setQuery(value);
      setSkipSearch(true);
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (skipSearch) {
      setSkipSearch(false);
      return;
    }

    if (!query || query.length < 3) {
      setResults([]);
      return;
    }
    
    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        // Using OpenStreetMap Nominatim for free autocomplete, restricted to Uruguay
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=uy`);
        const data = await res.json();
        setResults(data);
        setIsOpen(true);
      } catch (err) {
        console.error("Autocomplete Error:", err);
      }
      setLoading(false);
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [query]);

  const handleSelect = (result: any) => {
    const addressDetails = result.address || {};
    
    let rawDept = addressDetails.state || addressDetails.county || '';
    rawDept = rawDept.replace(/ department/i, '').replace(/departamento de /i, '').trim();
    
    // Map OSM fields to our form fields
    const mapped = {
      street: `${addressDetails.road || ''} ${addressDetails.house_number || ''}`.trim() || result.display_name.split(',')[0],
      city: addressDetails.city || addressDetails.town || addressDetails.village || addressDetails.suburb || '',
      department: rawDept,
      postal_code: addressDetails.postcode || '',
      country: addressDetails.country || 'Uruguay',
    };
    
    setSkipSearch(true);
    setQuery(mapped.street);
    onChange(mapped.street);
    onSelect(mapped);
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input 
        required
        type="text" 
        className="form-input w-full"
        placeholder="Ej: 18 de Julio 1234..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
        }}
        onFocus={() => { if (results.length > 0) setIsOpen(true) }}
      />
      {loading && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-primary-600 border-t-transparent animate-spin"/>}
      
      {isOpen && results.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden animate-slide-down">
          {results.map((result) => (
            <li 
              key={result.place_id} 
              onClick={() => handleSelect(result)}
              className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors"
            >
              <MapPin className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-dark-900 truncate">
                  {result.display_name.split(',')[0]}
                </span>
                <span className="block text-xs text-gray-500 truncate">
                  {result.display_name.split(',').slice(1).join(',')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
