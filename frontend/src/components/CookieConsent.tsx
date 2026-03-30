import { useState, useEffect } from 'react';

export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookieSettings');
    if (!consent) {
      setShow(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookieSettings', 'accepted');
    setShow(false);
    // Reload dynamically injects scripts bound by privacy checks
    window.location.reload(); 
  };

  const handleDecline = () => {
    localStorage.setItem('cookieSettings', 'declined');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 pb-safe sm:p-6 lg:p-8 pointer-events-none animate-slide-up">
      <div className="max-w-7xl mx-auto flex justify-center sm:justify-start lg:justify-end">
        <div className="bg-white border border-gray-100 rounded-2xl shadow-2xl p-6 sm:p-8 max-w-sm pointer-events-auto">
          <h3 className="font-extrabold text-xl text-dark-900 mb-2">Privacidad 🍪</h3>
          <p className="text-sm font-medium text-gray-500 mb-6 leading-relaxed">
            Utilizamos cookies propias y de terceros para optimizar la experiencia, analizar nuestro tráfico (Analytics) y generar publicidad personalizada (Meta Pixel). 
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={handleDecline} className="btn-secondary flex-1 text-sm py-2.5 px-4 whitespace-nowrap bg-gray-50 hover:bg-gray-100 border-0">
              Solo Esenciales
            </button>
            <button onClick={handleAccept} className="btn-primary flex-1 text-sm py-2.5 px-4 whitespace-nowrap shadow-md">
              Aceptar Todas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
