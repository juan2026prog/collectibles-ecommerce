import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { MobilePushSetup } from './MobilePushSetup';
import * as pushLib from '../../lib/pushNotifications';

describe('MobilePushSetup Component', () => {
  const createProps = () => ({
    userId: 'user-123',
    vendorId: 'vendor-456',
    pushStatus: {
      state: 'default' as const,
      isIOSNonStandalone: false,
      subscriptionId: null,
      optedIn: false,
      appIdConfigured: true,
    },
    onActivate: vi.fn(),
    onDeactivate: vi.fn(),
    onTest: vi.fn(),
    registeringPush: false,
    sendingTest: false,
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Test 1: Desktop -> Tarjeta no aparece
  it('1. does NOT render card on desktop platform', () => {
    vi.spyOn(pushLib, 'getMobilePlatform').mockReturnValue('desktop');
    const props = createProps();
    const { container } = render(<MobilePushSetup {...props} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('mobile-push-setup-card')).not.toBeInTheDocument();
  });

  // Test 2: Android -> Tarjeta aparece
  it('2. renders mobile push setup card on Android', () => {
    vi.spyOn(pushLib, 'getMobilePlatform').mockReturnValue('android');
    const props = createProps();
    render(<MobilePushSetup {...props} />);
    expect(screen.getByTestId('mobile-push-setup-card')).toBeInTheDocument();
    expect(screen.getByText(/Notificaciones en este celular/i)).toBeInTheDocument();
  });

  // Test 3: Android activo -> muestra estado activo
  it('3. displays active background state when status is granted on Android', () => {
    vi.spyOn(pushLib, 'getMobilePlatform').mockReturnValue('android');
    const props = createProps();
    props.pushStatus.state = 'granted';
    props.pushStatus.optedIn = true;
    render(<MobilePushSetup {...props} />);
    expect(screen.getByText(/Este celular recibe notificaciones en segundo plano/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar prueba/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Desactivar/i })).toBeInTheDocument();
  });

  // Test 4: Android denied -> muestra bloqueado
  it('4. displays blocked message when notification permission is denied on Android', () => {
    vi.spyOn(pushLib, 'getMobilePlatform').mockReturnValue('android');
    const props = createProps();
    props.pushStatus.state = 'denied';
    render(<MobilePushSetup {...props} />);
    expect(screen.getByText(/Las notificaciones están bloqueadas para Collectibles en este navegador/i)).toBeInTheDocument();
    expect(screen.getByText(/Permitilas desde Configuración del sitio > Notificaciones/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Activar notificaciones/i })).not.toBeInTheDocument();
  });

  // Test 5: iPhone Safari no standalone -> muestra instrucciones PWA
  it('5. displays PWA installation instructions for iOS Safari non-standalone', () => {
    vi.spyOn(pushLib, 'getMobilePlatform').mockReturnValue('ios');
    vi.spyOn(pushLib, 'isStandaloneMode').mockReturnValue(false);
    const props = createProps();
    render(<MobilePushSetup {...props} />);

    expect(screen.getByText(/Para recibir avisos aunque Collectibles esté cerrado, primero agregá Collectibles a tu pantalla de inicio/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Activar notificaciones/i })).not.toBeInTheDocument();

    const toggleBtn = screen.getByRole('button', { name: /Cómo instalar/i });
    expect(toggleBtn).toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('ios-pwa-instructions')).toBeInTheDocument();
    expect(screen.getByText(/Abrí Collectibles en Safari/i)).toBeInTheDocument();
  });

  // Test 6: iPhone standalone -> muestra Activar notificaciones
  it('6. displays activation button for iOS PWA in standalone mode', () => {
    vi.spyOn(pushLib, 'getMobilePlatform').mockReturnValue('ios');
    vi.spyOn(pushLib, 'isStandaloneMode').mockReturnValue(true);
    const props = createProps();
    render(<MobilePushSetup {...props} />);

    expect(screen.getByText(/Collectibles está instalado en este celular/i)).toBeInTheDocument();
    const activateBtn = screen.getByRole('button', { name: /Activar notificaciones/i });
    expect(activateBtn).toBeInTheDocument();

    fireEvent.click(activateBtn);
    expect(props.onActivate).toHaveBeenCalledTimes(1);
  });

  // Test 7: iPhone standalone + granted -> muestra activo
  it('7. displays active background state for iOS standalone when granted', () => {
    vi.spyOn(pushLib, 'getMobilePlatform').mockReturnValue('ios');
    vi.spyOn(pushLib, 'isStandaloneMode').mockReturnValue(true);
    const props = createProps();
    props.pushStatus.state = 'granted';
    props.pushStatus.optedIn = true;
    render(<MobilePushSetup {...props} />);

    expect(screen.getByText(/Collectibles está instalado en este celular/i)).toBeInTheDocument();
    expect(screen.getByText(/Este celular recibe notificaciones en segundo plano/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar prueba/i })).toBeInTheDocument();
  });

  // Test 8: Admin y Vendor usan el mismo componente
  it('8. renders properly with vendorId null (Admin) and vendorId string (Vendor)', () => {
    vi.spyOn(pushLib, 'getMobilePlatform').mockReturnValue('android');
    const props = createProps();

    // Admin rendering (vendorId null)
    const { rerender } = render(<MobilePushSetup {...props} vendorId={null} />);
    expect(screen.getByTestId('mobile-push-setup-card')).toBeInTheDocument();

    // Vendor rendering (vendorId string)
    rerender(<MobilePushSetup {...props} vendorId="vendor-789" />);
    expect(screen.getByTestId('mobile-push-setup-card')).toBeInTheDocument();
  });

  // Test 9: No hay segunda inicialización OneSignal
  it('9. does not invoke SDK initialization on component mount', () => {
    vi.spyOn(pushLib, 'getMobilePlatform').mockReturnValue('android');
    const initSpy = vi.spyOn(pushLib, 'initOneSignalSDK');
    const props = createProps();
    render(<MobilePushSetup {...props} />);
    expect(initSpy).not.toHaveBeenCalled();
  });

  // Test 10: No se pide permiso automáticamente
  it('10. does not call requestAndRegisterPush or onActivate automatically on mount', () => {
    vi.spyOn(pushLib, 'getMobilePlatform').mockReturnValue('android');
    const props = createProps();
    render(<MobilePushSetup {...props} />);
    expect(props.onActivate).not.toHaveBeenCalled();
  });
});
