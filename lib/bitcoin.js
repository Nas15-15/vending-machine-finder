const DEFAULT_BITCOIN_API = 'https://blockstream.info/api';
const REQUIRED_CONFIRMATIONS = Number(process.env.BITCOIN_REQUIRED_CONFIRMATIONS || '1');
const MIN_CONFIRMATIONS_FOR_UNLOCK = Math.max(1, REQUIRED_CONFIRMATIONS);

async function fetchJson (url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'VendingMachineFinder/1.1'
        }
      });
      if (!response.ok) {
        if (response.status === 404 && i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
          continue;
        }
        throw new Error(`Bitcoin API error ${response.status}`);
      }
      return response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

export async function verifyBitcoinPayment ({ txId, address, minSats }) {
  if (!txId || !address || !minSats) {
    throw new Error('Missing Bitcoin verification parameters');
  }

  const baseUrl = process.env.BITCOIN_API_BASE || DEFAULT_BITCOIN_API;
  let txData;
  let status;

  try {
    [txData, status] = await Promise.all([
      fetchJson(`${baseUrl}/tx/${txId}`),
      fetchJson(`${baseUrl}/tx/${txId}/status`)
    ]);
  } catch (error) {
    throw new Error(`Failed to fetch transaction data: ${error.message}`);
  }

  const matchingOutputs = txData.vout?.filter((output) => {
    return output.scriptpubkey_address === address;
  }) || [];

  const totalSats = matchingOutputs.reduce((sum, output) => sum + (output.value || 0), 0);
  const confirmations = status?.block_height ? Math.max(0, (await getCurrentBlockHeight(baseUrl)) - status.block_height + 1) : 0;
  const confirmed = confirmations >= MIN_CONFIRMATIONS_FOR_UNLOCK;

  return {
    txId,
    address,
    confirmations,
    confirmed,
    totalSats,
    meetsThreshold: totalSats >= minSats,
    blockHeight: status?.block_height || null
  };
}

async function getCurrentBlockHeight (baseUrl) {
  try {
    const tip = await fetchJson(`${baseUrl}/blocks/tip/height`);
    return tip || 0;
  } catch {
    return 0;
  }
}

