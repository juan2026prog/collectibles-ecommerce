import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

interface AdminModeContextType {
  isAdminMode: boolean;
  toggleAdminMode: () => void;
}

const AdminModeContext = createContext<AdminModeContextType>({
  isAdminMode: false,
  toggleAdminMode: () => {},
});

export function useAdminMode() {
  return useContext(AdminModeContext);
}

export function AdminModeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  
  // Initialize from localStorage, but only if user is admin
  const [isAdminMode, setIsAdminMode] = useState(() => {
    try {
      const saved = localStorage.getItem('collectibles_admin_mode');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  // Force false if not admin
  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'super_admin') {
      if (isAdminMode) setIsAdminMode(false);
    }
  }, [user, isAdminMode]);

  const toggleAdminMode = () => {
    setIsAdminMode(prev => {
      const next = !prev;
      try {
        localStorage.setItem('collectibles_admin_mode', next.toString());
      } catch (e) {
        // ignore
      }
      return next;
    });
  };

  return (
    <AdminModeContext.Provider value={{ isAdminMode, toggleAdminMode }}>
      {children}
    </AdminModeContext.Provider>
  );
}
