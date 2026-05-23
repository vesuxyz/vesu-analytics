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
    shutdown_status: "0x36d02ad371c8a01c1f288dedafc7ae66d676b2d213c71754a1e92f023de4835",
    v_token_for_collateral_asset: "0x3ee28cd35b58271a6de956929d6e0e1eeb9f74099bab524a502ff3e9e095cb2",
    asset_config_unsafe: "0x80ca3e9920a8cd3435b3652f2a12b8f45ec4850ae06783f157757ab3296eb2",
    ltv_config: "0x239af5fa5cb958318bb362bbfdeb62ba623b36dbb081b6daa1b65564abc7b43",
    debt_caps: "0x393e1ce579fae75f99930ca1e96837f730c6109117abd2b9164ca0016af6437",
    liquidation_config: "0x3c63b4c7078b43eb9d0258a6a7476707f5747012b2fc535fba05a63b75754ce",
  };
  return selectors[name] ?? "0x0";
}

const SHUTDOWN_MODES = ["None", "Recovery", "Subscription", "Redemption"];

async function handleV1(rpcUrl: string, poolId: string) {
  const poolRes = await fetch(`https://api.vesu.xyz/pools/${poolId}`, { cache: "no-store" });
  if (!poolRes.ok) throw new Error(`Vesu API returned ${poolRes.status}`);
  const pool = (await poolRes.json()).data;

  const extensionAddress = pool.extensionContractAddress;
  const singletonAddress = pool.singletonContractAddress;
  if (!extensionAddress || !singletonAddress) throw new Error("Missing extension or singleton contract");

  const assets: { address: string; symbol: string; decimals: number }[] = pool.assets ?? [];
  const pairs: { collateralAssetAddress: string; debtAssetAddress: string }[] = pool.pairs ?? [];

  const calls: RpcCall[] = [];

  // Asset configs: asset_config_unsafe on singleton + interest_rate_config on extension (2 per asset)
  for (const asset of assets) {
    calls.push({
      contractAddress: singletonAddress,
      entrypoint: "asset_config_unsafe",
      calldata: CallData.compile([poolId, asset.address]),
    });
    calls.push({
      contractAddress: extensionAddress,
      entrypoint: "interest_rate_config",
      calldata: CallData.compile([poolId, asset.address]),
    });
  }
  const assetCallCount = assets.length * 2;

  // Pair configs: ltv_config on singleton + debt_caps on extension + liquidation_config on extension + shutdown_status on extension (4 per pair)
  for (const pair of pairs) {
    const cd = CallData.compile([poolId, pair.collateralAssetAddress, pair.debtAssetAddress]);
    calls.push({ contractAddress: singletonAddress, entrypoint: "ltv_config", calldata: cd });
    calls.push({ contractAddress: extensionAddress, entrypoint: "debt_caps", calldata: cd });
    calls.push({ contractAddress: extensionAddress, entrypoint: "liquidation_config", calldata: cd });
    calls.push({ contractAddress: extensionAddress, entrypoint: "shutdown_status", calldata: cd });
  }
  const pairCallCount = pairs.length * 4;

  // vToken: v_token_for_collateral_asset + shutdown_status(collateral, 0x0) (2 per asset)
  const vtokenOffset = assetCallCount + pairCallCount;
  for (const asset of assets) {
    calls.push({
      contractAddress: extensionAddress,
      entrypoint: "v_token_for_collateral_asset",
      calldata: CallData.compile([poolId, asset.address]),
    });
    calls.push({
      contractAddress: extensionAddress,
      entrypoint: "shutdown_status",
      calldata: CallData.compile([poolId, asset.address, "0x0"]),
    });
  }

  const results = calls.length > 0 ? await batchCall(rpcUrl, calls) : [];

  // Parse asset configs
  const assetConfigs = assets.map((asset, i) => ({
    symbol: asset.symbol,
    address: normalizeAddress(asset.address),
    decimals: asset.decimals,
    assetConfig: results[i * 2],
    interestRateConfig: results[i * 2 + 1],
  }));

  // Parse pair configs
  const pairConfigs = pairs.map((pair, i) => {
    const collateral = assets.find(
      (a) => normalizeAddress(a.address) === normalizeAddress(pair.collateralAssetAddress)
    );
    const debt = assets.find(
      (a) => normalizeAddress(a.address) === normalizeAddress(pair.debtAssetAddress)
    );
    const base = assetCallCount + i * 4;
    const ltvResult = results[base];
    const debtCapResult = results[base + 1];
    const liqResult = results[base + 2];
    const shutdownResult = results[base + 3];
    const modeIdx = shutdownResult ? Number(BigInt(shutdownResult[0])) : 0;
    return {
      collateralSymbol: collateral?.symbol ?? "?",
      debtSymbol: debt?.symbol ?? "?",
      collateralAddress: normalizeAddress(pair.collateralAssetAddress),
      debtAddress: normalizeAddress(pair.debtAssetAddress),
      config: [
        ltvResult?.[0] ?? "0x0",
        liqResult?.[0] ?? "0x0",
        debtCapResult?.[0] ?? "0x0",
      ],
      shutdownMode: SHUTDOWN_MODES[modeIdx] ?? "Unknown",
      violating: shutdownResult ? BigInt(shutdownResult[1]) > 0n : false,
      isVToken: false,
    };
  });

  // vToken pairs
  const vtokenPairs = assets
    .map((asset, i) => {
      const vtokenResult = results[vtokenOffset + i * 2];
      const shutdownResult = results[vtokenOffset + i * 2 + 1];
      const vtokenAddr = vtokenResult?.[0];
      if (!vtokenAddr || BigInt(vtokenAddr) === 0n) return null;
      const modeIdx = shutdownResult ? Number(BigInt(shutdownResult[0])) : 0;
      return {
        collateralSymbol: asset.symbol,
        debtSymbol: "vToken",
        collateralAddress: normalizeAddress(asset.address),
        debtAddress: "0x0",
        vTokenAddress: normalizeAddress(vtokenAddr),
        config: null,
        shutdownMode: SHUTDOWN_MODES[modeIdx] ?? "Unknown",
        violating: shutdownResult ? BigInt(shutdownResult[1]) > 0n : false,
        isVToken: true,
      };
    })
    .filter(Boolean);

  const general = {
    singletonContract: singletonAddress,
    extensionContract: extensionAddress,
  };

  return NextResponse.json({
    data: { general, assets: assetConfigs, pairs: [...pairConfigs, ...vtokenPairs] },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const poolId = searchParams.get("poolId");
  const version = searchParams.get("version");

  if (!poolId) {
    return NextResponse.json({ error: "poolId required" }, { status: 400 });
  }

  const rpcUrl = process.env.ALCHEMY_RPC_URL;
  if (!rpcUrl) {
    return NextResponse.json({ error: "ALCHEMY_RPC_URL not set" }, { status: 500 });
  }

  try {
    if (version === "v1") {
      return await handleV1(rpcUrl, poolId);
    }

    const poolAddress = poolId;

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
