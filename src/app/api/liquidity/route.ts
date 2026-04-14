import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const USDC = "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8";
const TAKER = "0x0000000000000000000000000000000000000000000000000000000000000001";

interface TokenConfig {
  symbol: string;
  address: string;
  decimals: number;
  probeAmounts: number[];
}

// Coarse probes to establish the range
const ETH_PROBES = [1, 10, 50, 100, 200, 500, 1000];
const BTC_PROBES = [0.01, 0.1, 0.5, 1, 5, 10, 50];
const STRK_PROBES = [1000, 10000, 100000, 500000, 1000000, 5000000, 50000000];

const TOKENS: TokenConfig[] = [
  { symbol: "ETH", address: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", decimals: 18, probeAmounts: ETH_PROBES },
  { symbol: "wstETH", address: "0x0057912720381af14b0e5c87aa4718ed5e527eab60b3801ebf702ab09139e38b", decimals: 18, probeAmounts: ETH_PROBES },
  { symbol: "WBTC", address: "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac", decimals: 8, probeAmounts: BTC_PROBES },
  { symbol: "LBTC", address: "0x036834a40984312f7f7de8d31e3f6305b325389eaeea5b1c0664b2fb936461a4", decimals: 8, probeAmounts: BTC_PROBES },
  { symbol: "tBTC", address: "0x04daa17763b286d1e59b97c283c0b8c949994c361e426a28f743c67bdfe9a32f", decimals: 18, probeAmounts: BTC_PROBES },
  { symbol: "SolvBTC", address: "0x0593e034dda23eea82d2ba9a30960ed42cf4a01502cc2351dc9b9881f9931a68", decimals: 18, probeAmounts: BTC_PROBES },
  { symbol: "xWBTC", address: "0x06a567e68c805323525fe1649adb80b03cddf92c23d2629a6779f54192dffc13", decimals: 8, probeAmounts: BTC_PROBES },
  { symbol: "xtBTC", address: "0x043a35c1425a0125ef8c171f1a75c6f31ef8648edcc8324b55ce1917db3f9b91", decimals: 18, probeAmounts: BTC_PROBES },
  { symbol: "xsBTC", address: "0x0580f3dc564a7b82f21d40d404b3842d490ae7205e6ac07b1b7af2b4a5183dc9", decimals: 18, probeAmounts: BTC_PROBES },
  { symbol: "xLBTC", address: "0x07dd3c80de9fcc5545f0cb83678826819c79619ed7992cc06ff81fc67cd2efe0", decimals: 8, probeAmounts: BTC_PROBES },
  { symbol: "STRK", address: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", decimals: 18, probeAmounts: STRK_PROBES },
  { symbol: "xSTRK", address: "0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a", decimals: 18, probeAmounts: STRK_PROBES },
  { symbol: "sSTRK", address: "0x0356f304b154d29d2a8fe22f1cb9107a9b564a733cf6b4cc47fd121ac1af90c9", decimals: 18, probeAmounts: STRK_PROBES },
];

function toHex(amount: number, decimals: number): string {
  const wei = BigInt(Math.floor(amount)) * 10n ** BigInt(decimals) +
    BigInt(Math.round((amount % 1) * 10 ** Math.min(decimals, 15))) *
    10n ** BigInt(Math.max(0, decimals - 15));
  return "0x" + wei.toString(16);
}

interface QuotePoint {
  amount: number;
  sellUsd: number;
  priceImpact: number;
}

async function fetchQuote(
  sellToken: string,
  amount: number,
  decimals: number
): Promise<QuotePoint | null> {
  const url = `https://starknet.api.avnu.fi/swap/v2/quotes?sellTokenAddress=${sellToken}&buyTokenAddress=${USDC}&sellAmount=${toHex(amount, decimals)}&takerAddress=${TAKER}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const q = data[0];
    if (!q.sellAmountInUsd || q.sellAmountInUsd <= 0) return null;
    const impact = ((q.sellAmountInUsd - q.buyAmountInUsd) / q.sellAmountInUsd) * 100;
    return { amount, sellUsd: q.sellAmountInUsd, priceImpact: Math.max(0, impact) };
  } catch {
    return null;
  }
}

// Binary search between two token amounts to find the amount at a target impact
async function binarySearchImpact(
  token: TokenConfig,
  loAmt: number,
  hiAmt: number,
  targetImpact: number,
  iterations: number = 5
): Promise<QuotePoint | null> {
  let lo = loAmt;
  let hi = hiAmt;
  let bestBelow: QuotePoint | null = null;

  for (let i = 0; i < iterations; i++) {
    const mid = Math.sqrt(lo * hi); // geometric midpoint
    const quote = await fetchQuote(token.address, mid, token.decimals);
    if (!quote) break;

    if (quote.priceImpact <= targetImpact) {
      bestBelow = quote;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return bestBelow;
}

// For a given target impact, find the max sell volume that stays under it
async function findLiqAtImpact(
  token: TokenConfig,
  probePoints: QuotePoint[],
  targetImpact: number
): Promise<number> {
  // Find the bracket: last probe below target and first probe above target
  const sorted = [...probePoints].sort((a, b) => a.amount - b.amount);

  let lastBelow: QuotePoint | null = null;
  let firstAbove: QuotePoint | null = null;

  for (const p of sorted) {
    if (p.priceImpact <= targetImpact) {
      lastBelow = p;
    } else if (!firstAbove) {
      firstAbove = p;
    }
  }

  // If no probe exceeds target, return the largest probe value
  if (!firstAbove) {
    return lastBelow?.sellUsd ?? 0;
  }

  // If no probe is below target, the liquidity is very thin
  if (!lastBelow) {
    return 0;
  }

  // Binary search between the two bracket amounts
  const refined = await binarySearchImpact(
    token,
    lastBelow.amount,
    firstAbove.amount,
    targetImpact
  );

  return refined?.sellUsd ?? lastBelow.sellUsd;
}

export interface TokenLiquidity {
  symbol: string;
  liq5: number;
  liq10: number;
}

export async function GET() {
  try {
    const results: TokenLiquidity[] = await Promise.all(
      TOKENS.map(async (token) => {
        // Phase 1: coarse probes (all in parallel)
        const quotes = await Promise.all(
          token.probeAmounts.map((amt) =>
            fetchQuote(token.address, amt, token.decimals)
          )
        );

        const probePoints: QuotePoint[] = quotes.filter((q): q is QuotePoint => q !== null);

        if (probePoints.length === 0) {
          return { symbol: token.symbol, liq5: 0, liq10: 0 };
        }

        // Phase 2: binary search to refine each threshold (in parallel)
        const [liq5, liq10] = await Promise.all([
          findLiqAtImpact(token, probePoints, 5),
          findLiqAtImpact(token, probePoints, 10),
        ]);

        return { symbol: token.symbol, liq5, liq10 };
      })
    );

    return NextResponse.json({ data: results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch liquidity" },
      { status: 500 }
    );
  }
}
