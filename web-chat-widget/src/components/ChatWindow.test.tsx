/**
 * T071 — Tests für ChatWindow (Verlauf rendern + Senden). API gemockt.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PublicChatMessage } from '../lib/api';
import * as api from '../lib/api';
import { ChatWindow } from './ChatWindow';

vi.mock('../lib/api', async (orig) => {
  const actual = await orig<typeof import('../lib/api')>();
  return {
    ...actual,
    listMessages: vi.fn(async () => []),
    sendMessage: vi.fn(),
    uploadBeleg: vi.fn(),
  };
});

function msg(over: Partial<PublicChatMessage>): PublicChatMessage {
  return {
    id: 'm1',
    session_id: 's1',
    sender_type: 'customer',
    body: 'Hallo',
    beleg_id: null,
    created_at: new Date('2026-06-25T10:00:00Z').toISOString(),
    ...over,
  };
}

describe('ChatWindow', () => {
  it('rendert leeren Zustand mit Hinweis', async () => {
    vi.mocked(api.listMessages).mockResolvedValue([]);
    render(<ChatWindow token="tok" />);
    await waitFor(() =>
      expect(screen.getByText(/abfotografieren|stell uns eine Frage/i)).toBeInTheDocument(),
    );
  });

  it('rendert Verlauf inkl. Beleg-Bubble', async () => {
    vi.mocked(api.listMessages).mockResolvedValue([
      msg({ id: 'm1', sender_type: 'customer', body: 'Meine Frage' }),
      msg({ id: 'm2', sender_type: 'staff', body: 'Unsere Antwort' }),
      msg({ id: 'm3', sender_type: 'customer', body: null, beleg_id: 'b1' }),
    ]);
    render(<ChatWindow token="tok" />);
    await waitFor(() => expect(screen.getByText('Meine Frage')).toBeInTheDocument());
    expect(screen.getByText('Unsere Antwort')).toBeInTheDocument();
    expect(screen.getByText(/Beleg gesendet/i)).toBeInTheDocument();
  });

  it('Senden: ruft sendMessage und zeigt die neue Nachricht', async () => {
    vi.mocked(api.listMessages).mockResolvedValue([]);
    vi.mocked(api.sendMessage).mockResolvedValue(
      msg({ id: 'm-new', sender_type: 'customer', body: 'Neue Nachricht' }),
    );
    render(<ChatWindow token="tok" />);
    const input = await screen.findByLabelText('Nachricht');
    await userEvent.type(input, 'Neue Nachricht');
    await userEvent.click(screen.getByLabelText('Senden'));
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith('tok', 'Neue Nachricht'));
    expect(await screen.findByText('Neue Nachricht')).toBeInTheDocument();
  });
});
