import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerUser } from './api-client';

describe('registerUser', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('POSTs credentials to /auth/register and returns the AuthResponse', async () => {
    const fake = { user: { id: 'u1', email: 'a@b.com', plan: 'free' }, tokens: { accessToken: 'a', refreshToken: 'r' } };
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(fake), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    );
    const res = await registerUser({ email: 'a@b.com', password: 'password123' });
    expect(res.user.email).toBe('a@b.com');
    expect(spy).toHaveBeenCalledWith(
      'http://localhost:4000/auth/register',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Email already registered' }), { status: 409 }),
    );
    await expect(registerUser({ email: 'a@b.com', password: 'password123' }))
      .rejects.toThrow('Email already registered');
  });
});
