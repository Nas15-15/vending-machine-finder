import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  normalizeEmail,
  markPaidAccess,
  hasPaidAccess,
  grantFreeSearches,
  consumeFreeSearch,
  getCreditStatus
} from '../lib/accessStore.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_STORE_PATH = path.join(__dirname, '..', 'data', 'test-store.json');

describe('Access Control', () => {
  beforeEach(async () => {
    // Clean up test store before each test
    try {
      await fs.unlink(TEST_STORE_PATH);
    } catch {
      // File doesn't exist, that's fine
    }
  });

  describe('normalizeEmail', () => {
    it('should normalize email addresses', () => {
      expect(normalizeEmail('  Test@Example.COM  ')).toBe('test@example.com');
      expect(normalizeEmail('user@domain.com')).toBe('user@domain.com');
      expect(normalizeEmail('')).toBeNull();
      expect(normalizeEmail(null)).toBeNull();
    });
  });

  describe('markPaidAccess', () => {
    it('should mark an email as having paid access', async () => {
      const email = 'test@example.com';
      await markPaidAccess(email, 'stripe', { sessionId: 'test123' });
      const hasAccess = await hasPaidAccess(email);
      expect(hasAccess).toBe(true);
    });

    it('should handle different payment methods', async () => {
      await markPaidAccess('test1@example.com', 'stripe', {});
      await markPaidAccess('test2@example.com', 'bitcoin', { txId: 'abc123' });
      await markPaidAccess('test3@example.com', 'promo', { code: 'TEST123' });

      expect(await hasPaidAccess('test1@example.com')).toBe(true);
      expect(await hasPaidAccess('test2@example.com')).toBe(true);
      expect(await hasPaidAccess('test3@example.com')).toBe(true);
    });
  });

  describe('Free Search Credits', () => {
    it('should grant and consume free searches', async () => {
      const email = 'test@example.com';
      await grantFreeSearches(email, 3);
      
      let status = await getCreditStatus(email);
      expect(status.freeSearches).toBe(3);

      const consumed = await consumeFreeSearch(email);
      expect(consumed).toBe(true);

      status = await getCreditStatus(email);
      expect(status.freeSearches).toBe(2);
    });

    it('should not consume if no free searches remain', async () => {
      const email = 'test@example.com';
      const consumed = await consumeFreeSearch(email);
      expect(consumed).toBe(false);
    });
  });
});



















