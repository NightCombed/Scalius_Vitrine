// ─── Customer Types ────────────────────────────────────────────────────────────
// password_hash and session tokens are NEVER exposed to the frontend.
// All auth operations go through Edge Functions with the service role key.

export interface CustomerAddress {
  id: string;
  customer_id: string;
  label: string;            // "Casa" | "Trabalho" | "Outro"
  postal_code: string;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood?: string | null;
  city: string;
  state: string;            // 2-letter BR state code
  is_default: boolean;
  created_at: string;
}

/** Public customer profile — safe to store in frontend state */
export interface CustomerProfile {
  id: string;
  store_id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  created_at: string;
  updated_at: string;
}

/** Profile + addresses — used in "My Account" page */
export interface CustomerWithAddresses extends CustomerProfile {
  addresses: CustomerAddress[];
}

// ─── Auth Flow Types ───────────────────────────────────────────────────────────

export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

/** Returned by customer-auth Edge Function on successful login/register */
export interface AuthResponse {
  token: string;          // raw JWT — store in localStorage as 'customer_token'
  expires_at: string;     // ISO timestamp — use to check expiry client-side
  customer: CustomerProfile;
}

/** Shape of the decoded JWT payload (never expose secret or hash) */
export interface CustomerTokenPayload {
  sub: string;            // customer_id
  store_id: string;
  email: string;
  iat: number;
  exp: number;
}

// ─── Local Session ─────────────────────────────────────────────────────────────

export const CUSTOMER_TOKEN_KEY = "customer_token";
export const CUSTOMER_PROFILE_KEY = "customer_profile";

export function getStoredToken(): string | null {
  return localStorage.getItem(CUSTOMER_TOKEN_KEY);
}

export function getStoredProfile(): CustomerProfile | null {
  try {
    const raw = localStorage.getItem(CUSTOMER_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as CustomerProfile) : null;
  } catch {
    return null;
  }
}

export function saveSession(auth: AuthResponse): void {
  localStorage.setItem(CUSTOMER_TOKEN_KEY, auth.token);
  localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(auth.customer));
}

export function clearSession(): void {
  localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_PROFILE_KEY);
}

export function isSessionExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}
