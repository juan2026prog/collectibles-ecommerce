import { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { loginOneSignalUser, logoutOneSignalUser } from '../lib/pushNotifications';

interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  is_vendor: boolean;
  is_artist: boolean;
  is_affiliate: boolean;
  is_super_admin?: boolean;
  role?: string | null;
  username?: string | null;
  collector_nickname?: string | null;
  user_roles?: { role: string }[];
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isSuperAdmin: boolean;
  signUp: (email: string, password: string) => Promise<{ data: any; error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signInWithOtp: (email: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AUTH_PROFILE_CACHE_KEY = 'collectibles_auth_profile_cache';

function getCachedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(AUTH_PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCachedProfile(p: Profile | null) {
  try {
    if (p) {
      localStorage.setItem(AUTH_PROFILE_CACHE_KEY, JSON.stringify(p));
    } else {
      localStorage.removeItem(AUTH_PROFILE_CACHE_KEY);
    }
  } catch {}
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const cachedProfile = useMemo(() => getCachedProfile(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(cachedProfile);
  const [loading, setLoading] = useState(true);
  const fetchedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Listen for auth changes (handles initial session & updates)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loginOneSignalUser(session.user.id);
        // Only fetch profile if user changed or profile was not fetched yet
        if (fetchedUserIdRef.current !== session.user.id || event === 'USER_UPDATED' || event === 'SIGNED_IN') {
          fetchedUserIdRef.current = session.user.id;
          fetchProfile(session.user.id);
        }
      } else {
        logoutOneSignalUser();
        fetchedUserIdRef.current = null;
        setProfile(null);
        setCachedProfile(null);
        setLoading(false);
      }
    });

    // Fallback getSession check (only fetch if onAuthStateChange hasn't already initialized it)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && fetchedUserIdRef.current !== session.user.id) {
        setSession(session);
        setUser(session.user);
        fetchedUserIdRef.current = session.user.id;
        fetchProfile(session.user.id);
      } else if (!session?.user && !fetchedUserIdRef.current) {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    try {
      // 1. Fetch profile row
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) throw profileError;

      // 2. Fetch user roles explicitly
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      const roles = Array.isArray(rolesData) ? rolesData.map((r: any) => r.role) : [];
      const userEmail = profileData?.email || user?.email || '';

      const isSuper = Boolean(
        roles.includes('super_admin') ||
        roles.includes('superadmin') ||
        roles.includes('god_admin') ||
        profileData?.role === 'super_admin' ||
        profileData?.role === 'superadmin' ||
        profileData?.role === 'god_admin' ||
        userEmail === 'juanmacastillo2008@gmail.com'
      );

      const isAdmin = Boolean(
        isSuper ||
        roles.includes('admin') ||
        profileData?.role === 'admin' ||
        profileData?.is_admin === true
      );

      const loadedProfile: Profile | null = profileData ? {
        ...profileData,
        role: isSuper ? 'super_admin' : (isAdmin ? 'admin' : (profileData.role || 'customer')),
        is_admin: isAdmin,
        is_super_admin: isSuper,
        user_roles: rolesData || []
      } : null;

      setProfile(loadedProfile);
      setCachedProfile(loadedProfile);
    } catch (err) {
      if (import.meta.env.DEV) console.error('[AuthContext] Failed to fetch profile:', err);
    } finally {
      setLoading(false);
    }
  }

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  }, [user?.id]);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { data, error };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      }
    });
    return { data, error };
  }, []);

  const signInWithOtp = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ 
      email,
      options: { emailRedirectTo: `${window.location.origin}/` }
    });
    return { error };
  }, []);

  const signOutFn = useCallback(async () => {
    await logoutOneSignalUser();
    await supabase.auth.signOut();
    setProfile(null);
    setCachedProfile(null);
  }, []);

  const isSuperAdmin = Boolean(
    profile?.role === 'super_admin' ||
    profile?.role === 'superadmin' ||
    profile?.role === 'god_admin' ||
    profile?.is_super_admin === true ||
    (profile?.user_roles && profile.user_roles.some((r: any) => r.role === 'super_admin' || r.role === 'god_admin')) ||
    user?.email === 'juanmacastillo2008@gmail.com' ||
    profile?.email === 'juanmacastillo2008@gmail.com'
  );

  const value = useMemo(() => ({
    session, user, profile, loading, isSuperAdmin,
    signUp, signIn, signInWithGoogle, signInWithOtp, signOut: signOutFn,
    refreshProfile
  }), [session, user, profile, loading, isSuperAdmin, signUp, signIn, signInWithGoogle, signInWithOtp, signOutFn, refreshProfile]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
