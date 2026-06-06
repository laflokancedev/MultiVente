import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createListing } from './api-client';

describe('createListing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('POSTs to /listings with the bearer token and returns the listing', async () => {
    localStorage.setItem('accessToken', 'tok123');
    const fake = { id: 'l1', title: 'Veste' };
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(fake), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    );
    const res = await createListing({ title: 'Veste', description: 'x', priceCents: 100, category: 'mode', condition: 'good' });
    expect(res.id).toBe('l1');
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('http://localhost:4000/listings');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as any).headers.Authorization).toBe('Bearer tok123');
  });
});
