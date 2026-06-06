import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthResponse, AuthUser } from '@multimarket/shared';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  // Cached argon2 hash used to equalize timing when an account does not exist,
  // so login does not leak which emails are registered (user enumeration).
  private dummyHashCache?: Promise<string>;
  private dummyHash(): Promise<string> {
    if (!this.dummyHashCache) {
      this.dummyHashCache = hash('argon2-timing-equalizer-not-a-real-password');
    }
    return this.dummyHashCache;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private toAuthUser(u: { id: string; email: string; plan: string }): AuthUser {
    return { id: u.id, email: u.email, plan: u.plan as 'free' | 'premium' };
  }

  private async issueTokens(user: AuthUser) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '30d' },
    );
    return { accessToken, refreshToken };
  }

  async register(input: { email: string; password: string }): Promise<AuthResponse> {
    const email = this.normalizeEmail(input.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await hash(input.password);
    const created = await this.prisma.user.create({
      data: { email, passwordHash },
    });
    const user = this.toAuthUser(created);
    return { user, tokens: await this.issueTokens(user) };
  }

  async login(input: { email: string; password: string }): Promise<AuthResponse> {
    const email = this.normalizeEmail(input.email);
    const found = await this.prisma.user.findUnique({ where: { email } });
    // Always run a verify (against a dummy hash when the user is missing) so the
    // response time does not reveal whether the account exists.
    const hashToCheck = found?.passwordHash ?? (await this.dummyHash());
    const valid = await verify(hashToCheck, input.password);
    if (!found || !valid) throw new UnauthorizedException('Invalid credentials');
    const user = this.toAuthUser(found);
    return { user, tokens: await this.issueTokens(user) };
  }
}
