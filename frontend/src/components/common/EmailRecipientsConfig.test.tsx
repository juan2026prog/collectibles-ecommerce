import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { EmailRecipientsConfig, type EmailRecipient } from './EmailRecipientsConfig';

describe('EmailRecipientsConfig Component', () => {
  const defaultRecipients: EmailRecipient[] = [
    { id: '1', name: 'Administración', email: 'admin@collectibles.uy', active: true },
    { id: '2', name: 'Depósito', email: 'deposito@collectibles.uy', active: true },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. renders up to 3 email recipients correctly', () => {
    render(
      <EmailRecipientsConfig
        recipients={defaultRecipients}
        onChange={vi.fn()}
        maxRecipients={3}
        scope="admin"
      />
    );

    expect(screen.getByText(/DESTINATARIOS EMAIL/i)).toBeInTheDocument();
    expect(screen.getByText(/2 de 2 activo\(s\)/i)).toBeInTheDocument();
  });

  it('2. expands configuration inline when clicking Configurar', () => {
    render(
      <EmailRecipientsConfig
        recipients={defaultRecipients}
        onChange={vi.fn()}
        maxRecipients={3}
        scope="admin"
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /Configurar/i });
    fireEvent.click(toggleBtn);

    expect(screen.getByText(/Cerrar configuración/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('admin@collectibles.uy')).toBeInTheDocument();
    expect(screen.getByDisplayValue('deposito@collectibles.uy')).toBeInTheDocument();
  });

  it('3. prevents adding a 4th recipient when 3 are already present', () => {
    const threeRecipients: EmailRecipient[] = [
      { id: '1', name: 'Email 1', email: 'e1@test.com', active: true },
      { id: '2', name: 'Email 2', email: 'e2@test.com', active: true },
      { id: '3', name: 'Email 3', email: 'e3@test.com', active: true },
    ];

    render(
      <EmailRecipientsConfig
        recipients={threeRecipients}
        onChange={vi.fn()}
        maxRecipients={3}
        scope="vendor"
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /Configurar/i });
    fireEvent.click(toggleBtn);

    expect(screen.queryByRole('button', { name: /Agregar destinatario \(3\/3\)/i })).not.toBeInTheDocument();
  });

  it('4. shows error message for invalid email format when active', () => {
    const invalidRecipient: EmailRecipient[] = [
      { id: '1', name: 'Dueño', email: 'invalid-email-format', active: true },
    ];

    render(
      <EmailRecipientsConfig
        recipients={invalidRecipient}
        onChange={vi.fn()}
        maxRecipients={3}
        scope="vendor"
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /Configurar/i });
    fireEvent.click(toggleBtn);

    expect(screen.getByText(/Formato de email inválido/i)).toBeInTheDocument();
  });

  it('5. filters inactive recipients from active count', () => {
    const mixedRecipients: EmailRecipient[] = [
      { id: '1', name: 'Dueño', email: 'dueno@tienda.com', active: true },
      { id: '2', name: 'Depósito', email: 'deposito@tienda.com', active: false },
    ];

    render(
      <EmailRecipientsConfig
        recipients={mixedRecipients}
        onChange={vi.fn()}
        maxRecipients={3}
        scope="vendor"
      />
    );

    expect(screen.getByText(/1 de 2 activo\(s\)/i)).toBeInTheDocument();
  });

  it('6. detects and highlights duplicate email addresses', () => {
    const duplicateRecipients: EmailRecipient[] = [
      { id: '1', name: 'Role 1', email: 'test@domain.com', active: true },
      { id: '2', name: 'Role 2', email: 'test@domain.com', active: true },
    ];

    render(
      <EmailRecipientsConfig
        recipients={duplicateRecipients}
        onChange={vi.fn()}
        maxRecipients={3}
        scope="vendor"
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /Configurar/i });
    fireEvent.click(toggleBtn);

    expect(screen.getAllByText(/Correo electrónico duplicado/i).length).toBe(2);
  });
});
