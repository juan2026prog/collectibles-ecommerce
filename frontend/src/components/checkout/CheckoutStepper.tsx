import React from 'react';
import { Check, User, Truck, CreditCard } from 'lucide-react';

interface CheckoutStepperProps {
  currentStep: number; // 1, 2, or 3
  onStepClick?: (step: number) => void;
}

export const CheckoutStepper: React.FC<CheckoutStepperProps> = ({ currentStep, onStepClick }) => {
  const steps = [
    { id: 1, name: 'Facturación', label: 'Datos personales', icon: User },
    { id: 2, name: 'Envío', label: 'Opciones de paquete', icon: Truck },
    { id: 3, name: 'Pago', label: 'Método de pago', icon: CreditCard },
  ];

  return (
    <nav aria-label="Progreso del Checkout" className="w-full mb-8">
      <ol className="flex items-center justify-between w-full relative">
        {/* Connecting line behind steps */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-neutral-800 -translate-y-1/2 z-0" />
        
        {steps.map((step) => {
          const isCompleted = currentStep > step.id;
          const isActive = currentStep === step.id;
          const isClickable = isCompleted && onStepClick;
          const Icon = step.icon;

          return (
            <li key={step.id} className="relative z-10 flex flex-col items-center">
              <button
                type="button"
                disabled={!isClickable}
                onClick={() => isClickable && onStepClick(step.id)}
                className={`
                  flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full font-bold text-sm md:text-base transition-all duration-300
                  ${isCompleted 
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 ring-4 ring-neutral-900 cursor-pointer hover:bg-emerald-400' 
                    : isActive 
                    ? 'bg-[#f00856] text-white shadow-lg shadow-[#f00856]/40 ring-4 ring-neutral-900 scale-110' 
                    : 'bg-neutral-800 text-neutral-400 border border-neutral-700 ring-4 ring-neutral-900'
                  }
                `}
                aria-current={isActive ? 'step' : undefined}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5 md:w-6 md:h-6 stroke-[3]" />
                ) : (
                  <Icon className="w-5 h-5 md:w-6 md:h-6" />
                )}
              </button>
              
              <div className="mt-2 text-center">
                <span className={`block text-xs md:text-sm font-semibold ${isActive ? 'text-white' : isCompleted ? 'text-emerald-400' : 'text-neutral-500'}`}>
                  {step.name}
                </span>
                <span className="hidden md:block text-[11px] text-neutral-400">
                  {step.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default CheckoutStepper;
