import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFeatures } from '../contexts/FeatureToggleContext';
import { useSiteSettings } from '../hooks/useSiteSettings';

export type CollectorModuleId = 
  | 'ai_search' 
  | 'radar' 
  | 'vault' 
  | 'compare' 
  | 'academy' 
  | 'customs' 
  | 'import_hub';

export interface CollectorPermissions {
  isPluginsAdminOnly: boolean;
  canAccessCollectorPlugins: boolean;
  isLoadingPermissions: boolean;
  isModuleVisible: (moduleId: CollectorModuleId) => boolean;
}

/**
 * Single source of truth for collector module permissions & visibility.
 * Prevents race conditions and permission flicker between Supabase auth hydration,
 * site settings, and feature toggles.
 */
export function useCollectorPermissions(): CollectorPermissions {
  const { profile, user, loading: authLoading } = useAuth();
  const { features } = useFeatures();
  const { settings, loaded: settingsLoaded } = useSiteSettings();

  const isPluginsAdminOnly = settings['collector_plugins_admin_only'] === 'true';
  const isAdmin = !!profile?.is_admin;

  const canAccessCollectorPlugins = !isPluginsAdminOnly || isAdmin;
  const isLoadingPermissions = (authLoading && !!user) || !settingsLoaded;

  const isModuleVisible = (moduleId: CollectorModuleId): boolean => {
    if (isPluginsAdminOnly && !isAdmin) {
      return false;
    }

    switch (moduleId) {
      case 'ai_search':
        return !!features.aiSearchEnabled;
      case 'radar':
        return !!features.radarEnabled;
      case 'vault':
        return !!features.collectorVaultEnabled;
      case 'compare':
        return !!features.collectorCompareEnabled;
      case 'academy':
        return !!features.collectorAcademyEnabled;
      case 'customs':
      case 'import_hub':
        return !!features.importHubEnabled || !!features.customsFranchiseEnabled;
      default:
        return false;
    }
  };

  return useMemo(() => ({
    isPluginsAdminOnly,
    canAccessCollectorPlugins,
    isLoadingPermissions,
    isModuleVisible
  }), [isPluginsAdminOnly, canAccessCollectorPlugins, isLoadingPermissions, features, isAdmin]);
}
