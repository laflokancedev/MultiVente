import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthResponse, AuthUser } from '@multimarket/shared';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

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
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await hash(input.password);
    const created = await this.prisma.user.create({
      data: { email: input.email, passwordHash },
    });
    const user = this.toAuthUser(created);
    return { user, tokens: await this.issueTokens(user) };
  }

  async login(input: { email: string; password: string }): Promise<AuthResponse> {
    const found = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!found) throw new UnauthorizedException('Invalid credentials');
    const valid = await verify(found.passwordHash, input.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    const user = this.toAuthUser(found);
    return { user, tokens: await this.issueTokens(user) };
  }
}
