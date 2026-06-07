import type {
  AssistedPayload,
  AuthResponse,
  CreateListingInput,
  DashboardStats,
  Listing,
  MarketplaceAccountView,
  ListingPhoto,
  LoginInput,
  Marketplace,
  Publication,
  PresignResponse,
  RegisterInput,
  UpdateListingInput,
} from '@multimarket/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function authHeaders(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('accessToken') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseError(res: Response): Promise<string> {
  let message = `Request failed (${res.status})`;
  try {
    const data = await res.json();
    if (data?.message) message = Array.isArray(data.message) ? data.message.join(', ') : data.message;
  } catch {
    /* ignore non-JSON bodies */
  }
  return message;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

async function authedJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

export function registerUser(input: RegisterInput): Promise<AuthResponse> {
  return postJson<AuthResponse>('/auth/register', input);
}

export function loginUser(input: LoginInput): Promise<AuthResponse> {
  return postJson<AuthResponse>('/auth/login', input);
}

export function createListing(input: CreateListingInput): Promise<Listing> {
  return authedJson<Listing>('/listings', 'POST', input);
}

export function listListings(): Promise<Listing[]> {
  return authedJson<Listing[]>('/listings', 'GET');
}

export function updateListing(id: string, input: UpdateListingInput): Promise<Listing> {
  return authedJson<Listing>(`/listings/${id}`, 'PATCH', input);
}

export function deleteListing(id: string): Promise<{ deleted: boolean }> {
  return authedJson<{ deleted: boolean }>(`/listings/${id}`, 'DELETE');
}

export function presignPhoto(listingId: string, filename: string, contentType: string): Promise<PresignResponse> {
  return authedJson<PresignResponse>(`/listings/${listingId}/photos/presign`, 'POST', { filename, contentType });
}

export function attachPhoto(listingId: string, key: string, order: number): Promise<ListingPhoto> {
  return authedJson<ListingPhoto>(`/listings/${listingId}/photos`, 'POST', { key, order });
}

export async function uploadPhotoFile(listingId: string, file: File, order: number): Promise<ListingPhoto> {
  const { uploadUrl, key } = await presignPhoto(listingId, file.name, file.type || 'application/octet-stream');
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return attachPhoto(listingId, key, order);
}

export function publishEverywhere(listingId: string, marketplaces: Marketplace[]): Promise<Publication[]> {
  return authedJson<Publication[]>(`/listings/${listingId}/publish`, 'POST', { marketplaces });
}

export function getPublications(listingId: string): Promise<Publication[]> {
  return authedJson<Publication[]>(`/listings/${listingId}/publications`, 'GET');
}

export function getAssisted(publicationId: string): Promise<AssistedPayload> {
  return authedJson<AssistedPayload>(`/publications/${publicationId}/assisted`, 'GET');
}

export function markPosted(publicationId: string, externalUrl?: string): Promise<Publication> {
  return authedJson<Publication>(`/publications/${publicationId}/posted`, 'PATCH', externalUrl ? { externalUrl } : {});
}

export function getDashboard(): Promise<DashboardStats> {
  return authedJson<DashboardStats>('/dashboard', 'GET');
}

export function getAccounts(): Promise<MarketplaceAccountView[]> {
  return authedJson<MarketplaceAccountView[]>('/accounts', 'GET');
}

export function setAccountConnected(marketplace: Marketplace, connected: boolean): Promise<MarketplaceAccountView> {
  return authedJson<MarketplaceAccountView>(`/accounts/${marketplace}`, 'PATCH', { connected });
}
