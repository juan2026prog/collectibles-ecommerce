import React from 'react';
import { 
  type CardDetails, 
  CARD_FORMAT_OPTIONS, 
  GRADING_COMPANY_OPTIONS, 
  SPORT_OPTIONS, 
  LANGUAGE_OPTIONS,
  isSportsCardCategory,
  isTCGCategory
} from '../../config/tcgConfig';

interface CardDetailsFormSectionProps {
  categoryId?: string | null;
  categories: any[];
  cardDetails: CardDetails;
  onChange: (updatedDetails: CardDetails) => void;
}

export const CardDetailsFormSection: React.FC<CardDetailsFormSectionProps> = ({
  categoryId,
  categories,
  cardDetails,
  onChange
}) => {
  const isSports = isSportsCardCategory(categoryId, categories);
  const isTCG = isTCGCategory(categoryId, categories);

  if (!isSports && !isTCG) return null;

  const update = (field: keyof CardDetails, value: any) => {
    onChange({
      ...cardDetails,
      [field]: value
    });
  };

  return (
    <div className="bg-white border-2 border-emerald-500/30 shadow-md rounded-xl overflow-hidden my-6 animate-fade-in">
      {/* Header */}
      <div className="px-5 py-3 bg-gradient-to-r from-emerald-900 to-teal-800 text-white flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🃏</span>
          <div>
            <h4 className="font-bold text-sm tracking-wide text-emerald-100">
              {isSports ? 'SPORTS CARDS — DETALLES DE LA CARTA' : 'TCG — DETALLES DEL JUEGO DE CARTAS'}
            </h4>
            <p className="text-[10px] text-emerald-200/80">
              Atributos dinámicos especializados para tiendas y coleccionistas TCG.
            </p>
          </div>
        </div>
        <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 px-2.5 py-1 rounded-full">
          TCG Store Enabled
        </span>
      </div>

      <div className="p-6 space-y-6 bg-slate-50/40">
        {/* SPORTS CARDS FIELDS */}
        {isSports && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Deporte */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                  Deporte (Sport)
                </label>
                <select
                  value={cardDetails.sport || ''}
                  onChange={e => update('sport', e.target.value)}
                  className="w-full p-2.5 border rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500/20 outline-none"
                >
                  <option value="">-- Seleccionar Deporte --</option>
                  {SPORT_OPTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Jugador / Personaje */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                  Jugador / Personaje (Player)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Lionel Messi"
                  value={cardDetails.player_character || ''}
                  onChange={e => update('player_character', e.target.value)}
                  className="w-full p-2.5 border rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500/20 outline-none font-medium"
                />
              </div>

              {/* Equipo / Selección */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                  Equipo / Selección (Team)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Selección Argentina"
                  value={cardDetails.team || ''}
                  onChange={e => update('team', e.target.value)}
                  className="w-full p-2.5 border rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500/20 outline-none"
                />
              </div>

              {/* Formato */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                  Formato (Format)
                </label>
                <select
                  value={cardDetails.format || 'Single Card'}
                  onChange={e => update('format', e.target.value)}
                  className="w-full p-2.5 border rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500/20 outline-none"
                >
                  {CARD_FORMAT_OPTIONS.map(fmt => (
                    <option key={fmt} value={fmt}>{fmt}</option>
                  ))}
                </select>
              </div>

              {/* Colección / Set */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                  Set / Colección (Set)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Panini Prizm"
                  value={cardDetails.set_collection || ''}
                  onChange={e => update('set_collection', e.target.value)}
                  className="w-full p-2.5 border rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500/20 outline-none"
                />
              </div>

              {/* Año / Temporada */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                  Año / Temporada (Season)
                </label>
                <input
                  type="text"
                  placeholder="Ej: 2024"
                  value={cardDetails.year_season || ''}
                  onChange={e => update('year_season', e.target.value)}
                  className="w-full p-2.5 border rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500/20 outline-none"
                />
              </div>

              {/* Número de Carta */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                  Número de Carta (Card #)
                </label>
                <input
                  type="text"
                  placeholder="Ej: #10"
                  value={cardDetails.card_number || ''}
                  onChange={e => update('card_number', e.target.value)}
                  className="w-full p-2.5 border rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500/20 outline-none font-mono"
                />
              </div>
            </div>

            {/* TOGGLES: Rookie, Autograph, Graded */}
            <div className="pt-4 border-t border-slate-200/60 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="flex items-center gap-3 p-3 bg-white border rounded-lg cursor-pointer hover:border-emerald-300 transition-all">
                <input
                  type="checkbox"
                  checked={!!cardDetails.is_rookie}
                  onChange={e => update('is_rookie', e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Rookie Card</span>
                  <span className="text-[10px] text-slate-400 block">Año debut del jugador</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-white border rounded-lg cursor-pointer hover:border-emerald-300 transition-all">
                <input
                  type="checkbox"
                  checked={!!cardDetails.is_autograph}
                  onChange={e => update('is_autograph', e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Autógrafo (Signed)</span>
                  <span className="text-[10px] text-slate-400 block">Firma original certificada</span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-white border rounded-lg cursor-pointer hover:border-emerald-300 transition-all">
                <input
                  type="checkbox"
                  checked={!!cardDetails.is_graded}
                  onChange={e => update('is_graded', e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Graded (Graduada)</span>
                  <span className="text-[10px] text-slate-400 block">Encapsulada y certificada</span>
                </div>
              </label>
            </div>
          </>
        )}

        {/* TCG SPECIFIC FIELDS */}
        {isTCG && (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Juego (Game) */}
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                Juego / TCG (Game)
              </label>
              <input
                type="text"
                placeholder="Ej: Pokémon, Yu-Gi-Oh!, Magic"
                value={cardDetails.game || ''}
                onChange={e => update('game', e.target.value)}
                className="w-full p-2.5 border rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500/20 outline-none font-bold text-slate-800"
              />
            </div>

            {/* Set / Expansion */}
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                Set / Expansión (Set)
              </label>
              <input
                type="text"
                placeholder="Ej: 151, Crown Zenith"
                value={cardDetails.set_collection || ''}
                onChange={e => update('set_collection', e.target.value)}
                className="w-full p-2.5 border rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500/20 outline-none"
              />
            </div>

            {/* Número de Carta */}
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                Número de Carta (Card #)
              </label>
              <input
                type="text"
                placeholder="Ej: 199/165"
                value={cardDetails.card_number || ''}
                onChange={e => update('card_number', e.target.value)}
                className="w-full p-2.5 border rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500/20 outline-none font-mono"
              />
            </div>

            {/* Rareza */}
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                Rareza (Rarity)
              </label>
              <input
                type="text"
                placeholder="Ej: Secret Illustration Rare, Holo Rare"
                value={cardDetails.rarity || ''}
                onChange={e => update('rarity', e.target.value)}
                className="w-full p-2.5 border rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500/20 outline-none"
              />
            </div>

            {/* Idioma */}
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                Idioma (Language)
              </label>
              <select
                value={cardDetails.language || 'Español'}
                onChange={e => update('language', e.target.value)}
                className="w-full p-2.5 border rounded-lg text-xs bg-white focus:ring-2 focus:ring-emerald-500/20 outline-none"
              >
                {LANGUAGE_OPTIONS.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            {/* Toggle Graded */}
            <div className="flex items-center">
              <label className="flex items-center gap-3 p-2.5 bg-white border rounded-lg cursor-pointer hover:border-emerald-300 w-full">
                <input
                  type="checkbox"
                  checked={!!cardDetails.is_graded}
                  onChange={e => update('is_graded', e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Graded (Graduada)</span>
                  <span className="text-[10px] text-slate-400 block">Certificada PSA/BGS</span>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* CONDITIONAL GRADED FIELDS (If Graded is checked) */}
        {cardDetails.is_graded && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
            <div>
              <label className="text-[10px] font-black text-emerald-900 uppercase tracking-widest block mb-1">
                Compañía de Graduación (Grading Company)
              </label>
              <select
                value={cardDetails.grading_company || 'PSA'}
                onChange={e => update('grading_company', e.target.value)}
                className="w-full p-2.5 border border-emerald-300 rounded-lg text-xs bg-white font-bold text-slate-800 outline-none"
              >
                {GRADING_COMPANY_OPTIONS.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black text-emerald-900 uppercase tracking-widest block mb-1">
                Nota de Graduación (Grade)
              </label>
              <input
                type="text"
                placeholder="Ej: 10 (Gem Mint) / 9.5"
                value={cardDetails.grade || ''}
                onChange={e => update('grade', e.target.value)}
                className="w-full p-2.5 border border-emerald-300 rounded-lg text-xs bg-white font-black text-emerald-800 outline-none"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
