import React, { useState, useEffect, useRef } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import VendorTermsAcceptance from './vendor/VendorTermsAcceptance';
import VendorTermsReminderModal from './vendor/VendorTermsReminderModal';
import { AlertOctagon, LogOut } from 'lucide-react';

interface VendorRouteGuardProps {
  children: React.ReactNode;
}

export default function VendorRouteGuard({ children }: VendorRouteGuardProps) {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [vendor, setVendor] = useState<any>(null);
  const [checkingTerms, setCheckingTerms] = useState(true);
  const [requiresTerms, setRequiresTerms] = useState(false);
  const [activeDoc, setActiveDoc] = useState<any>(null);
  const [showReminder, setShowReminder] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);
  const [isRevalidating, setIsRevalidating] = useState(false);

  // Cached state and initialization flags
  const initialCheckCompletedRef = useRef(false);
  const lastCheckTimeRef = useRef<number>(0);

  if (import.meta.env.DEV && typeof window !== 'undefined' && (localStorage.getItem('e2e_bypass_admin') === 'true' || (window as any).__BYPASS_AUTH_FOR_E2E__)) {
    return <>{children}</>;
  }

  useEffect(() => {
    if (!user || !profile?.is_vendor) {
      setCheckingTerms(false);
      return;
    }

    const isInitial = !initialCheckCompletedRef.current;
    checkVendorTermsAndStatus({ isInitial });
  }, [user?.id, profile?.is_vendor]);

  // Window Focus / Visibility Change Listener for Silent Background Revalidation
  useEffect(() => {
    function handleFocus() {
      if (!user || !profile?.is_vendor || !initialCheckCompletedRef.current) return;
      
      const now = Date.now();
      // Cooldown of 30 seconds to prevent spamming on tab toggling
      if (now - lastCheckTimeRef.current < 30000) return;

      checkVendorTermsAndStatus({ isInitial: false });
    }

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [user?.id, profile?.is_vendor]);

  async function checkVendorTermsAndStatus({ isInitial = false }: { isInitial?: boolean } = {}) {
    lastCheckTimeRef.current = Date.now();

    if (isInitial) {
      setCheckingTerms(true);
    } else {
      setIsRevalidating(true);
    }

    try {
      // 1. Fetch vendor record
      const { data: vendorData, error: vendorErr } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', user!.id)
        .maybeSingle();

      if (vendorErr) console.error('[VendorRouteGuard] Error loading vendor profile:', vendorErr);

      if (vendorData) setVendor(vendorData);

      if (vendorData?.status === 'suspended') {
        setIsSuspended(true);
        setCheckingTerms(false);
        setIsRevalidating(false);
        initialCheckCompletedRef.current = true;
        return;
      } else {
        setIsSuspended(false);
      }

      // 2. Fetch active terms document
      const { data: docData } = await supabase.rpc('get_active_vendor_terms');
      if (docData) setActiveDoc(docData);

      // 3. Check if terms acceptance is required via RPC
      const { data: reqTerms, error: rpcErr } = await supabase.rpc(
        'vendor_requires_terms_acceptance',
        { p_vendor_id: user!.id }
      );

      let needsAcceptance = false;
      if (!rpcErr && typeof reqTerms === 'boolean') {
        needsAcceptance = reqTerms;
      } else {
        needsAcceptance = vendorData?.status === 'pending_terms_acceptance' || vendorData?.status === 'pending';
      }

      setRequiresTerms(needsAcceptance);

      // 4. If legal terms accepted -> check onboarding transition
      if (!needsAcceptance) {
        if (vendorData?.status === 'pending_terms_acceptance' || vendorData?.status === 'pending') {
          await supabase.from('vendors').update({ status: 'onboarding' }).eq('id', user!.id);
        }

        // Check onboarding completion
        const { data: onbData } = await supabase.rpc('get_vendor_onboarding_status', {
          p_vendor_id: user!.id
        });

        const isComplete = onbData?.isComplete === true;
        const currentPath = location.pathname;

        // Auto-redirect to onboarding if incomplete and visiting root vendor path (only on initial or root)
        if (!isComplete && (currentPath === '/vendor' || currentPath === '/vendor/')) {
          const searchParams = new URLSearchParams(location.search);
          const tab = searchParams.get('tab');
          if (!tab || tab === 'overview') {
            navigate('/vendor/onboarding', { replace: true });
          }
        }

        // 5. Check notice preference
        if (docData?.id) {
          const { data: prefData } = await supabase
            .from('vendor_notice_preferences')
            .select('dismissed')
            .eq('vendor_id', user!.id)
            .eq('legal_document_id', docData.id)
            .eq('notice_type', 'vendor_terms_reminder')
            .maybeSingle();

          if (prefData && prefData.dismissed === true) {
            setShowReminder(false);
          } else {
            setShowReminder(true);
          }
        }
      }
    } catch (err) {
      console.error('[VendorRouteGuard] Error during revalidation:', err);
      // On silent revalidation failure, do NOT block the user if we already have initial state
      if (isInitial) {
        setRequiresTerms(true);
      }
    } finally {
      initialCheckCompletedRef.current = true;
      setCheckingTerms(false);
      setIsRevalidating(false);
    }
  }

  // 1. Initial Load Only: Show non-intrusive full-screen loader while resolving first time
  if (authLoading || (checkingTerms && !initialCheckCompletedRef.current)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full" />
          <p className="text-xs text-gray-400 font-semibold tracking-wider uppercase">Preparando tu panel...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!profile?.is_vendor) return <Navigate to="/" replace />;

  if (isSuspended) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-lg w-full text-center space-y-4 shadow-2xl border border-red-100">
          <AlertOctagon className="w-16 h-16 text-red-600 mx-auto" />
          <h2 className="text-2xl font-black text-gray-900">Cuenta de Vendedor Suspendida</h2>
          <p className="text-sm text-gray-600">
            Tu cuenta de vendedor ha sido suspendida temporalmente por la administración de Collectibles.uy.
            No podés acceder a la gestión de productos, pedidos u operaciones de tienda.
          </p>
          <p className="text-xs text-gray-400">
            Para solicitar soporte o reactivación, comunicate con nuestro equipo de atención al cliente.
          </p>
          <div className="pt-4 border-t border-gray-100 flex justify-center">
            <button
              onClick={() => signOut()}
              className="px-6 py-2.5 bg-gray-900 text-white font-bold text-xs rounded-xl hover:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" /> Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Legal Acceptance Mandatory Check (Blocking)
  if (requiresTerms) {
    return <VendorTermsAcceptance onAccepted={() => checkVendorTermsAndStatus({ isInitial: true })} />;
  }

  // 3. Legal Accepted -> Render Panel with optional Notice Reminder Modal
  return (
    <>
      {showReminder && activeDoc && (
        <VendorTermsReminderModal
          doc={activeDoc}
          onDismiss={() => setShowReminder(false)}
        />
      )}
      {children}
    </>
  );
}
