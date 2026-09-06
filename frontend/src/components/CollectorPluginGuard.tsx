import React from 'react';
import { Navigate } from 'react-router-dom';
import { useCollectorPermissions, type CollectorModuleId } from '../hooks/useCollectorPermissions';

interface CollectorPluginGuardProps {
  module: CollectorModuleId;
  children: React.ReactNode;
}

/**
 * Route / component level guard for the 6 official collector modules.
 * Prevents unauthorized or premature access and keeps loading states clean.
 */
export default function CollectorPluginGuard({ module, children }: CollectorPluginGuardProps) {
  const { isModuleVisible, isLoadingPermissions } = useCollectorPermissions();

  if (isLoadingPermissions) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#f00856] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isModuleVisible(module)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
