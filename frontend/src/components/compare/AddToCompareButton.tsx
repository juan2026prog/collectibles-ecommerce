import React from 'react';
import { useCollectorCompare } from '../../contexts/CompareContext';
import { Scale, Check } from 'lucide-react';

interface AddToCompareButtonProps {
  productId: string;
  variant?: 'icon' | 'button' | 'chip';
  className?: string;
}

export const AddToCompareButton: React.FC<AddToCompareButtonProps> = ({
  productId,
  variant = 'icon',
  className = ''
}) => {
  const { addToCompare, removeFromCompare, isInCompare, compareCount } = useCollectorCompare();
  const inCompare = isInCompare(productId);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (inCompare) {
      removeFromCompare(productId);
    } else {
      const added = addToCompare(productId);
      if (!added && compareCount >= 4) {
        alert('Puedes comparar un máximo de 4 productos a la vez. Quita uno de la bandeja para agregar este.');
      }
    }
  };

  if (variant === 'button') {
    return (
      <button
        onClick={handleToggle}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
          inCompare
            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
            : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border-zinc-700/60'
        } ${className}`}
        title={inCompare ? 'Quitar de la comparativa' : 'Agregar al comparador'}
      >
        {inCompare ? <Check size={14} className="text-emerald-400" /> : <Scale size={14} className="text-amber-400" />}
        <span>{inCompare ? 'En Comparador' : 'Comparar'}</span>
      </button>
    );
  }

  if (variant === 'chip') {
    return (
      <button
        onClick={handleToggle}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition border ${
          inCompare
            ? 'bg-amber-500 text-black border-amber-500'
            : 'bg-zinc-900 text-zinc-400 hover:text-white border-zinc-700'
        } ${className}`}
      >
        <Scale size={12} />
        <span>{inCompare ? 'Agregado' : '+ Comparar'}</span>
      </button>
    );
  }

  // Default 'icon'
  return (
    <button
      onClick={handleToggle}
      className={`w-8 h-8 rounded-lg flex items-center justify-center transition border ${
        inCompare
          ? 'bg-amber-500 text-black border-amber-500 shadow-md shadow-amber-500/20'
          : 'bg-zinc-900/90 text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 border-zinc-700/60'
      } ${className}`}
      title={inCompare ? 'Quitar del comparador' : 'Agregar al comparador'}
      aria-label="Comparar producto"
    >
      {inCompare ? <Check size={14} strokeWidth={3} /> : <Scale size={14} />}
    </button>
  );
};

export default AddToCompareButton;
