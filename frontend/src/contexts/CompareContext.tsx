import React, { createContext, useContext, useState, useEffect } from 'react';

interface CompareContextType {
  comparedIds: string[];
  addToCompare: (id: string) => boolean;
  removeFromCompare: (id: string) => void;
  clearCompare: () => void;
  isInCompare: (id: string) => boolean;
  compareCount: number;
}

const CompareContext = createContext<CompareContextType | undefined>(undefined);

const STORAGE_KEY = 'collectibles_compare_tray_ids';
const MAX_COMPARE_ITEMS = 4;

export const CompareProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [comparedIds, setComparedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, MAX_COMPARE_ITEMS);
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(comparedIds));
    } catch {
      // ignore
    }
  }, [comparedIds]);

  const addToCompare = (id: string): boolean => {
    if (!id) return false;
    if (comparedIds.includes(id)) return true;
    if (comparedIds.length >= MAX_COMPARE_ITEMS) {
      return false;
    }
    setComparedIds(prev => [...prev, id]);
    return true;
  };

  const removeFromCompare = (id: string) => {
    setComparedIds(prev => prev.filter(x => x !== id));
  };

  const clearCompare = () => {
    setComparedIds([]);
  };

  const isInCompare = (id: string) => {
    return comparedIds.includes(id);
  };

  return (
    <CompareContext.Provider
      value={{
        comparedIds,
        addToCompare,
        removeFromCompare,
        clearCompare,
        isInCompare,
        compareCount: comparedIds.length
      }}
    >
      {children}
    </CompareContext.Provider>
  );
};

export const useCollectorCompare = () => {
  const ctx = useContext(CompareContext);
  if (!ctx) {
    throw new Error('useCollectorCompare must be used within a CompareProvider');
  }
  return ctx;
};
