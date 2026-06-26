/**
 * T075 — Tests für RatingView (Sterne-Auswahl + Senden + Danke-Ansicht).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PublicChatSession } from '../lib/api';
import * as api from '../lib/api';
import { RatingView } from './RatingView';

vi.mock('../lib/api', async (orig) => {
  const actual = await orig<typeof import('../lib/api')>();
  return { ...actual, rateChat: vi.fn() };
});

function closed(over: Partial<PublicChatSession> = {}): PublicChatSession {
  return {
    status: 'closed',
    expires_at: null,
    closed_at: new Date('2026-06-26T10:00:00Z').toISOString(),
    rating: null,
    rating_comment: null,
    ...over,
  };
}

describe('RatingView', () => {
  it('unbewertet: Senden ist erst nach Stern-Auswahl möglich', async () => {
    render(<RatingView token="tok" session={closed()} onRated={() => {}} />);
    const submit = screen.getByRole('button', { name: 'Bewertung senden' });
    expect(submit).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: '4 Sterne' }));
    expect(submit).toBeEnabled();
  });

  it('sendet Sterne + Kommentar und meldet die aktualisierte Session', async () => {
    const onRated = vi.fn();
    const rated = closed({ rating: 5, rating_comment: 'Super' });
    vi.mocked(api.rateChat).mockResolvedValue(rated);
    render(<RatingView token="tok" session={closed()} onRated={onRated} />);

    await userEvent.click(screen.getByRole('radio', { name: '5 Sterne' }));
    await userEvent.type(screen.getByLabelText(/Kommentar/i), 'Super');
    await userEvent.click(screen.getByRole('button', { name: 'Bewertung senden' }));

    await waitFor(() => expect(api.rateChat).toHaveBeenCalledWith('tok', 5, 'Super'));
    expect(onRated).toHaveBeenCalledWith(rated);
  });

  it('bereits bewertet → Danke-Ansicht mit Kommentar, keine Eingabe', () => {
    render(
      <RatingView
        token="tok"
        session={closed({ rating: 3, rating_comment: 'Ganz okay' })}
        onRated={() => {}}
      />,
    );
    expect(screen.getByRole('heading', { name: /danke für deine bewertung/i })).toBeInTheDocument();
    expect(screen.getByText(/Ganz okay/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bewertung senden' })).not.toBeInTheDocument();
  });
});
