import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyBitcoinPayment } from '../lib/bitcoin.js';

global.fetch = vi.fn();

describe('Payment Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BITCOIN_REQUIRED_CONFIRMATIONS = '1';
  });

  describe('Bitcoin Verification', () => {
    it('should verify Bitcoin payment with sufficient confirmations', async () => {
      const mockTxData = {
        vout: [
          {
            scriptpubkey_address: 'bc1qtest',
            value: 100000
          }
        ]
      };

      const mockStatus = {
        confirmed: true,
        block_height: 800000
      };

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTxData
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockStatus
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => 800001
        });

      const result = await verifyBitcoinPayment({
        txId: 'test123',
        address: 'bc1qtest',
        minSats: 50000
      });

      expect(result.confirmed).toBe(true);
      expect(result.meetsThreshold).toBe(true);
      expect(result.totalSats).toBe(100000);
    });

    it('should reject payment below threshold', async () => {
      const mockTxData = {
        vout: [
          {
            scriptpubkey_address: 'bc1qtest',
            value: 10000
          }
        ]
      };

      const mockStatus = {
        confirmed: true,
        block_height: 800000
      };

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTxData
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockStatus
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => 800001
        });

      const result = await verifyBitcoinPayment({
        txId: 'test123',
        address: 'bc1qtest',
        minSats: 50000
      });

      expect(result.meetsThreshold).toBe(false);
    });

    it('should handle missing parameters', async () => {
      await expect(verifyBitcoinPayment({})).rejects.toThrow('Missing Bitcoin verification parameters');
    });
  });
});



















