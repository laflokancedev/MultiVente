import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAccounts, setAccountConnected } from './api-client';

describe('accounts api-client', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it('GETs the accounts with the bearer token', async () => {
    localStorage.setItem('accessToken', 'tok');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    await getAccounts();
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('http://localhost:4000/accounts');
    expect((init as any).headers.Authorization).toBe('Bearer tok');
  });

  it('PATCHes a marketplace connected flag', async () => {
    localStorage.setItem('accessToken', 'tok');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ marketplace: 'SUBITO', mode: 'assisted', connected: false }), { status: 200 }),
    );
    const res = await setAccountConnected('SUBITO', false);
    expect(res.connected).toBe(false);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('http://localhost:4000/accounts/SUBITO');
    expect((init as any).method).toBe('PATCH');
    expect(JSON.parse((init as any).body).connected).toBe(false);
  });
});
