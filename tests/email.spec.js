import { describe, it, expect } from 'vitest';
import { sanitizeEmail } from '../src/state/email.js';

describe('sanitizeEmail', () => {
  it('returns lowercase trimmed email when valid', () => {
    expect(sanitizeEmail('  USER@example.com ')).toBe('user@example.com');
  });

  it('rejects invalid emails', () => {
    expect(sanitizeEmail('not-an-email')).toBe('');
    expect(sanitizeEmail('')).toBe('');
  });
});




















