import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publishEverywhere } from './api-client';

describe('publishEverywhere', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it('POSTs selected marketplaces with the bearer token', async () => {
    localStorage.setItem('accessToken', 'tok');
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 'p1', marketplace: 'EBAY', mode: 'auto', status: 'pending' }]), { status: 201 }),
    );
    const res = await publishEverywhere('l1', ['EBAY']);
    expect(res[0].marketplace).toBe('EBAY');
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('http://localhost:4000/listings/l1/publish');
    expect((init as any).headers.Authorization).toBe('Bearer tok');
  });
});
