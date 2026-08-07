import React, { useCallback, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { IMAGE_PROTECTION_ENABLED, IMAGE_PROTECTION_TOAST_MESSAGE } from '../config/imageProtection';
import { useToast } from '../components/admin/Toast';

interface ImageProtectionOptions {
  /**
   * Indica si la imagen corresponde a un producto (por defecto true).
   * Si es true, al hacer clic derecho muestra el aviso Toast informativo.
   */
  isProduct?: boolean;

  /**
   * Permite deshabilitar el Toast en casos específicos (ej. banners, logos).
   */
  showToast?: boolean;

  /**
   * Nombre de clases adicionales.
   */
  className?: string;
}

/**
 * Helper para verificar si un elemento objetivo o sus contenedores/hijos corresponden a una imagen protegida.
 */
function getProtectedImageElement(target: HTMLElement | null): HTMLElement | null {
  if (!target) return null;

  // 1. Coincidencia directa o en ancestros con selector de imagen protegida
  const directMatch = target.closest('img, .img-protected, [data-protected-image], [data-image-protection]');
  if (directMatch) return directMatch as HTMLElement;

  // 2. Si el objetivo mismo es una etiqueta <img>
  if (target.tagName === 'IMG') return target;

  // 3. Si el objetivo o su contenedor (button, link, card div) contiene una etiqueta <img>
  if (target.querySelector('img') !== null) return target;

  // 4. Si está dentro de un contenedor interactivo (button, a, picture, figure, aspect-square) que aloja una imagen
  const container = target.closest('button, a, picture, figure, .aspect-square, [data-product-image]');
  if (container && container.querySelector('img') !== null) return container as HTMLElement;

  return null;
}

/**
 * Hook global reutilizable para proteger imágenes individuales en componentes.
 */
export function useImageProtection(options: ImageProtectionOptions = {}) {
  const { isProduct = true, showToast = true, className = '' } = options;
  const lastToastTimeRef = useRef<number>(0);

  let toast: ReturnType<typeof useToast>['toast'] | null = null;
  try {
    const toastContext = useToast();
    toast = toastContext?.toast || null;
  } catch {
    toast = null;
  }

  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (!IMAGE_PROTECTION_ENABLED) return;
    e.preventDefault();
    return false;
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!IMAGE_PROTECTION_ENABLED) return;
    
    // Bloquear el menú contextual en la imagen
    e.preventDefault();
    e.stopPropagation();

    // Mostrar un aviso Toast informativo solo en imágenes de productos y con debounce de 2 segundos
    if (isProduct && showToast && toast) {
      const now = Date.now();
      if (now - lastToastTimeRef.current > 2000) {
        lastToastTimeRef.current = now;
        toast.info(IMAGE_PROTECTION_TOAST_MESSAGE, 3000);
      }
    }
  }, [isProduct, showToast, toast]);

  const getImageProps = useCallback((extraClassName = '') => {
    const combinedClasses = `img-protected ${className} ${extraClassName}`.trim();
    if (!IMAGE_PROTECTION_ENABLED) {
      return { className: extraClassName };
    }

    return {
      draggable: false,
      'data-protected-image': 'true',
      'data-product-image': isProduct ? 'true' : 'false',
      onDragStart: handleDragStart,
      onContextMenu: handleContextMenu,
      className: combinedClasses,
    };
  }, [className, isProduct, handleDragStart, handleContextMenu]);

  return {
    isProtected: IMAGE_PROTECTION_ENABLED,
    handleDragStart,
    handleContextMenu,
    getImageProps,
    protectedClassName: IMAGE_PROTECTION_ENABLED ? `img-protected ${className}`.trim() : className,
  };
}

/**
 * Componente Listener Global de Captura que intercepta clic derecho (contextmenu)
 * y arrastrar (dragstart) en la fase de captura (capture phase) para CUALQUIER elemento
 * de imagen o contenedor de imagen protegida en el storefront público.
 */
export function ImageProtectionGlobalListener() {
  const location = useLocation();
  const lastToastRef = useRef<number>(0);

  let toast: ReturnType<typeof useToast>['toast'] | null = null;
  try {
    const toastContext = useToast();
    toast = toastContext?.toast || null;
  } catch {
    toast = null;
  }

  useEffect(() => {
    if (!IMAGE_PROTECTION_ENABLED) return;

    // No aplicar en rutas administrativas
    if (location.pathname.startsWith('/admin')) return;

    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const protectedEl = getProtectedImageElement(target);
      
      if (protectedEl) {
        e.preventDefault();
        e.stopPropagation();

        const isProduct = protectedEl.matches('[data-product-image="true"], [data-product-image="true"] *') ||
                          protectedEl.closest('[data-product-image="true"]') !== null ||
                          protectedEl.tagName.toLowerCase() === 'img' ||
                          protectedEl.querySelector('img') !== null;

        if (isProduct && toast) {
          const now = Date.now();
          if (now - lastToastRef.current > 2000) {
            lastToastRef.current = now;
            toast.info(IMAGE_PROTECTION_TOAST_MESSAGE, 3000);
          }
        }
      }
    };

    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const protectedEl = getProtectedImageElement(target);
      if (protectedEl) {
        e.preventDefault();
      }
    };

    // Usar la fase de captura (capture: true) para interceptar el evento antes que cualquier elemento hijo o nativo
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('dragstart', handleDragStart, true);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('dragstart', handleDragStart, true);
    };
  }, [location.pathname, toast]);

  return null;
}

export default useImageProtection;
