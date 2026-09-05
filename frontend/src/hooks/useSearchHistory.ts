import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'collectibles_recent_searches';
const MAX_HISTORY = 6;

export const POPULAR_SEARCH_TERMS = [
  'Batman',
  'Dragon Ball',
  'Hot Toys',
  'S.H.Figuarts',
  'NECA Horror',
  'Preventas',
  'Marvel Legends',
  'Star Wars'
];

export function useSearchHistory() {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed.slice(0, MAX_HISTORY));
        }
      }
    } catch (e) {
      console.error('Error loading recent searches:', e);
    }
  }, []);

  const saveSearch = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return;

    setRecentSearches(prev => {
      const filtered = prev.filter(q => q.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, MAX_HISTORY);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Error saving recent search:', e);
      }
      return updated;
    });
  }, []);

  const removeSearch = useCallback((queryToRemove: string) => {
    setRecentSearches(prev => {
      const updated = prev.filter(q => q.toLowerCase() !== queryToRemove.toLowerCase());
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Error removing recent search:', e);
      }
      return updated;
    });
  }, []);

  const clearAllSearches = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setRecentSearches([]);
    } catch (e) {
      console.error('Error clearing recent searches:', e);
    }
  }, []);

  return {
    recentSearches,
    popularTerms: POPULAR_SEARCH_TERMS,
    saveSearch,
    removeSearch,
    clearAllSearches
  };
}
