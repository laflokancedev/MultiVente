import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

type RequestLike = { path?: string; url?: string; query?: Record<string, unknown> };

// Routes that may carry the JWT in `?access_token` because the browser API that
// hits them (EventSource) cannot set an Authorization header. Keep this list
// tight: accepting the token via the URL widens the leakage surface (it lands in
// logs / Referer), so it is allowed ONLY on the SSE stream route.
const SSE_PATHS = [/\/publications\/stream$/];

export function sseQueryTokenExtractor(req: RequestLike): string | null {
  const raw = req?.path ?? req?.url ?? '';
  const path = raw.split('?')[0];
  if (!SSE_PATHS.some((re) => re.test(path))) return null;
  const token = (req?.query?.access_token as string | undefined) ?? null;
  return token || null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        sseQueryTokenExtractor,
      ]),
      secretOrKey: process.env.JWT_ACCESS_SECRET as string,
    });
  }

  async validate(payload: { sub: string; email: string }) {
    return { id: payload.sub, email: payload.email };
  }
}
