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
