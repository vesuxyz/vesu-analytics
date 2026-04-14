"use client";

import { useEffect, useState, useCallback } from "react";

interface DecimalValue {
  value: string;
  decimals: number;
}

interface PoolAsset {
  address: string;
  symbol: string;
  decimals: number;
  usdPrice: DecimalValue;
  stats: {
    totalDebt: DecimalValue;
    totalSupplied: DecimalValue;
    currentUtilization: DecimalValue;
  };
}

interface Pool {
  id: string;
  name: string;
  isDeprecated: boolean;
  protocolVersion: string;
  assets: PoolAsset[];
  pairs: unknown[];
}

interface AssetParams {
  symbol: string;
  address: string;
  // asset_config decoded
  totalCollateralShares: string;
  totalNominalDebt: string;
  reserve: string;
  maxUtilization: string;
  floor: string;
  scale: string;
  isLegacy: string;
  lastUpdated: string;
  lastRateAccumulator: string;
  lastFullUtilizationRate: string;
  feeRate: string;
  feeShares: string;
  // interest_rate_config decoded
  minTargetUtilization: string;
  maxTargetUtilization: string;
  targetUtilization: string;
  minFullUtilizationRate: string;
  maxFullUtilizationRate: string;
  zeroUtilizationRate: string;
  rateHalfLife: string;
  targetRatePercent: string;
}

interface PairParams {
  collateralSymbol: string;
  debtSymbol: string;
  collateralAddress: string;
  debtAddress: string;
  maxLtv: string;
  liquidationFactor: string;
  debtCap: string;
}

interface PoolParamsData {
  general: Record<string, string | null>;
  assets: AssetParams[];
  pairs: PairParams[];
}

function parseDecimal(val: DecimalValue): number {
  return Number(val.value) / 10 ** val.decimals;
}

function formatUsd(value: number): string {
  if (value === 0) return "$0";
  if (value < 1000) return `$${value.toFixed(0)}`;
  if (value < 1_000_000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${(value / 1_000_000).toFixed(2)}M`;
}

function shortenAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function isAddress(value: unknown): boolean {
  return typeof value === "string" && /^0x[0-9a-fA-F]{4,}$/.test(value) && value.length > 10;
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// Decode u256 from two felts (low, high)
function decodeU256(low: string, high: string): bigint {
  return BigInt(low) + (BigInt(high) << 128n);
}

// Format a value scaled by 10^decimals
function fmtScaled(val: bigint, decimals = 18): string {
  if (val === 0n) return "0";
  const divisor = 10n ** BigInt(decimals);
  const whole = val / divisor;
  const frac = (val < 0n ? -val : val) % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  if (!fracStr) return whole.toLocaleString("en-US");
  return `${whole.toLocaleString("en-US")}.${fracStr.slice(0, 6)}`;
}

// Format percentage scaled by 10^18
function fmtPct18(val: bigint): string {
  const pct = Number(val) / 1e18 * 100;
  return `${pct.toFixed(2)}%`;
}

// Format utilization percentage (scaled by 10^5, i.e. 100000 = 100%)
function fmtUtilPct(val: bigint): string {
  const pct = Number(val) / 1000;
  return `${pct.toFixed(1)}%`;
}

// Format per-second rate as annualized percentage (rate is scaled by 10^18)
function fmtRateApr(val: bigint): string {
  if (val === 0n) return "0%";
  const perSecond = Number(val) / 1e18;
  const apr = perSecond * 365.25 * 86400 * 100;
  if (apr < 0.01) return `${apr.toFixed(4)}%`;
  return `${apr.toFixed(2)}%`;
}

function fmtSeconds(val: bigint): string {
  const n = Number(val);
  if (n === 0) return "0";
  if (n < 3600) return `${(n / 60).toFixed(0)}m`;
  if (n < 86400) return `${(n / 3600).toFixed(1)}h`;
  return `${(n / 86400).toFixed(1)}d`;
}

function fmtTimestamp(val: bigint): string {
  if (val === 0n) return "-";
  return new Date(Number(val) * 1000).toLocaleString();
}

function fmtRaw(val: bigint): string {
  return val.toLocaleString("en-US");
}

function withRaw(scaled: string, rawVal: bigint): string {
  // Encode both values: scaled display and raw value separated by a null char
  return `${scaled}\0${rawVal.toString()}`;
}

function getDisplay(val: string | undefined, unscaled: boolean): string {
  if (!val) return "-";
  const parts = val.split("\0");
  if (parts.length < 2) return val;
  return unscaled ? parts[1] : parts[0];
}

function decodeAssetConfig(raw: string[] | null, assetDecimals: number): Partial<AssetParams> {
  if (!raw || raw.length < 22) return {};
  const v = (lo: string, hi: string) => decodeU256(lo, hi);
  return {
    totalCollateralShares: withRaw(fmtScaled(v(raw[0], raw[1])), v(raw[0], raw[1])),
    totalNominalDebt: withRaw(fmtScaled(v(raw[2], raw[3])), v(raw[2], raw[3])),
    reserve: withRaw(fmtScaled(v(raw[4], raw[5]), assetDecimals), v(raw[4], raw[5])),
    maxUtilization: withRaw(fmtPct18(v(raw[6], raw[7])), v(raw[6], raw[7])),
    floor: withRaw(fmtRaw(v(raw[8], raw[9])), v(raw[8], raw[9])),
    scale: withRaw(fmtRaw(v(raw[10], raw[11])), v(raw[10], raw[11])),
    isLegacy: v(raw[12], "0x0") > 0n ? "Yes" : "No",
    lastUpdated: withRaw(fmtTimestamp(BigInt(raw[13])), BigInt(raw[13])),
    lastRateAccumulator: withRaw(fmtScaled(v(raw[14], raw[15])), v(raw[14], raw[15])),
    lastFullUtilizationRate: withRaw(fmtRateApr(v(raw[16], raw[17])), v(raw[16], raw[17])),
    feeRate: withRaw(fmtPct18(v(raw[18], raw[19])), v(raw[18], raw[19])),
    feeShares: withRaw(fmtScaled(v(raw[20], raw[21])), v(raw[20], raw[21])),
  };
}

function decodeIRConfig(raw: string[] | null): Partial<AssetParams> {
  if (!raw || raw.length < 16) return {};
  const v = (lo: string, hi: string) => decodeU256(lo, hi);
  return {
    minTargetUtilization: withRaw(fmtUtilPct(v(raw[0], raw[1])), v(raw[0], raw[1])),
    maxTargetUtilization: withRaw(fmtUtilPct(v(raw[2], raw[3])), v(raw[2], raw[3])),
    targetUtilization: withRaw(fmtUtilPct(v(raw[4], raw[5])), v(raw[4], raw[5])),
    minFullUtilizationRate: withRaw(fmtRateApr(v(raw[6], raw[7])), v(raw[6], raw[7])),
    maxFullUtilizationRate: withRaw(fmtRateApr(v(raw[8], raw[9])), v(raw[8], raw[9])),
    zeroUtilizationRate: withRaw(fmtRateApr(v(raw[10], raw[11])), v(raw[10], raw[11])),
    rateHalfLife: withRaw(fmtSeconds(v(raw[12], raw[13])), v(raw[12], raw[13])),
    targetRatePercent: withRaw(fmtPct18(v(raw[14], raw[15])), v(raw[14], raw[15])),
  };
}

function decodePairConfig(raw: string[] | null, debtDecimals: number): Omit<PairParams, "collateralSymbol" | "debtSymbol" | "collateralAddress" | "debtAddress"> | null {
  if (!raw || raw.length < 3) return null;
  return {
    maxLtv: withRaw(fmtPct18(BigInt(raw[0])), BigInt(raw[0])),
    liquidationFactor: withRaw(fmtPct18(BigInt(raw[1])), BigInt(raw[1])),
    debtCap: withRaw(fmtScaled(BigInt(raw[2]), debtDecimals), BigInt(raw[2])),
  };
}

const ASSET_COLUMNS: { key: keyof AssetParams; label: string }[] = [
  { key: "symbol", label: "Asset" },
  { key: "totalCollateralShares", label: "Total Collateral" },
  { key: "totalNominalDebt", label: "Total Debt" },
  { key: "reserve", label: "Reserve" },
  { key: "maxUtilization", label: "Max Util." },
  { key: "feeRate", label: "Fee Rate" },
  { key: "lastUpdated", label: "Last Updated" },
  { key: "lastRateAccumulator", label: "Rate Accum." },
  { key: "lastFullUtilizationRate", label: "Full Util. Rate" },
];

const IR_COLUMNS: { key: keyof AssetParams; label: string }[] = [
  { key: "symbol", label: "Asset" },
  { key: "minTargetUtilization", label: "Min Target Util." },
  { key: "maxTargetUtilization", label: "Max Target Util." },
  { key: "targetUtilization", label: "Target Util." },
  { key: "minFullUtilizationRate", label: "Min Full Util. Rate" },
  { key: "maxFullUtilizationRate", label: "Max Full Util. Rate" },
  { key: "zeroUtilizationRate", label: "Zero Util. Rate" },
  { key: "rateHalfLife", label: "Rate Half Life" },
  { key: "targetRatePercent", label: "Target Rate" },
];

const PAIR_COLUMNS: { key: string; label: string }[] = [
  { key: "pair", label: "Pair" },
  { key: "maxLtv", label: "Max LTV" },
  { key: "liquidationFactor", label: "Liq. Factor" },
  { key: "debtCap", label: "Debt Cap" },
];

// Pool list view
function PoolList({
  pools,
  onSelect,
}: {
  pools: Pool[];
  onSelect: (pool: Pool) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left p-3 font-medium text-gray-700">Pool Name</th>
            <th className="text-left p-3 font-medium text-gray-700">Address</th>
            <th className="text-right p-3 font-medium text-gray-700">Total Supplied</th>
            <th className="text-right p-3 font-medium text-gray-700">Total Borrowed</th>
            <th className="text-right p-3 font-medium text-gray-700">Assets</th>
          </tr>
        </thead>
        <tbody>
          {pools.map((pool, i) => {
            const totalSupplied = pool.assets.reduce(
              (sum, a) => sum + parseDecimal(a.stats.totalSupplied) * parseDecimal(a.usdPrice),
              0
            );
            const totalBorrowed = pool.assets.reduce(
              (sum, a) => sum + parseDecimal(a.stats.totalDebt) * parseDecimal(a.usdPrice),
              0
            );
            return (
              <tr
                key={pool.id}
                onClick={() => onSelect(pool)}
                className={`border-b border-gray-100 hover:bg-blue-50/50 cursor-pointer ${
                  i % 2 === 0 ? "bg-white" : "bg-gray-50"
                }`}
              >
                <td className="p-3 font-medium text-gray-900">{pool.name}</td>
                <td className="p-3">
                  <a
                    href={`https://voyager.online/contract/${pool.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-[#2C41F6] hover:text-[#1f2fdb] hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {shortenAddress(pool.id)}
                  </a>
                </td>
                <td className="text-right p-3 font-mono text-gray-700">
                  {formatUsd(totalSupplied)}
                </td>
                <td className="text-right p-3 font-mono text-gray-700">
                  {formatUsd(totalBorrowed)}
                </td>
                <td className="text-right p-3 text-gray-500">
                  {pool.assets.length}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Pool detail view
type Tab = "general" | "assets" | "interestRate" | "pairs";

function PoolDetail({
  pool,
  params,
  loading,
  onBack,
}: {
  pool: Pool;
  params: PoolParamsData | null;
  loading: boolean;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>("general");
  const [unscaled, setUnscaled] = useState(false);

  const tabs: { key: Tab; label: string }[] = [
    { key: "general", label: "General" },
    { key: "assets", label: "Assets" },
    { key: "interestRate", label: "Interest Rate" },
    { key: "pairs", label: "Pairs" },
  ];

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 px-4 py-2 text-sm rounded-md bg-[#2C41F6] text-white hover:bg-[#1f2fdb] transition-colors"
      >
        &larr; Back to Pools
      </button>

      <h3 className="text-lg font-semibold text-gray-900 mb-1">{pool.name}</h3>
      <p className="text-sm text-gray-500 mb-4">
        <a
          href={`https://voyager.online/contract/${pool.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[#2C41F6] hover:underline"
        >
          {pool.id}
        </a>
      </p>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? "text-gray-900 border-gray-800"
                : "text-gray-400 border-transparent hover:text-gray-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!loading && params && tab !== "general" && (
        <div className="flex items-center mb-4">
          <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={unscaled}
              onChange={(e) => setUnscaled(e.target.checked)}
              className="rounded border-gray-300 bg-gray-100 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            Show unscaled values
          </label>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 text-gray-500 py-8">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading on-chain parameters...
        </div>
      )}

      {!loading && params && tab === "general" && (
        <GeneralTab data={params.general} />
      )}
      {!loading && params && tab === "assets" && (
        <ParamsTable columns={ASSET_COLUMNS} rows={params.assets} poolAddress={pool.id} entrypoint="asset_config" unscaled={unscaled} />
      )}
      {!loading && params && tab === "interestRate" && (
        <ParamsTable columns={IR_COLUMNS} rows={params.assets} poolAddress={pool.id} entrypoint="interest_rate_config" unscaled={unscaled} />
      )}
      {!loading && params && tab === "pairs" && (
        <PairsTable pairs={params.pairs} poolAddress={pool.id} unscaled={unscaled} />
      )}
    </div>
  );
}

function GeneralTab({ data }: { data: Record<string, string | null> }) {
  return (
    <div className="space-y-2">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="grid grid-cols-[200px_1fr] gap-5 p-3 bg-gray-50 rounded-md">
          <span className="text-sm font-medium text-gray-500">{formatLabel(key)}</span>
          <span className="text-sm text-gray-900 font-mono">
            {value && isAddress(value) ? (
              <a
                href={`https://voyager.online/contract/${value}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#2C41F6] hover:underline"
              >
                {value}
              </a>
            ) : (
              value ?? "-"
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

const SENDER = "0x048f24d0d0618fa31813db91a45d8be6c50749e5e19ec699092ce29abe809294";
const SELECTORS: Record<string, string> = {
  asset_config: "0x40a1db21c93dd4b0a09e752c7b8cc7db2b84275621c8d2941edd851a22b56f",
  interest_rate_config: "0x3445eeebf08ef8f8e08e1f00ff9a3dfc7bee1ce543734f5bc93d18b7a29ddd8",
  pair_config: "0x171c2fae45c0df09f8253d0a3bdf9756051f8fa442f4349827736d3e3135c06",
};

function walnutUrl(poolAddress: string, entrypoint: string, args: string[]): string {
  const selector = SELECTORS[entrypoint] ?? "0x0";
  const calldata = ["0x1", poolAddress, selector, `0x${args.length.toString(16)}`, ...args].join(",");
  const encoded = encodeURIComponent(calldata);
  return `https://app.walnut.dev/simulations?senderAddress=${SENDER}&calldata=${encoded}&transactionVersion=3&chainId=SN_MAINNET`;
}

function WalnutLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Simulate on Walnut"
      className="inline-block ml-1.5 text-gray-400 hover:text-[#2C41F6] transition-colors"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-3M9 1h6m0 0v6m0-6L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </a>
  );
}

function ParamsTable({
  columns,
  rows,
  poolAddress,
  entrypoint,
  unscaled,
}: {
  columns: { key: string; label: string }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
  poolAddress: string;
  entrypoint: string;
  unscaled: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`p-3 font-medium text-gray-700 whitespace-nowrap ${
                  col.key === "symbol" ? "text-left" : "text-right"
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.symbol ?? i}
              className={`border-b border-gray-100 ${
                i % 2 === 0 ? "bg-white" : "bg-gray-50"
              }`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`p-3 font-mono text-gray-700 whitespace-nowrap ${
                    col.key === "symbol" ? "text-left font-medium font-sans" : "text-right"
                  }`}
                >
                  {col.key === "symbol" ? (
                    <span className="flex items-center">
                      {row[col.key]}
                      <WalnutLink href={walnutUrl(poolAddress, entrypoint, [row.address])} />
                    </span>
                  ) : (
                    getDisplay(row[col.key], unscaled)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PairsTable({ pairs, poolAddress, unscaled }: { pairs: PairParams[]; poolAddress: string; unscaled: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {PAIR_COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`p-3 font-medium text-gray-700 whitespace-nowrap ${
                  col.key === "pair" ? "text-left" : "text-right"
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pairs.map((pair, i) => (
            <tr
              key={`${pair.collateralSymbol}-${pair.debtSymbol}`}
              className={`border-b border-gray-100 ${
                i % 2 === 0 ? "bg-white" : "bg-gray-50"
              }`}
            >
              <td className="p-3 font-medium text-gray-700">
                <span className="flex items-center">
                  {pair.collateralSymbol} / {pair.debtSymbol}
                  <WalnutLink href={walnutUrl(poolAddress, "pair_config", [pair.collateralAddress, pair.debtAddress])} />
                </span>
              </td>
              <td className="p-3 font-mono text-gray-700 text-right">{getDisplay(pair.maxLtv, unscaled)}</td>
              <td className="p-3 font-mono text-gray-700 text-right">{getDisplay(pair.liquidationFactor, unscaled)}</td>
              <td className="p-3 font-mono text-gray-700 text-right">{getDisplay(pair.debtCap, unscaled)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PoolsPage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [poolParams, setPoolParams] = useState<PoolParamsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paramsLoading, setParamsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pools")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        const allPools: Pool[] = json.data;
        const filtered = allPools
          .filter((p) => p.protocolVersion === "v2" && !p.isDeprecated)
          .sort((a, b) => {
            const tvlA = a.assets.reduce(
              (s, asset) =>
                s + parseDecimal(asset.stats.totalSupplied) * parseDecimal(asset.usdPrice),
              0
            );
            const tvlB = b.assets.reduce(
              (s, asset) =>
                s + parseDecimal(asset.stats.totalSupplied) * parseDecimal(asset.usdPrice),
              0
            );
            return tvlB - tvlA;
          });
        setPools(filtered);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const selectPool = useCallback((pool: Pool) => {
    setSelectedPool(pool);
    setPoolParams(null);
    setParamsLoading(true);
    setError(null);

    fetch(`/api/pool-params?poolId=${pool.id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        const raw = json.data;

        // Decode assets
        const assets: AssetParams[] = raw.assets.map(
          (a: { symbol: string; address: string; decimals: number; assetConfig: string[] | null; interestRateConfig: string[] | null }) => ({
            symbol: a.symbol,
            address: a.address,
            ...decodeAssetConfig(a.assetConfig, a.decimals),
            ...decodeIRConfig(a.interestRateConfig),
          })
        );

        // Build decimals lookup from assets
        const decimalsMap = new Map<string, number>();
        for (const a of raw.assets) {
          decimalsMap.set(a.address, a.decimals);
        }

        // Decode pairs
        const pairs: PairParams[] = raw.pairs.map(
          (p: { collateralSymbol: string; debtSymbol: string; collateralAddress: string; debtAddress: string; config: string[] | null }) => ({
            collateralSymbol: p.collateralSymbol,
            debtSymbol: p.debtSymbol,
            collateralAddress: p.collateralAddress,
            debtAddress: p.debtAddress,
            ...decodePairConfig(p.config, decimalsMap.get(p.debtAddress) ?? 18),
          })
        );

        setPoolParams({ general: raw.general, assets, pairs });
      })
      .catch((err) => setError(err.message))
      .finally(() => setParamsLoading(false));
  }, []);

  return (
    <div className="p-8">
      <div className="max-w-[1400px] mx-auto">
        {!selectedPool && (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-1">Pool Parameters</h2>
              <p className="text-gray-500 text-sm">
                On-chain risk parameters for Vesu v2 lending pools
                {!loading && (
                  <span className="text-gray-400">
                    {" "}&middot; {pools.length} pools
                  </span>
                )}
              </p>
            </div>

            {loading && (
              <div className="flex items-center gap-3 text-gray-500">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading pools...
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-300 rounded-lg p-4 text-red-700">
                Error: {error}
              </div>
            )}

            {!loading && !error && <PoolList pools={pools} onSelect={selectPool} />}
          </>
        )}

        {selectedPool && (
          <>
            {error && (
              <div className="bg-red-50 border border-red-300 rounded-lg p-4 text-red-700 mb-4">
                Error: {error}
              </div>
            )}
            <PoolDetail
              pool={selectedPool}
              params={poolParams}
              loading={paramsLoading}
              onBack={() => {
                setSelectedPool(null);
                setPoolParams(null);
                setError(null);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
