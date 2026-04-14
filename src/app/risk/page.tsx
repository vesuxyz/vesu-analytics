"use client";

import { useEffect, useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface DecimalValue {
  value: string;
  decimals: number;
}

interface Position {
  id: string;
  type: string;
  pool: { id: string; name: string };
  walletAddress: string;
  ltv: { max: DecimalValue; current: DecimalValue };
  healthFactor: DecimalValue | null;
  collateral: {
    symbol: string;
    address: string;
    decimals: number;
    value: string;
    usdPrice: DecimalValue;
  };
  debt: {
    symbol: string;
    address: string;
    decimals: number;
    value: string;
    usdPrice: DecimalValue;
  };
}

interface RiskBucket {
  dropPct: number;
  positionsAtRisk: number;
  debtAtRiskUsd: number;
}

interface PairBreakdown {
  pair: string;
  buckets: RiskBucket[];
}

interface LiquidityPoint {
  sellUsd: number;
  priceImpact: number;
}

interface TokenLiquidity {
  symbol: string;
  points: LiquidityPoint[];
}

const PRICE_DROPS = [1, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80];

const STABLE_GROUPS: string[][] = [
  ["USDC", "USDC.e", "USDT", "sUSN", "rUSDC-stark", "mRe7YIELD"],
  ["ETH", "wstETH"],
  ["WBTC", "LBTC", "SolvBTC", "tBTC", "mRe7BTC", "xWBTC", "xsBTC", "xtBTC", "xLBTC"],
  ["STRK", "sSTRK", "xSTRK"],
];

function getAssetGroup(symbol: string): number {
  for (let i = 0; i < STABLE_GROUPS.length; i++) {
    if (STABLE_GROUPS[i].includes(symbol)) return i;
  }
  return -1;
}

function isStablePair(collateralSymbol: string, debtSymbol: string): boolean {
  const cg = getAssetGroup(collateralSymbol);
  const dg = getAssetGroup(debtSymbol);
  return cg >= 0 && cg === dg;
}

function parseDecimal(val: DecimalValue): number {
  return Number(val.value) / 10 ** val.decimals;
}

function computeBuckets(positions: Position[]): RiskBucket[] {
  return PRICE_DROPS.map((dropPct) => {
    let positionsAtRisk = 0;
    let debtAtRiskUsd = 0;

    for (const p of positions) {
      const currentLTV = parseDecimal(p.ltv.current);
      const maxLTV = parseDecimal(p.ltv.max);
      if (currentLTV <= 0 || maxLTV <= 0) continue;

      const liquidationDrop = 100 * (1 - currentLTV / maxLTV);

      if (liquidationDrop <= dropPct) {
        positionsAtRisk++;
        debtAtRiskUsd += parseDecimal(p.debt.usdPrice);
      }
    }

    return { dropPct, positionsAtRisk, debtAtRiskUsd };
  });
}

function computeAggregate(
  positions: Position[],
  includeStable: boolean
): RiskBucket[] {
  let active = positions.filter(
    (p) => p.debt && Number(p.debt.value) > 0 && p.ltv?.max && p.ltv?.current
  );
  if (!includeStable) {
    active = active.filter(
      (p) => !isStablePair(p.collateral.symbol, p.debt.symbol)
    );
  }
  return computeBuckets(active);
}

function computeByPair(positions: Position[]): PairBreakdown[] {
  const active = positions.filter(
    (p) => p.debt && Number(p.debt.value) > 0 && p.ltv?.max && p.ltv?.current
  );

  const byPairMap = new Map<string, Position[]>();
  for (const p of active) {
    const key = `${p.collateral.symbol}/${p.debt.symbol}`;
    if (!byPairMap.has(key)) byPairMap.set(key, []);
    byPairMap.get(key)!.push(p);
  }

  return Array.from(byPairMap.entries())
    .map(([pair, positions]) => ({
      pair,
      buckets: computeBuckets(positions),
    }))
    .filter((c) => c.buckets.some((b) => b.debtAtRiskUsd > 0))
    .sort((a, b) => {
      const aStable = isStablePair(...a.pair.split("/") as [string, string]);
      const bStable = isStablePair(...b.pair.split("/") as [string, string]);
      if (aStable !== bStable) return aStable ? 1 : -1;

      const aDebt = Math.max(...a.buckets.map((b) => b.debtAtRiskUsd));
      const bDebt = Math.max(...b.buckets.map((b) => b.debtAtRiskUsd));
      return bDebt - aDebt;
    });
}

function formatUsd(value: number): string {
  if (value === 0) return "$0";
  if (value < 1000) return `$${value.toFixed(0)}`;
  if (value < 1_000_000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${(value / 1_000_000).toFixed(2)}M`;
}

function formatUsdAxis(value: number): string {
  if (value === 0) return "$0";
  if (value < 1000) return `$${value.toFixed(0)}`;
  if (value < 1_000_000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${(value / 1_000_000).toFixed(1)}M`;
}

function interpolateVolume(points: LiquidityPoint[], targetImpact: number): number {
  if (points.length === 0) return 0;
  if (targetImpact <= points[0].priceImpact) return points[0].sellUsd;
  if (targetImpact >= points[points.length - 1].priceImpact)
    return points[points.length - 1].sellUsd;

  for (let i = 1; i < points.length; i++) {
    if (targetImpact <= points[i].priceImpact) {
      const prev = points[i - 1];
      const next = points[i];
      const t =
        (targetImpact - prev.priceImpact) /
        (next.priceImpact - prev.priceImpact);
      return prev.sellUsd + t * (next.sellUsd - prev.sellUsd);
    }
  }
  return points[points.length - 1].sellUsd;
}

type RiskMetric = "debt" | "positions";

// Combined chart: debt/positions at risk + DEX liquidity on the same axes
function CombinedRiskChart({
  buckets,
  metric,
  liqData,
  title,
  color = "#ef4444",
}: {
  buckets: RiskBucket[];
  metric: RiskMetric;
  liqData?: TokenLiquidity | null;
  title?: string;
  color?: string;
}) {
  const isUsd = metric === "debt";

  const chartData = buckets.map((b) => {
    const row: Record<string, number | string> = {
      drop: `-${b.dropPct}%`,
      risk: isUsd ? b.debtAtRiskUsd : b.positionsAtRisk,
    };
    if (isUsd && liqData !== undefined) {
      row.liquidity = liqData ? interpolateVolume(liqData.points, b.dropPct) : 0;
    }
    return row;
  });

  const riskLabel = isUsd ? "Debt at Risk" : "Positions at Risk";
  const liqLabel = liqData ? `${liqData.symbol} Liquidity` : "Liquidity";
  const showLiq = isUsd && liqData !== undefined;

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h4 className="text-sm font-medium text-gray-700 mb-4">
        {title ?? "Aggregate"}
      </h4>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="drop"
            tick={{ fill: "#6b7280", fontSize: 12 }}
            axisLine={{ stroke: "#d1d5db" }}
            tickLine={{ stroke: "#d1d5db" }}
          />
          <YAxis
            tickFormatter={isUsd ? formatUsdAxis : undefined}
            tick={{ fill: "#6b7280", fontSize: 12 }}
            axisLine={{ stroke: "#d1d5db" }}
            tickLine={{ stroke: "#d1d5db" }}
            width={isUsd ? 70 : 50}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              fontSize: "13px",
            }}
            labelStyle={{ color: "#6b7280" }}
            formatter={(value, name) => [
              isUsd ? formatUsd(Number(value)) : String(value),
              name === "risk" ? riskLabel : liqLabel,
            ]}
          />
          <Legend
            formatter={(value) => (value === "risk" ? riskLabel : liqLabel)}
            wrapperStyle={{ fontSize: "12px" }}
          />
          <Area
            type="monotone"
            dataKey="risk"
            stroke={color}
            fill={color}
            fillOpacity={0.15}
            strokeWidth={2}
          />
          {showLiq && (
            <Area
              type="monotone"
              dataKey="liquidity"
              stroke="#22c55e"
              fill="#22c55e"
              fillOpacity={0.1}
              strokeWidth={2}
              strokeDasharray="5 3"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Aggregate liquidity chart with all tokens overlaid
function AggregateLiquidityChart({ data }: { data: TokenLiquidity[] }) {
  const chartData = PRICE_DROPS.map((dropPct) => {
    const row: Record<string, number | string> = {
      drop: `-${dropPct}%`,
    };
    for (const t of data) {
      row[t.symbol] = interpolateVolume(t.points, dropPct);
    }
    return row;
  });

  const TOKEN_COLORS: Record<string, string> = {
    ETH: "#627eea",
    WBTC: "#f7931a",
    STRK: "#ec796b",
  };

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h4 className="text-sm font-medium text-gray-700 mb-4">
        DEX Liquidity (sell volume at price impact)
      </h4>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="drop"
            tick={{ fill: "#6b7280", fontSize: 12 }}
            axisLine={{ stroke: "#d1d5db" }}
            tickLine={{ stroke: "#d1d5db" }}
          />
          <YAxis
            tickFormatter={formatUsdAxis}
            tick={{ fill: "#6b7280", fontSize: 12 }}
            axisLine={{ stroke: "#d1d5db" }}
            tickLine={{ stroke: "#d1d5db" }}
            width={70}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              fontSize: "13px",
            }}
            labelStyle={{ color: "#6b7280" }}
            labelFormatter={(label) => `Price impact: ${label}`}
            formatter={(value, name) => [formatUsd(Number(value)), String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: "12px" }} />
          {data.map((t) => (
            <Area
              key={t.symbol}
              type="monotone"
              dataKey={t.symbol}
              stroke={TOKEN_COLORS[t.symbol] ?? "#6b7280"}
              fill={TOKEN_COLORS[t.symbol] ?? "#6b7280"}
              fillOpacity={0.1}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const COLLATERAL_COLORS: Record<string, string> = {
  ETH: "#627eea",
  wstETH: "#00a3ff",
  STRK: "#ec796b",
  sSTRK: "#ec796b",
  xSTRK: "#ec796b",
  WBTC: "#f7931a",
  LBTC: "#f7931a",
  tBTC: "#f7931a",
  SolvBTC: "#f7931a",
  USDC: "#2775ca",
  "USDC.e": "#2775ca",
  USDT: "#26a17b",
  EKUBO: "#a855f7",
};

export default function RiskPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [liquidity, setLiquidity] = useState<TokenLiquidity[]>([]);
  const [includeStable, setIncludeStable] = useState(false);
  const [riskMetric, setRiskMetric] = useState<RiskMetric>("debt");
  const [assetFilter, setAssetFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/positions")
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((json) => setPositions(json.data)),
      fetch("/api/liquidity")
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((json) => setLiquidity(json.data))
        .catch(() => {}),
    ])
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const liquidityMap = new Map<string, TokenLiquidity>();
  for (const t of liquidity) {
    liquidityMap.set(t.symbol, t);
  }

  const assets = useMemo(() => {
    const s = new Set<string>();
    for (const p of positions) {
      if (p.collateral) s.add(p.collateral.symbol);
      if (p.debt) s.add(p.debt.symbol);
    }
    return Array.from(s).sort();
  }, [positions]);

  const filteredPositions = useMemo(() => {
    if (assetFilter === "all") return positions;
    return positions.filter(
      (p) =>
        p.collateral?.symbol === assetFilter || p.debt?.symbol === assetFilter
    );
  }, [positions, assetFilter]);

  const aggregate = loading ? [] : computeAggregate(filteredPositions, includeStable);
  const byPair = loading ? [] : computeByPair(filteredPositions);

  return (
    <div className="p-8">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold mb-1">Risk Analysis</h2>
            <p className="text-gray-500 text-sm">
              Debt and positions at risk of liquidation for various collateral
              price drops
              {!loading && (
                <span className="text-gray-400">
                  {" "}&middot; {positions.length} positions analyzed
                </span>
              )}
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-3 text-gray-500">
            <svg
              className="animate-spin h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading positions...
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-4 text-red-700">
            Error: {error}
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-8">
            {/* Aggregate section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Aggregate
                </h3>
                <div className="flex items-center gap-4">
                  <select
                    value={assetFilter}
                    onChange={(e) => setAssetFilter(e.target.value)}
                    className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="all">All assets</option>
                    {assets.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setRiskMetric("debt")}
                      className={`px-3 py-1 text-xs rounded-md transition-colors ${
                        riskMetric === "debt"
                          ? "bg-[#2C41F6] text-white"
                          : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                      }`}
                    >
                      Debt at Risk
                    </button>
                    <button
                      onClick={() => setRiskMetric("positions")}
                      className={`px-3 py-1 text-xs rounded-md transition-colors ${
                        riskMetric === "positions"
                          ? "bg-[#2C41F6] text-white"
                          : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                      }`}
                    >
                      Positions at Risk
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeStable}
                      onChange={(e) => setIncludeStable(e.target.checked)}
                      className="rounded border-gray-300 bg-gray-100 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                    />
                    Include stable pairs
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <CombinedRiskChart
                  buckets={aggregate}
                  metric={riskMetric}
                />
                {liquidity.length > 0 ? (
                  <AggregateLiquidityChart data={liquidity} />
                ) : (
                  <div className="rounded-lg border border-gray-200 p-4 h-[284px] flex items-center justify-center text-gray-400 text-sm">
                    Loading liquidity data...
                  </div>
                )}
              </div>
            </div>

            {/* Per-pair charts in 2-column grid */}
            <div>
              <h3 className="text-lg font-medium mb-4 text-gray-900">
                By Lending Pair
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {byPair.map((c, i) => {
                  const [collateralSymbol, debtSymbol] = c.pair.split("/");
                  const stable = isStablePair(collateralSymbol, debtSymbol);
                  const prevStable =
                    i > 0 &&
                    isStablePair(
                      ...byPair[i - 1].pair.split("/") as [string, string]
                    );
                  const liqData = liquidityMap.get(collateralSymbol);
                  const pairColor = COLLATERAL_COLORS[collateralSymbol] ?? "#6b7280";

                  return (
                    <div key={c.pair} className={stable && !prevStable ? "col-span-full contents" : "contents"}>
                      {stable && !prevStable && (
                        <div className="col-span-full flex items-center gap-3 my-2">
                          <div className="h-px flex-1 bg-gray-200" />
                          <span className="text-xs text-gray-400 uppercase tracking-wider">
                            Stable Pairs
                          </span>
                          <div className="h-px flex-1 bg-gray-200" />
                        </div>
                      )}
                      <CombinedRiskChart
                        buckets={c.buckets}
                        metric={riskMetric}
                        liqData={liqData ?? null}
                        title={c.pair}
                        color={pairColor}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
