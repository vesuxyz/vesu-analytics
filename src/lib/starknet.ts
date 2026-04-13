import { RpcProvider, CallData } from "starknet";
import { TOKENS, Token } from "@/config/tokens";
import { getAddressLabel } from "@/config/address-labels";
import snapshotData from "@/data/holders-snapshot.json";

// sn_keccak("Transfer")
const TRANSFER_KEY =
  "0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9";

const ZERO_ADDRESS = "0x0";

function getProvider(): RpcProvider {
  const nodeUrl = process.env.ALCHEMY_RPC_URL;
  if (!nodeUrl) {
    throw new Error("ALCHEMY_RPC_URL environment variable is not set");
  }
  return new RpcProvider({ nodeUrl });
}

export function formatBalance(raw: bigint, decimals: number): string {
  if (raw === 0n) return "0";
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;
  const fractional = remainder.toString().padStart(decimals, "0").slice(0, 4);
  return `${whole.toLocaleString("en-US")}.${fractional}`;
}

function normalizeAddress(addr: string): string {
  const stripped = addr.replace(/^0x0*/, "");
  return "0x" + (stripped || "0").toLowerCase();
}

interface TransferEvent {
  from: string;
  to: string;
  value: bigint;
}

function parseTransferEvent(event: {
  keys: string[];
  data: string[];
}): TransferEvent | null {
  try {
    if (event.keys.length >= 3 && event.data.length >= 2) {
      return {
        from: normalizeAddress(event.keys[1]),
        to: normalizeAddress(event.keys[2]),
        value: BigInt(event.data[0]) + (BigInt(event.data[1]) << 128n),
      };
    }
    if (event.keys.length === 1 && event.data.length >= 4) {
      return {
        from: normalizeAddress(event.data[0]),
        to: normalizeAddress(event.data[1]),
        value: BigInt(event.data[2]) + (BigInt(event.data[3]) << 128n),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export type ProgressCallback = (event: ProgressEvent) => void;

export type ProgressEvent =
  | { type: "scanning"; symbol: string; events: number; blockProgress: number; latestBlock: number }
  | { type: "scanned"; symbol: string; events: number; holders: number }
  | { type: "querying_balances"; done: number; total: number }
  | { type: "done"; data: BalancesResponse };

export interface BalancesResponse {
  holders: { address: string; label: string | null; balances: Record<string, string> }[];
  others: Record<string, string>;
  totalSupply: Record<string, string>;
  timestamp: string;
}

// --- Persistent cache on globalThis (survives dev-mode HMR & module re-evaluation) ---

// We persist the top PERSIST_N holders per token (not all addresses) to stay
// memory-safe. On incremental rescans the full map is rebuilt from this seed +
// new events, so any address gaining enough in the delta still shows up.
const PERSIST_N = 500;

interface TokenScanState {
  topHolders: { address: string; balance: bigint }[];
  lastIndexedBlock: number;
}

interface AppCache {
  tokenStates: Map<string, TokenScanState>; // keyed by token address
  lastResult: BalancesResponse | null;
  lastResultTime: number;
}

const RESULT_TTL_MS = 10 * 60 * 1000;

// Load snapshot from file to seed the cache
function loadSnapshot(): Map<string, TokenScanState> {
  const states = new Map<string, TokenScanState>();
  const tokens = (snapshotData as { tokens: Record<string, { topHolders: { address: string; balance: string }[]; lastIndexedBlock: number }> }).tokens;
  for (const [address, data] of Object.entries(tokens)) {
    states.set(address, {
      topHolders: data.topHolders.map((h) => ({
        address: h.address,
        balance: BigInt(h.balance),
      })),
      lastIndexedBlock: data.lastIndexedBlock,
    });
  }
  return states;
}

const g = globalThis as unknown as { __starknetCache?: AppCache };
if (!g.__starknetCache) {
  g.__starknetCache = {
    tokenStates: loadSnapshot(),
    lastResult: null,
    lastResultTime: 0,
  };
}
const cache = g.__starknetCache;

// --- Scanning ---

async function scanTokenEvents(
  provider: RpcProvider,
  token: Token,
  latestBlock: number,
  onProgress: ProgressCallback
): Promise<{ address: string; balance: bigint }[]> {
  const state = cache.tokenStates.get(token.address);
  const startBlock = state?.lastIndexedBlock ?? token.deployBlock;

  // Already up to date — return cached top holders
  if (state && startBlock >= latestBlock) {
    onProgress({
      type: "scanned",
      symbol: token.symbol,
      events: 0,
      holders: state.topHolders.length,
    });
    return state.topHolders.slice(0, 10);
  }

  // Build temporary map — seed from persisted top holders when resuming
  const balances = new Map<string, bigint>();
  if (state) {
    for (const h of state.topHolders) {
      balances.set(h.address, h.balance);
    }
  }

  let continuationToken: string | undefined = undefined;
  let eventCount = 0;
  let highestBlock = startBlock;

  while (true) {
    const params: Record<string, unknown> = {
      from_block: { block_number: startBlock + 1 },
      to_block: "latest",
      address: token.address,
      keys: [[TRANSFER_KEY]],
      chunk_size: 1000,
    };
    if (continuationToken) {
      params.continuation_token = continuationToken;
    }

    const result = await provider.getEvents(
      params as Parameters<typeof provider.getEvents>[0]
    );

    for (const event of result.events) {
      const bn = (event as unknown as { block_number?: number }).block_number;
      if (bn !== undefined && bn > highestBlock) {
        highestBlock = bn;
      }

      const transfer = parseTransferEvent(event);
      if (!transfer || transfer.value === 0n) continue;

      if (transfer.from !== normalizeAddress(ZERO_ADDRESS)) {
        const prev = balances.get(transfer.from) ?? 0n;
        balances.set(transfer.from, prev - transfer.value);
      }
      if (transfer.to !== normalizeAddress(ZERO_ADDRESS)) {
        const prev = balances.get(transfer.to) ?? 0n;
        balances.set(transfer.to, prev + transfer.value);
      }
    }

    eventCount += result.events.length;
    const scanRange = latestBlock - token.deployBlock;
    const scannedRange = highestBlock - token.deployBlock;
    onProgress({
      type: "scanning",
      symbol: token.symbol,
      events: eventCount,
      blockProgress: scannedRange,
      latestBlock: scanRange,
    });

    continuationToken = result.continuation_token as string | undefined;
    if (!continuationToken) break;
  }

  // Sort once, persist top PERSIST_N, return top 10
  const sorted = Array.from(balances.entries())
    .filter(([, bal]) => bal > 0n)
    .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));

  const topHolders = sorted
    .slice(0, PERSIST_N)
    .map(([address, balance]) => ({ address, balance }));

  cache.tokenStates.set(token.address, {
    topHolders,
    lastIndexedBlock: latestBlock,
  });

  onProgress({
    type: "scanned",
    symbol: token.symbol,
    events: eventCount,
    holders: balances.size,
  });

  // Full map is GC'd after this function returns
  return topHolders.slice(0, 10);
}

export async function fetchAllBalances(
  onProgress: ProgressCallback
): Promise<BalancesResponse> {
  // Return cached result if fresh
  if (cache.lastResult && Date.now() - cache.lastResultTime < RESULT_TTL_MS) {
    return cache.lastResult;
  }

  const provider = getProvider();
  const tokens = TOKENS;

  const latestBlockResult = await provider.getBlockLatestAccepted();
  const latestBlock = latestBlockResult.block_number;

  // Step 1: Scan tokens sequentially to limit peak memory (one full balance map at a time)
  const topHoldersByToken: { address: string; balance: bigint }[][] = [];
  for (const token of tokens) {
    topHoldersByToken.push(
      await scanTokenEvents(provider, token, latestBlock, onProgress)
    );
  }

  // Step 2: Collect unique addresses
  const allAddresses = new Set<string>();
  for (const holders of topHoldersByToken) {
    for (const h of holders) {
      allAddresses.add(h.address);
    }
  }
  const addressList = Array.from(allAddresses);

  // Step 3: Query fresh balances for all addresses x tokens
  const holderMap = new Map<string, Record<string, bigint>>();
  for (const addr of addressList) {
    holderMap.set(addr, {});
  }

  const totalCalls = addressList.length * tokens.length;
  let doneCalls = 0;

  const balancePromises: Promise<void>[] = [];
  for (const addr of addressList) {
    for (const token of tokens) {
      balancePromises.push(
        callBalanceOf(provider, token.address, addr).then((bal) => {
          holderMap.get(addr)![token.symbol] = bal;
          doneCalls++;
          if (doneCalls % 20 === 0 || doneCalls === totalCalls) {
            onProgress({
              type: "querying_balances",
              done: doneCalls,
              total: totalCalls,
            });
          }
        })
      );
    }
  }
  await Promise.all(balancePromises);

  // Step 4: Total supplies
  const supplyMap: Record<string, bigint> = {};
  await Promise.all(
    tokens.map((token) =>
      callTotalSupply(provider, token.address).then((s) => {
        supplyMap[token.symbol] = s;
      })
    )
  );

  // Step 5: Sort & build response
  const addressScores = new Map<string, number>();
  for (const holders of topHoldersByToken) {
    for (let i = 0; i < holders.length; i++) {
      const prev = addressScores.get(holders[i].address) ?? 0;
      addressScores.set(holders[i].address, prev + (10 - i));
    }
  }
  addressList.sort(
    (a, b) => (addressScores.get(b) ?? 0) - (addressScores.get(a) ?? 0)
  );

  const holders = addressList.map((addr) => {
    const bals: Record<string, string> = {};
    for (const token of tokens) {
      bals[token.symbol] = formatBalance(
        holderMap.get(addr)![token.symbol] ?? 0n,
        token.decimals
      );
    }
    return { address: addr, label: getAddressLabel(addr), balances: bals };
  });

  const others: Record<string, string> = {};
  const totalSupply: Record<string, string> = {};
  for (const token of tokens) {
    const supply = supplyMap[token.symbol] ?? 0n;
    totalSupply[token.symbol] = formatBalance(supply, token.decimals);
    let sumTracked = 0n;
    for (const addr of addressList) {
      sumTracked += holderMap.get(addr)![token.symbol] ?? 0n;
    }
    const othersRaw = supply > sumTracked ? supply - sumTracked : 0n;
    others[token.symbol] = formatBalance(othersRaw, token.decimals);
  }

  const result: BalancesResponse = {
    holders,
    others,
    totalSupply,
    timestamp: new Date().toISOString(),
  };

  cache.lastResult = result;
  cache.lastResultTime = Date.now();

  return result;
}

async function callBalanceOf(
  provider: RpcProvider,
  tokenAddress: string,
  account: string
): Promise<bigint> {
  try {
    const result = await provider.callContract({
      contractAddress: tokenAddress,
      entrypoint: "balanceOf",
      calldata: CallData.compile([account]),
    });
    if (result.length >= 2) {
      return BigInt(result[0]) + (BigInt(result[1]) << 128n);
    }
    return BigInt(result[0]);
  } catch {
    return 0n;
  }
}

async function callTotalSupply(
  provider: RpcProvider,
  tokenAddress: string
): Promise<bigint> {
  try {
    const result = await provider.callContract({
      contractAddress: tokenAddress,
      entrypoint: "totalSupply",
      calldata: [],
    });
    if (result.length >= 2) {
      return BigInt(result[0]) + (BigInt(result[1]) << 128n);
    }
    return BigInt(result[0]);
  } catch {
    return 0n;
  }
}
