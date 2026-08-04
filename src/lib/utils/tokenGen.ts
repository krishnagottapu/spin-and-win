import { randomUUID } from 'crypto';

/**
 * Generates a cryptographically secure random UUID (v4).
 */
export function generateToken(): string {
  return randomUUID();
}

/**
 * Generates a short invite code (8 uppercase alphanumeric characters).
 */
export function generateInviteCode(): string {
  return randomUUID().slice(0, 8).toUpperCase();
}
