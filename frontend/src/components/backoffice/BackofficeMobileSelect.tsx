import React, { SelectHTMLAttributes } from 'react';

export interface BackofficeMobileOption {
  value: string;
  label: string;
}

export interface BackofficeMobileSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: BackofficeMobileOption[];
  value: string;
  onChangeValue: (val: string) => void;
  label?: string;
}

export const BackofficeMobileSelect: React.FC<BackofficeMobileSelectProps> = ({
  options,
  value,
  onChangeValue,
  label,
  className = '',
  ...props
}) => {
  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChangeValue(e.target.value)}
        className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 dark:text-white shadow-2xs focus:ring-2 focus:ring-[#f00856] outline-none min-h-[44px] cursor-pointer"
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};
