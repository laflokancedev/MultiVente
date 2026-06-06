import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';

function makeService() {
  const users = new Map<string, any>();
  const prisma: any = {
    user: {
      findUnique: async ({ where: { email } }: any) => users.get(email) ?? null,
      create: async ({ data }: any) => {
        const u = { id: 'u1', plan: 'free', createdAt: new Date(), ...data };
        users.set(data.email, u);
        return u;
      },
    },
  };
  const jwt: any = { signAsync: async () => 'signed-token' };
  return new AuthService(prisma, jwt);
}

describe('AuthService.register', () => {
  it('creates a user and returns tokens + sanitized user', async () => {
    const svc = makeService();
    const res = await svc.register({ email: 'a@b.com', password: 'password123' });
    expect(res.user).toEqual({ id: 'u1', email: 'a@b.com', plan: 'free' });
    expect(res.tokens.accessToken).toBe('signed-token');
    expect((res.user as any).passwordHash).toBeUndefined();
  });

  it('rejects a duplicate email', async () => {
    const svc = makeService();
    await svc.register({ email: 'a@b.com', password: 'password123' });
    await expect(svc.register({ email: 'a@b.com', password: 'password123' }))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
