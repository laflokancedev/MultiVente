import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shareAssisted } from './share';
import type { AssistedPayload } from '@multimarket/shared';

const payload: AssistedPayload = {
  marketplace: 'VINTED',
  title: 'Veste',
  pasteText: 'Veste\n\nbelle veste',
  deepLink: 'https://www.vinted.fr/items/new',
  photoUrls: ['http://x/1.jpg'],
};

describe('shareAssisted', () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('returns "unsupported" when navigator.share is absent', async () => {
    vi.stubGlobal('navigator', {});
    expect(await shareAssisted(payload)).toBe('unsupported');
  });

  it('shares files when canShare({files}) is true', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: () => true });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Blob(['x'], { type: 'image/jpeg' })));
    expect(await shareAssisted(payload)).toBe('shared');
    const arg = share.mock.calls[0][0];
    expect(arg.files).toHaveLength(1);
    expect(arg.url).toContain('vinted');
  });

  it('falls back to text share when files are not shareable', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: () => false });
    expect(await shareAssisted(payload)).toBe('shared-text');
    expect(share.mock.calls[0][0].files).toBeUndefined();
  });
});
