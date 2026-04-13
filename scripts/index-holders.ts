/**
 * Standalone script to index all token holders up to the current block.
 * Writes results to src/data/holders-snapshot.json
 *
 * Usage: npx tsx scripts/index-holders.ts
 */

import { RpcProvider, CallData } from "starknet";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const TRANSFER_KEY =
  "0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9";

const TOKENS = [
  { symbol: "USDC", address: "0x033068F6539f8e6e6b131e6B2B814e6c34A5224bC66947c47DaB9dFeE93b35fb", decimals: 6, deployBlock: 6000000 },
  { symbol: "USDT", address: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8", decimals: 6, deployBlock: 4000 },
  { symbol: "WBTC", address: "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac", decimals: 8, deployBlock: 4000 },
  { symbol: "solvBTC", address: "0x0593e034dda23eea82d2ba9a30960ed42cf4a01502cc2351dc9b9881f9931a68", decimals: 18, deployBlock: 7000000 },
  { symbol: "tBTC", address: "0x04daa17763b286d1e59b97c283c0b8c949994c361e426a28f743c67bdfe9a32f", decimals: 18, deployBlock: 7000000 },
  { symbol: "LBTC", address: "0x036834a40984312f7f7de8d31e3f6305b325389eaeea5b1c0664b2fb936461a4", decimals: 8, deployBlock: 7000000 },
  { symbol: "ETH", address: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", decimals: 18, deployBlock: 4000 },
  { symbol: "wstETH", address: "0x042b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2", decimals: 18, deployBlock: 99000 },
  { symbol: "STRK", address: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", decimals: 18, deployBlock: 599000 },
];

const PERSIST_N = 500;

function normalizeAddress(addr: string): string {
  const stripped = addr.replace(/^0x0*/, "");
  return "0x" + (stripped || "0").toLowerCase();
}

const ZERO = normalizeAddress("0x0");

interface TransferEvent {
  from: string;
  to: string;
  value: bigint;
}

function parseTransferEvent(event: { keys: string[]; data: string[] }): TransferEvent | null {
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

async function scanToken(
  provider: RpcProvider,
  token: (typeof TOKENS)[0],
  latestBlock: number,
  existingHolders?: { address: string; balance: string }[],
  lastIndexedBlock?: number
) {
  const balances = new Map<string, bigint>();

  // Seed with existing snapshot balances
  if (existingHolders) {
    for (const h of existingHolders) {
      balances.set(h.address, BigInt(h.balance));
    }
  }

  const fromBlock = lastIndexedBlock != null ? lastIndexedBlock + 1 : token.deployBlock;

  if (fromBlock > latestBlock) {
    console.log(`[${token.symbol}] Already up to date (block ${latestBlock}).`);
    const topHolders = Array.from(balances.entries())
      .filter(([, bal]) => bal > 0n)
      .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
      .slice(0, PERSIST_N)
      .map(([address, balance]) => ({ address, balance: balance.toString() }));
    return { topHolders, lastIndexedBlock: latestBlock };
  }

  let continuationToken: string | undefined = undefined;
  let eventCount = 0;
  let highestBlock = fromBlock;

  process.stdout.write(`[${token.symbol}] Scanning from block ${fromBlock.toLocaleString()}...`);

  while (true) {
    const params: Record<string, unknown> = {
      from_block: { block_number: fromBlock },
      to_block: { block_number: latestBlock },
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
      if (bn !== undefined && bn > highestBlock) highestBlock = bn;

      const transfer = parseTransferEvent(event);
      if (!transfer || transfer.value === 0n) continue;

      if (transfer.from !== ZERO) {
        const prev = balances.get(transfer.from) ?? 0n;
        balances.set(transfer.from, prev - transfer.value);
      }
      if (transfer.to !== ZERO) {
        const prev = balances.get(transfer.to) ?? 0n;
        balances.set(transfer.to, prev + transfer.value);
      }
    }

    eventCount += result.events.length;
    const pct =
      latestBlock > token.deployBlock
        ? Math.round(
            ((highestBlock - token.deployBlock) /
              (latestBlock - token.deployBlock)) *
              100
          )
        : 100;
    process.stdout.write(
      `\r[${token.symbol}] ${eventCount.toLocaleString()} events, block ${highestBlock.toLocaleString()} (${pct}%)    `
    );

    continuationToken = result.continuation_token as string | undefined;
    if (!continuationToken) break;
  }

  const topHolders = Array.from(balances.entries())
    .filter(([, bal]) => bal > 0n)
    .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
    .slice(0, PERSIST_N)
    .map(([address, balance]) => ({ address, balance: balance.toString() }));

  console.log(
    `\r[${token.symbol}] Done. ${eventCount.toLocaleString()} events, ${balances.size.toLocaleString()} addresses, top ${topHolders.length} saved.`
  );

  return { topHolders, lastIndexedBlock: latestBlock };
}

async function main() {
  const rpcUrl = process.env.ALCHEMY_RPC_URL;
  if (!rpcUrl) {
    console.error("Set ALCHEMY_RPC_URL in .env.local");
    process.exit(1);
  }

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const latestBlockResult = await provider.getBlockLatestAccepted();
  const latestBlock = latestBlockResult.block_number;
  console.log(`Latest block: ${latestBlock.toLocaleString()}\n`);

  // Load existing snapshot for incremental indexing
  const outDir = join(__dirname, "..", "src", "data");
  const outPath = join(outDir, "holders-snapshot.json");
  let existingSnapshot: Record<string, { topHolders: { address: string; balance: string }[]; lastIndexedBlock: number }> = {};

  if (existsSync(outPath)) {
    try {
      const data = JSON.parse(readFileSync(outPath, "utf-8"));
      existingSnapshot = data.tokens ?? {};
      console.log(`Loaded existing snapshot (block ${data.latestBlock?.toLocaleString()})\n`);
    } catch {
      console.log("Could not parse existing snapshot, doing full rescan.\n");
    }
  } else {
    console.log("No existing snapshot found, doing full scan.\n");
  }

  const snapshot: Record<
    string,
    {
      topHolders: { address: string; balance: string }[];
      lastIndexedBlock: number;
    }
  > = {};

  // Scan tokens sequentially to limit memory
  for (const token of TOKENS) {
    const existing = existingSnapshot[token.address];
    snapshot[token.address] = await scanToken(
      provider,
      token,
      latestBlock,
      existing?.topHolders,
      existing?.lastIndexedBlock
    );
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), latestBlock, tokens: snapshot }, null, 2)
  );

  console.log(`\nSnapshot written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
