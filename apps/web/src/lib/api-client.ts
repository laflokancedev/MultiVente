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
    } catch {
      /* ignore non-JSON bodies */
    }
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
