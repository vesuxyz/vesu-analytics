import { NextResponse } from "next/server";
import { CallData } from "starknet";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalizeAddress(addr: string): string {
  const stripped = addr.replace(/^0x0*/, "");
  return "0x" + (stripped || "0").toLowerCase();
}

interface RpcCall {
  contractAddress: string;
  entrypoint: string;
  calldata: string[];
}

interface RpcBatchResult {
  id: number;
  result?: string[];
  error?: unknown;
}

// Batch multiple starknet_call requests into a single HTTP request
async function batchCall(
  rpcUrl: string,
  calls: RpcCall[]
): Promise<(string[] | null)[]> {
  const body = calls.map((call, i) => ({
    jsonrpc: "2.0",
    method: "starknet_call",
    params: [
      {
        contract_address: call.contractAddress,
        entry_point_selector: selectorFromName(call.entrypoint),
        calldata: call.calldata.map((v) =>
          v.startsWith("0x") ? v : "0x" + BigInt(v).toString(16)
        ),
      },
      "latest",
    ],
    id: i,
  }));

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`RPC batch returned ${res.status}`);

  const results: RpcBatchResult[] = await res.json();

  // Sort by id to maintain order
  results.sort((a, b) => a.id - b.id);

  return results.map((r) => r.result ?? null);
}

// Starknet selector: sn_keccak of function name
function selectorFromName(name: string): string {
  // Pre-computed selectors for the functions we use
  const selectors: Record<string, string> = {
    owner: "0x2016836a56b71f0d02689e69e326f4f4c1b9057164ef592671cf0d37c8040c0",
    pending_owner: "0xb2657a0f8a90ed8e62f4c4cceca06eacaa9b4b25751ae1ebca9280a70abd68",
    curator: "0x38b3fd2ff17638092aa002125df632689f3f241d0a395d3601646fb8c9ed982",
    pending_curator: "0x3674f571fdd2c271ad34c8bc8f210f18c1d47850096cb866268329d4b7bb736",
    pausing_agent: "0x1d768eb53e56aced7afb3d153af902759ce0948f7efaa01f4870d381e4e374f",
    oracle: "0x1cbf5af14e0328a3cd3a734f92c3832d729d431da79b7873a62cbeebd37beb6",
    fee_recipient: "0x32f8f24d255b8b17e5c006f94d3183428f7f55691ad1bb023152b03fe8d920",
    asset_config: "0x40a1db21c93dd4b0a09e752c7b8cc7db2b84275621c8d2941edd851a22b56f",
    interest_rate_config: "0x3445eeebf08ef8f8e08e1f00ff9a3dfc7bee1ce543734f5bc93d18b7a29ddd8",
    pair_config: "0x171c2fae45c0df09f8253d0a3bdf9756051f8fa442f4349827736d3e3135c06",
  };
  return selectors[name] ?? "0x0";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const poolId = searchParams.get("poolId");

  if (!poolId) {
    return NextResponse.json({ error: "poolId required" }, { status: 400 });
  }

  const rpcUrl = process.env.ALCHEMY_RPC_URL;
  if (!rpcUrl) {
    return NextResponse.json({ error: "ALCHEMY_RPC_URL not set" }, { status: 500 });
  }

  const poolAddress = poolId;

  try {
    // Fetch pool data for asset/pair lists
    const poolRes = await fetch(`https://api.vesu.xyz/pools/${poolId}`, { cache: "no-store" });
    if (!poolRes.ok) throw new Error(`Vesu API returned ${poolRes.status}`);
    const poolData = await poolRes.json();
    const pool = poolData.data;

    const assets: { address: string; symbol: string; decimals: number }[] = pool.assets ?? [];
    const pairs: { collateralAssetAddress: string; debtAssetAddress: string }[] = pool.pairs ?? [];

    // Build all RPC calls in one batch
    const calls: RpcCall[] = [
      // General params (7 calls)
      { contractAddress: poolAddress, entrypoint: "owner", calldata: [] },
      { contractAddress: poolAddress, entrypoint: "pending_owner", calldata: [] },
      { contractAddress: poolAddress, entrypoint: "curator", calldata: [] },
      { contractAddress: poolAddress, entrypoint: "pending_curator", calldata: [] },
      { contractAddress: poolAddress, entrypoint: "pausing_agent", calldata: [] },
      { contractAddress: poolAddress, entrypoint: "oracle", calldata: [] },
      { contractAddress: poolAddress, entrypoint: "fee_recipient", calldata: [] },
    ];
    const GENERAL_COUNT = 7;

    // Asset configs (2 calls per asset: asset_config + interest_rate_config)
    for (const asset of assets) {
      calls.push({
        contractAddress: poolAddress,
        entrypoint: "asset_config",
        calldata: CallData.compile([asset.address]),
      });
      calls.push({
        contractAddress: poolAddress,
        entrypoint: "interest_rate_config",
        calldata: CallData.compile([asset.address]),
      });
    }

    // Pair configs (1 call per pair)
    for (const pair of pairs) {
      calls.push({
        contractAddress: poolAddress,
        entrypoint: "pair_config",
        calldata: CallData.compile([pair.collateralAssetAddress, pair.debtAssetAddress]),
      });
    }

    // Single batch RPC request
    const results = await batchCall(rpcUrl, calls);

    // Parse general params
    const general = {
      owner: results[0]?.[0] ?? null,
      pending_owner: results[1]?.[0] ?? null,
      curator: results[2]?.[0] ?? null,
      pending_curator: results[3]?.[0] ?? null,
      pausing_agent: results[4]?.[0] ?? null,
      oracle: results[5]?.[0] ?? null,
      fee_recipient: results[6]?.[0] ?? null,
    };

    // Parse asset configs
    const assetConfigs = assets.map((asset, i) => ({
      symbol: asset.symbol,
      address: normalizeAddress(asset.address),
      decimals: asset.decimals,
      assetConfig: results[GENERAL_COUNT + i * 2],
      interestRateConfig: results[GENERAL_COUNT + i * 2 + 1],
    }));

    // Parse pair configs
    const pairOffset = GENERAL_COUNT + assets.length * 2;
    const pairConfigs = pairs.map((pair, i) => {
      const collateral = assets.find(
        (a) => normalizeAddress(a.address) === normalizeAddress(pair.collateralAssetAddress)
      );
      const debt = assets.find(
        (a) => normalizeAddress(a.address) === normalizeAddress(pair.debtAssetAddress)
      );
      return {
        collateralSymbol: collateral?.symbol ?? "?",
        debtSymbol: debt?.symbol ?? "?",
        collateralAddress: normalizeAddress(pair.collateralAssetAddress),
        debtAddress: normalizeAddress(pair.debtAssetAddress),
        config: results[pairOffset + i],
      };
    });

    return NextResponse.json({
      data: { general, assets: assetConfigs, pairs: pairConfigs },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch pool parameters" },
      { status: 500 }
    );
  }
}
