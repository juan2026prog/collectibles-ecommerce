import React, { useState } from 'react';
import { BookOpen, ShieldCheck, AlertCircle, HelpCircle, ChevronDown, ChevronUp, ExternalLink, Sparkles } from 'lucide-react';
import { IMPORT_GUIDE_TOPICS, COLLECTIBLE_IMPORT_TIPS } from '../../plugins/collector-import-hub/core/importGuideData';

export const ImportGuideSection: React.FC = () => {
  const [openTopicId, setOpenTopicId] = useState<string | null>(IMPORT_GUIDE_TOPICS[0].id);

  const toggleTopic = (id: string) => {
    setOpenTopicId(openTopicId === id ? null : id);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Guía Oficial de Importación para Coleccionistas (Uruguay 2026)</h2>
            <p className="text-xs text-slate-400">
              Conoce las normativas aduaneras (DNA), franquicias, regímenes especiales y cómo proteger tus envíos.
            </p>
          </div>
        </div>

        <div className="space-y-3 mt-6">
          {IMPORT_GUIDE_TOPICS.map((topic) => {
            const isOpen = openTopicId === topic.id;
            return (
              <div
                key={topic.id}
                className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden transition-all"
              >
                <button
                  onClick={() => toggleTopic(topic.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{topic.icon}</span>
                    <span className="font-bold text-white text-sm">{topic.title}</span>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {isOpen && (
                  <div className="p-4 pt-0 border-t border-slate-900 text-xs text-slate-300 space-y-3">
                    <p className="leading-relaxed mt-2 text-slate-300">{topic.summary}</p>
                    <ul className="space-y-1.5 pl-4 list-disc text-slate-400">
                      {topic.keyPoints.map((pt, idx) => (
                        <li key={idx} className="leading-normal">{pt}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4 text-amber-400">
          <Sparkles className="w-5 h-5" />
          <h3 className="font-bold text-base text-white">Consejos Clave de Collectibles.uy</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {COLLECTIBLE_IMPORT_TIPS.map((tip, idx) => (
            <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800/80">
              <h4 className="font-bold text-amber-400 text-xs mb-1.5">{tip.title}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">{tip.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
