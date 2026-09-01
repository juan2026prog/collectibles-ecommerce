import React from 'react';
import { Navigate } from 'react-router-dom';
import Shop from './Shop';
import { useInternationalSettings } from '../hooks/useInternationalSettings';
import SEO from '../components/SEO';

export default function InternationalStorefront() {
  const { publicEnabled, loaded } = useInternationalSettings();

  if (!loaded) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // If international public section is not enabled by Admin, redirect safely to Home
  if (!publicEnabled) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <SEO
        title="Productos Internacionales | Collectibles.uy"
        description="Encontrá productos que no están disponibles localmente y recibilos utilizando tu casilla en EE.UU."
      />
      <Shop isInternational={true} />
    </>
  );
}
