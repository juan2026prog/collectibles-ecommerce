import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Star, Video, Image as ImageIcon, Link2, Download } from 'lucide-react';

export default function AdminArtists() {
  const [activeTab, setActiveTab] = useState<'prints' | 'cameo'>('prints');
  const [loading, setLoading] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Módulo Artistas y Cameo</h2>
          <p className="text-gray-500 mt-1">Gestión de Prints On-Demand y solicitudes de videos personalizados.</p>
        </div>
      </div>

      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('prints')}
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'prints' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Posters & Prints
          </div>
        </button>
        <button
          onClick={() => setActiveTab('cameo')}
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'cameo' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4" />
            Saludos Cameo
          </div>
        </button>
      </div>

      {activeTab === 'prints' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Print-on-Demand (Proteger Archivos)</h3>
          <p className="max-w-md mx-auto mb-4">Los pedidos de artes impresos se centralizan aquí. Solo el rol "Taller" puede descargar el <strong className="text-gray-800">print_file_url</strong> (CMYK Alta Resolución).</p>
          <button className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700">Explorar Catálogo de Artistas</button>
        </div>
      )}

      {activeTab === 'cameo' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          <Video className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Moderación de Videos Cameo</h3>
          <p className="max-w-md mx-auto">Reglas de negocio aplicadas: Los videos tienen un máximo de <strong className="text-gray-800">120 segundos</strong> y requieren <strong className="text-gray-800">Marca de Agua</strong> de la plataforma. El artista sube el video, nosotros lo transcodificamos y estampamos antes de enviarlo al cliente final.</p>
        </div>
      )}
    </div>
  );
}
