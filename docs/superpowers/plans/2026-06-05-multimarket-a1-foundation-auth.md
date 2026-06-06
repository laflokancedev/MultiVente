# MultiMarket A1 — Foundation + Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the pnpm monorepo (NestJS API + Next.js 15 PWA + shared types) with Postgres/Redis, and a working email+password auth flow (register, login, JWT refresh, guarded route) end-to-end.

**Architecture:** pnpm-workspace monorepo. `apps/api` is NestJS + Prisma (Postgres) exposing REST auth endpoints; `apps/web` is a Next.js 15 App-Router PWA that calls the API; `packages/shared` holds TypeScript types shared by both. Auth uses argon2 password hashing and short-lived JWT access tokens + longer-lived refresh tokens.

**Tech Stack:** pnpm workspaces, Node 20 LTS, NestJS 10, Prisma 5 + PostgreSQL 16, Redis 7 (provisioned now for later slices), argon2, @nestjs/jwt + passport-jwt, class-validator, Jest (api), Next.js 15 + React 19 + Tailwind + shadcn/ui, Vitest + Testing Library (web), Docker Compose.

---

## File Structure

```
App Revente/
├─ pnpm-workspace.yaml          # workspace globs
├─ package.json                 # root scripts, dev deps
├─ docker-compose.yml           # postgres + redis for local dev
├─ .gitignore
├─ packages/
│  └─ shared/
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ src/
│        ├─ index.ts            # re-exports
│        └─ auth.ts             # AuthUser, AuthTokens, RegisterInput, LoginInput types
└─ apps/
   ├─ api/                      # NestJS
   │  ├─ package.json
   │  ├─ tsconfig.json
   │  ├─ nest-cli.json
   │  ├─ .env / .env.example
   │  ├─ prisma/schema.prisma   # User model (this plan)
   │  ├─ test/                  # e2e
   │  └─ src/
   │     ├─ main.ts
   │     ├─ app.module.ts
   │     ├─ health/health.controller.ts
   │     ├─ prisma/prisma.service.ts
   │     ├─ prisma/prisma.module.ts
   │     └─ auth/
   │        ├─ auth.module.ts
   │        ├─ auth.service.ts
   │        ├─ auth.controller.ts
   │        ├─ dto/register.dto.ts
   │        ├─ dto/login.dto.ts
   │        ├─ jwt.strategy.ts
   │        ├─ jwt-auth.guard.ts
   │        └─ auth.service.spec.ts
   └─ web/                      # Next.js 15 PWA
      ├─ package.json
      ├─ next.config.mjs
      ├─ tailwind.config.ts
      ├─ vitest.config.ts
      ├─ public/manifest.webmanifest
      └─ src/
         ├─ app/layout.tsx
         ├─ app/(auth)/login/page.tsx
         ├─ app/(auth)/register/page.tsx
         ├─ lib/api-client.ts
         └─ lib/api-client.test.ts
```

---

## Task 1: Initialize pnpm monorepo skeleton

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Create the workspace globs file**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 2: Create the root package.json**

`package.json`:
```json
{
  "name": "multimarket",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "dev:api": "pnpm --filter @multimarket/api start:dev",
    "dev:web": "pnpm --filter @multimarket/web dev",
    "test": "pnpm -r test"
  }
}
```

- [ ] **Step 3: Create .gitignore**

`.gitignore`:
```
node_modules/
dist/
.next/
.env
*.log
coverage/
```

- [ ] **Step 4: Verify pnpm resolves the workspace**

Run: `pnpm install`
Expected: completes with "Done" and no workspace errors (no packages yet is fine).

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml package.json .gitignore
git commit -m "chore: initialize pnpm monorepo skeleton"
```

---

## Task 2: Local infrastructure (Postgres + Redis)

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Write docker-compose for Postgres + Redis**

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: multimarket
      POSTGRES_PASSWORD: multimarket
      POSTGRES_DB: multimarket
    ports: ["127.0.0.1:5433:5432"]   # loopback only; host 5433 -> container 5432 (host 5432 may be used by another project)
    volumes: ["mm_pg:/var/lib/postgresql/data"]
  redis:
    image: redis:7
    ports: ["127.0.0.1:6379:6379"]   # loopback only
volumes:
  mm_pg:
```

- [ ] **Step 2: Bring the stack up**

Run: `docker compose up -d`
Expected: `postgres` and `redis` containers report "Started".

- [ ] **Step 3: Verify Postgres accepts connections**

Run: `docker compose exec postgres pg_isready -U multimarket`
Expected: `... accepting connections`

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add postgres + redis dev infrastructure"
```

---

## Task 3: Shared types package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/auth.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the package manifest**

`packages/shared/package.json`:
```json
{
  "name": "@multimarket/shared",
  "version": "0.0.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": { "test": "echo \"no tests\" && exit 0" }
}
```

- [ ] **Step 2: Create tsconfig**

`packages/shared/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Define the auth types**

`packages/shared/src/auth.ts`:
```ts
export interface AuthUser {
  id: string;
  email: string;
  plan: 'free' | 'premium';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface RegisterInput {
  email: string;
  password: string;
}

export type LoginInput = RegisterInput;

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}
```

- [ ] **Step 4: Re-export from index**

`packages/shared/src/index.ts`:
```ts
export * from './auth';
```

- [ ] **Step 5: Install and verify the workspace links**

Run: `pnpm install`
Expected: `@multimarket/shared` appears in the workspace, no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add auth types package"
```

---

## Task 4: NestJS API scaffold + health endpoint

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Test: `apps/api/src/health/health.controller.spec.ts`

- [ ] **Step 1: Create the API package manifest**

`apps/api/package.json`:
```json
{
  "name": "@multimarket/api",
  "version": "0.0.0",
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "test": "jest"
  },
  "dependencies": {
    "@multimarket/shared": "workspace:*",
    "@nestjs/common": "^10.3.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.3",
    "@nestjs/platform-express": "^10.3.0",
    "@prisma/client": "^5.18.0",
    "@node-rs/argon2": "^2.0.4",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.3.2",
    "@nestjs/testing": "^10.3.0",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.0",
    "@types/passport-jwt": "^4.0.1",
    "jest": "^29.7.0",
    "prisma": "^5.18.0",
    "ts-jest": "^29.2.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.5.0"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.ts$": "ts-jest" },
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 2: Create tsconfig and nest-cli config**

`apps/api/tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "outDir": "./dist",
    "baseUrl": "./",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`apps/api/nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

- [ ] **Step 3: Install dependencies**

Run: `pnpm install`
Expected: argon2 and NestJS packages install without errors.

- [ ] **Step 4: Write the failing health controller test**

`apps/api/src/health/health.controller.spec.ts`:
```ts
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns ok status', () => {
    const controller = new HealthController();
    expect(controller.check()).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter @multimarket/api test health`
Expected: FAIL — cannot find module `./health.controller`.

- [ ] **Step 6: Implement the health controller**

`apps/api/src/health/health.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
```

- [ ] **Step 7: Create the app module and bootstrap**

`apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController],
})
export class AppModule {}
```

`apps/api/src/main.ts`:
```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true });
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter @multimarket/api test health`
Expected: PASS (1 test).

- [ ] **Step 9: Commit**

```bash
git add apps/api
git commit -m "feat(api): scaffold NestJS app with health endpoint"
```

---

## Task 5: Prisma + User model

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/.env.example`
- Create: `apps/api/.env`
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/src/prisma/prisma.module.ts`

- [ ] **Step 1: Write the Prisma schema with the User model**

`apps/api/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Plan {
  free
  premium
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  plan         Plan     @default(free)
  createdAt    DateTime @default(now())
}
```

- [ ] **Step 2: Create env files**

`apps/api/.env.example`:
```
DATABASE_URL="postgresql://multimarket:multimarket@localhost:5433/multimarket?schema=public"
JWT_ACCESS_SECRET="dev-access-secret-change-me"
JWT_REFRESH_SECRET="dev-refresh-secret-change-me"
WEB_ORIGIN="http://localhost:3000"
PORT=4000
```

Create `apps/api/.env` with the same contents (gitignored).

- [ ] **Step 3: Generate the client and run the first migration**

Run: `pnpm --filter @multimarket/api exec prisma migrate dev --name init`
Expected: creates `prisma/migrations/*_init`, applies it, generates the client. (Requires docker compose Postgres running.)

- [ ] **Step 4: Create the Prisma service**

`apps/api/src/prisma/prisma.service.ts`:
```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```

`apps/api/src/prisma/prisma.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 5: Register PrismaModule in AppModule**

Modify `apps/api/src/app.module.ts` — add `PrismaModule` to imports:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 6: Verify the app still builds**

Run: `pnpm --filter @multimarket/api build`
Expected: build succeeds, `dist/` produced.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma apps/api/.env.example apps/api/src/prisma apps/api/src/app.module.ts
git commit -m "feat(api): add Prisma with User model and migration"
```

---

## Task 6: Auth service — register (TDD)

**Files:**
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/auth.service.spec.ts`
- Create: `apps/api/src/auth/dto/register.dto.ts`
- Create: `apps/api/src/auth/dto/login.dto.ts`

- [ ] **Step 1: Write the DTOs**

`apps/api/src/auth/dto/register.dto.ts`:
```ts
import { IsEmail, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @MinLength(8)
  password!: string;
}
```

`apps/api/src/auth/dto/login.dto.ts`:
```ts
import { IsEmail, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  password!: string;
}
```

- [ ] **Step 2: Write the failing register test**

`apps/api/src/auth/auth.service.spec.ts`:
```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @multimarket/api test auth.service`
Expected: FAIL — cannot find module `./auth.service`.

- [ ] **Step 4: Implement the auth service (register + token helper)**

`apps/api/src/auth/auth.service.ts`:
```ts
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @multimarket/api test auth.service`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth
git commit -m "feat(api): auth service register with argon2 + token issue"
```

---

> **Security hardening applied during implementation (commit `d0c9567`).** The
> committed code differs from the snippets above following an automated security
> review: `login` verifies against a cached dummy argon2 hash when the account is
> missing (timing-safe — no user enumeration); emails are normalized (trim +
> lowercase) in the DTOs via `@Transform` and defensively in `AuthService`; both
> DTOs add `@MaxLength(128)` on `password` (bounds argon2 work). A
> normalization regression test was added (6 auth-service tests total).

---

## Task 7: Auth service — login (TDD)

**Files:**
- Modify: `apps/api/src/auth/auth.service.spec.ts` (add login tests)

- [ ] **Step 1: Add failing login tests**

Append to `apps/api/src/auth/auth.service.spec.ts`:
```ts
describe('AuthService.login', () => {
  it('logs in with correct password', async () => {
    const svc = makeService();
    await svc.register({ email: 'a@b.com', password: 'password123' });
    const res = await svc.login({ email: 'a@b.com', password: 'password123' });
    expect(res.user.email).toBe('a@b.com');
    expect(res.tokens.accessToken).toBe('signed-token');
  });

  it('rejects an unknown email', async () => {
    const svc = makeService();
    await expect(svc.login({ email: 'nobody@b.com', password: 'x' }))
      .rejects.toThrow('Invalid credentials');
  });

  it('rejects a wrong password', async () => {
    const svc = makeService();
    await svc.register({ email: 'a@b.com', password: 'password123' });
    await expect(svc.login({ email: 'a@b.com', password: 'wrongpass' }))
      .rejects.toThrow('Invalid credentials');
  });
});
```

> Note: the in-memory `prisma` mock from Task 6 stores the real argon2 hash via `create`, so `verify` (from `@node-rs/argon2`) runs for real in these tests.

- [ ] **Step 2: Run the tests to verify login passes**

Run: `pnpm --filter @multimarket/api test auth.service`
Expected: PASS (5 tests total) — `login` is already implemented in Task 6.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/auth/auth.service.spec.ts
git commit -m "test(api): cover auth login success and failure cases"
```

---

## Task 8: JWT strategy, guard, and auth controller

**Files:**
- Create: `apps/api/src/auth/jwt.strategy.ts`
- Create: `apps/api/src/auth/jwt-auth.guard.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/auth.e2e-spec.ts`

- [ ] **Step 1: Implement the JWT access strategy**

`apps/api/src/auth/jwt.strategy.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_ACCESS_SECRET as string,
    });
  }

  async validate(payload: { sub: string; email: string }) {
    return { id: payload.sub, email: payload.email };
  }
}
```

- [ ] **Step 2: Implement the guard**

`apps/api/src/auth/jwt-auth.guard.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- [ ] **Step 3: Implement the auth controller**

`apps/api/src/auth/auth.controller.ts`:
```ts
import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private jwt: JwtService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    try {
      const payload = await this.jwt.verifyAsync(body.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      const accessToken = await this.jwt.signAsync(
        { sub: payload.sub },
        { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' },
      );
      return { accessToken };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return req.user;
  }
}
```

- [ ] **Step 4: Wire the auth module**

`apps/api/src/auth/auth.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
```

Modify `apps/api/src/app.module.ts` — add `AuthModule` to imports:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 5: Write the e2e test (register → me)**

`apps/api/test/auth.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e_${Date.now()}@b.com`;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    prisma = app.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('registers then reads /auth/me with the access token', async () => {
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123' })
      .expect(201);
    const token = reg.body.tokens.accessToken;

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.email).toBe(email);
  });

  it('rejects /auth/me without a token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });
});
```

Add `supertest` + types to devDependencies and a jest-e2e config:

`apps/api/test/jest-e2e.json`:
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.ts$": "ts-jest" },
  "testEnvironment": "node"
}
```

Add to `apps/api/package.json` scripts: `"test:e2e": "jest --config ./test/jest-e2e.json"` and devDeps `"supertest": "^7.0.0"`, `"@types/supertest": "^6.0.2"`. Then run `pnpm install`.

- [ ] **Step 6: Run unit + e2e tests**

Run: `pnpm --filter @multimarket/api test && pnpm --filter @multimarket/api test:e2e`
Expected: unit tests PASS; e2e PASS (2 tests). (Requires Postgres running + migration applied.)

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat(api): JWT strategy, guard, auth controller + e2e"
```

---

## Task 9: Next.js 15 PWA scaffold

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/public/manifest.webmanifest`

- [ ] **Step 1: Create the web package manifest**

`apps/web/package.json`:
```json
{
  "name": "@multimarket/web",
  "version": "0.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "@multimarket/shared": "workspace:*",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@types/node": "^20.14.0",
    "@types/react": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.19",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create Next/Tailwind/TS config**

`apps/web/next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
export default nextConfig;
```

`apps/web/postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`apps/web/tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';
export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

`apps/web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "jsx": "preserve",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "next-env.d.ts", ".next/types/**/*.ts"]
}
```

- [ ] **Step 3: Create the PWA manifest and root layout**

`apps/web/public/manifest.webmanifest`:
```json
{
  "name": "MultiMarket",
  "short_name": "MultiMarket",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563eb",
  "icons": []
}
```

`apps/web/src/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`apps/web/src/app/layout.tsx`:
```tsx
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MultiMarket',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Install and verify the web app builds**

Run: `pnpm install && pnpm --filter @multimarket/web build`
Expected: Next build completes (an empty home route is fine for now).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): scaffold Next.js 15 PWA with Tailwind"
```

---

## Task 10: Auth API client + login/register pages (TDD)

**Files:**
- Create: `apps/web/src/lib/api-client.ts`
- Test: `apps/web/src/lib/api-client.test.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/app/(auth)/login/page.tsx`
- Create: `apps/web/src/app/(auth)/register/page.tsx`

- [ ] **Step 1: Create the vitest config**

`apps/web/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true },
});
```

- [ ] **Step 2: Write the failing api-client test**

`apps/web/src/lib/api-client.test.ts`:
```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @multimarket/web test api-client`
Expected: FAIL — cannot find module `./api-client`.

- [ ] **Step 4: Implement the api client**

`apps/web/src/lib/api-client.ts`:
```ts
import type { AuthResponse, LoginInput, RegisterInput } from '@multimarket/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.message) message = Array.isArray(data.message) ? data.message.join(', ') : data.message;
    } catch { /* ignore non-JSON bodies */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function registerUser(input: RegisterInput): Promise<AuthResponse> {
  return postJson<AuthResponse>('/auth/register', input);
}

export function loginUser(input: LoginInput): Promise<AuthResponse> {
  return postJson<AuthResponse>('/auth/login', input);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @multimarket/web test api-client`
Expected: PASS (2 tests).

- [ ] **Step 6: Create the login and register pages**

`apps/web/src/app/(auth)/register/page.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { registerUser } from '@/lib/api-client';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await registerUser({ email, password });
      localStorage.setItem('accessToken', res.tokens.accessToken);
      localStorage.setItem('refreshToken', res.tokens.refreshToken);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (done) return <p className="p-6">Compte créé ✅</p>;

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-16 flex max-w-sm flex-col gap-3 p-6">
      <h1 className="text-xl font-semibold">Inscription</h1>
      <input className="rounded border p-2" type="email" placeholder="Email"
        value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="rounded border p-2" type="password" placeholder="Mot de passe (min 8)"
        value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="rounded bg-blue-600 p-2 text-white" type="submit">Créer mon compte</button>
    </form>
  );
}
```

`apps/web/src/app/(auth)/login/page.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { loginUser } from '@/lib/api-client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await loginUser({ email, password });
      localStorage.setItem('accessToken', res.tokens.accessToken);
      localStorage.setItem('refreshToken', res.tokens.refreshToken);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (done) return <p className="p-6">Connecté ✅</p>;

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-16 flex max-w-sm flex-col gap-3 p-6">
      <h1 className="text-xl font-semibold">Connexion</h1>
      <input className="rounded border p-2" type="email" placeholder="Email"
        value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="rounded border p-2" type="password" placeholder="Mot de passe"
        value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="rounded bg-blue-600 p-2 text-white" type="submit">Se connecter</button>
    </form>
  );
}
```

- [ ] **Step 7: Run the full web test suite**

Run: `pnpm --filter @multimarket/web test`
Expected: PASS.

- [ ] **Step 8: Manual smoke test (optional but recommended)**

Run (in two terminals): `pnpm dev:api` and `pnpm dev:web`. Visit `http://localhost:3000/register`, submit a new email/password, confirm "Compte créé ✅" and tokens in localStorage.

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "feat(web): auth api client + login/register pages"
```

---

## Done criteria for A1

- `docker compose up -d` brings up Postgres + Redis.
- `pnpm --filter @multimarket/api test && pnpm --filter @multimarket/api test:e2e` is green.
- `pnpm --filter @multimarket/web test` is green.
- A user can register and log in from the web UI; `/auth/me` returns the user with a valid access token; refresh issues a new access token.

**Next plan:** A2 — Unified listing + photo upload (Cloudflare R2).
