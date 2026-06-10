import { useAuth } from '../contexts/AuthContext';
import { useAdminMode } from '../contexts/AdminModeContext';
import { Settings, Eye, EyeOff } from 'lucide-react';

export default function AdminModeToggle() {
  const { user } = useAuth();
  const { isAdminMode, toggleAdminMode } = useAdminMode();

  // Only render if the user is an admin
  if (user?.role !== 'admin' && user?.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-[9999]">
      <button
        onClick={toggleAdminMode}
        className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold shadow-xl border-2 transition-all duration-300 ${
          isAdminMode 
            ? 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700' 
            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
        }`}
      >
        {isAdminMode ? (
          <>
            <Settings className="w-4 h-4 animate-spin-slow" />
            <span>Modo Admin: ON</span>
          </>
        ) : (
          <>
            <Eye className="w-4 h-4" />
            <span>Modo Admin: OFF</span>
          </>
        )}
      </button>
    </div>
  );
}
