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
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ data: any; error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signInWithOtp: (email: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
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
        if (fetchedUserIdRef.current !== session.user.id || event === 'USER_UPDATED') {
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
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) throw error;
      const loadedProfile = data as Profile | null;
      setProfile(loadedProfile);
      setCachedProfile(loadedProfile);
    } catch (err) {
      if (import.meta.env.DEV) console.error('[AuthContext] Failed to fetch profile:', err);
      // Do not clear cachedProfile on network transient errors if user is still logged in
    } finally {
      setLoading(false);
    }
  }

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { data, error };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      }
    });
    return { error };
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

  const value = useMemo(() => ({
    session, user, profile, loading,
    signUp, signIn, signInWithGoogle, signInWithOtp, signOut: signOutFn
  }), [session, user, profile, loading, signUp, signIn, signInWithGoogle, signInWithOtp, signOutFn]);

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
