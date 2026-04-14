import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const USDC = "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8";
const TAKER = "0x0000000000000000000000000000000000000000000000000000000000000001";

interface TokenConfig {
  symbol: string;
  address: string;
  decimals: number;
  sellAmounts: number[];
}

// Amounts tuned per price range so we get useful data points across 0-50% impact
const ETH_AMOUNTS = [0.1, 1, 5, 10, 50, 100, 500, 1000];
const BTC_AMOUNTS = [0.01, 0.1, 0.5, 1, 5, 10, 50];
const STRK_AMOUNTS = [10000, 100000, 500000, 1000000, 5000000, 10000000, 50000000, 100000000];

const TOKENS: TokenConfig[] = [
  { symbol: "ETH", address: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", decimals: 18, sellAmounts: ETH_AMOUNTS },
  { symbol: "wstETH", address: "0x0057912720381af14b0e5c87aa4718ed5e527eab60b3801ebf702ab09139e38b", decimals: 18, sellAmounts: ETH_AMOUNTS },
  { symbol: "WBTC", address: "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac", decimals: 8, sellAmounts: BTC_AMOUNTS },
  { symbol: "LBTC", address: "0x036834a40984312f7f7de8d31e3f6305b325389eaeea5b1c0664b2fb936461a4", decimals: 8, sellAmounts: BTC_AMOUNTS },
  { symbol: "tBTC", address: "0x04daa17763b286d1e59b97c283c0b8c949994c361e426a28f743c67bdfe9a32f", decimals: 18, sellAmounts: BTC_AMOUNTS },
  { symbol: "SolvBTC", address: "0x0593e034dda23eea82d2ba9a30960ed42cf4a01502cc2351dc9b9881f9931a68", decimals: 18, sellAmounts: BTC_AMOUNTS },
  { symbol: "STRK", address: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", decimals: 18, sellAmounts: STRK_AMOUNTS },
  { symbol: "xSTRK", address: "0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a", decimals: 18, sellAmounts: STRK_AMOUNTS },
  { symbol: "sSTRK", address: "0x0356f304b154d29d2a8fe22f1cb9107a9b564a733cf6b4cc47fd121ac1af90c9", decimals: 18, sellAmounts: STRK_AMOUNTS },
];

function toHex(amount: number, decimals: number): string {
  const wei = BigInt(Math.round(amount * 10 ** decimals));
  return "0x" + wei.toString(16);
}

interface QuoteResult {
  sellAmountInUsd: number;
  buyAmountInUsd: number;
}

async function fetchQuote(
  sellToken: string,
  sellAmountHex: string
): Promise<QuoteResult | null> {
  const url = `https://starknet.api.avnu.fi/swap/v2/quotes?sellTokenAddress=${sellToken}&buyTokenAddress=${USDC}&sellAmount=${sellAmountHex}&takerAddress=${TAKER}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return {
      sellAmountInUsd: data[0].sellAmountInUsd,
      buyAmountInUsd: data[0].buyAmountInUsd,
    };
  } catch {
    return null;
  }
}

export interface LiquidityPoint {
  sellUsd: number;
  priceImpact: number;
}

export interface TokenLiquidity {
  symbol: string;
  points: LiquidityPoint[];
}

export async function GET() {
  try {
    const results: TokenLiquidity[] = [];

    // Fetch all tokens in parallel
    const tokenResults = await Promise.all(
      TOKENS.map(async (token) => {
        const quotes = await Promise.all(
          token.sellAmounts.map((amt) =>
            fetchQuote(token.address, toHex(amt, token.decimals))
          )
        );

        const points: LiquidityPoint[] = [];
        for (const q of quotes) {
          if (!q || q.sellAmountInUsd <= 0) continue;
          const impact =
            ((q.sellAmountInUsd - q.buyAmountInUsd) / q.sellAmountInUsd) * 100;
          points.push({
            sellUsd: q.sellAmountInUsd,
            priceImpact: Math.max(0, impact),
          });
        }

        points.sort((a, b) => a.priceImpact - b.priceImpact);

        return { symbol: token.symbol, points };
      })
    );

    for (const r of tokenResults) {
      if (r.points.length > 0) results.push(r);
    }

    return NextResponse.json({ data: results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch liquidity" },
      { status: 500 }
    );
  }
}
