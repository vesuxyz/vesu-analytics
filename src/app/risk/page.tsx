"use client";

import { useEffect, useState, useMemo } from "react";
import { useCachedFetch } from "@/lib/data-cache";
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

interface TokenLiquidity {
  symbol: string;
  liq5: number;
  liq10: number;
}

const PRICE_DROPS = [1, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100];

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

type RiskMetric = "debt" | "positions";

// Combined chart: debt/positions at risk + liquidity lines at 5% and 10% impact
function CombinedRiskChart({
  buckets,
  metric,
  liqData,
  liqLoading,
  title,
}: {
  buckets: RiskBucket[];
  metric: RiskMetric;
  liqData?: TokenLiquidity | null;
  liqLoading?: boolean;
  title?: string;
}) {
  const isUsd = metric === "debt";

  const showLiq = isUsd && liqData !== undefined && liqData !== null;
  const liq5 = liqData?.liq5 ?? 0;
  const liq10 = liqData?.liq10 ?? 0;
  const liqSymbol = liqData?.symbol ?? "";

  const liq5Label = `${liqSymbol} liq @5%`;
  const liq10Label = `${liqSymbol} liq @10%`;

  const chartData = buckets.map((b) => {
    const row: Record<string, number | string> = {
      drop: `-${b.dropPct}%`,
      risk: isUsd ? b.debtAtRiskUsd : b.positionsAtRisk,
    };
    if (showLiq) {
      row[liq5Label] = liq5;
      row[liq10Label] = liq10;
    }
    return row;
  });

  const riskLabel = isUsd ? "Debt at Risk" : "Positions at Risk";

  return (
    <div className="rounded-lg border border-gray-200 p-4 relative">
      <h4 className="text-sm font-medium text-gray-700 mb-4">
        {title ?? "Aggregate"}
      </h4>
      {liqLoading && isUsd && (
        <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 rounded-lg">
          <svg className="animate-spin h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}
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
            formatter={(value) => [
              isUsd ? formatUsd(Number(value)) : String(value),
            ]}
          />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
          <Area
            type="monotone"
            dataKey="risk"
            name={riskLabel}
            stroke="#ef4444"
            fill="#ef4444"
            fillOpacity={0.15}
            strokeWidth={2}
          />
          {showLiq && (
            <Area
              type="monotone"
              dataKey={liq5Label}
              stroke="#22c55e"
              fill="none"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
            />
          )}
          {showLiq && (
            <Area
              type="monotone"
              dataKey={liq10Label}
              stroke="#0ea5e9"
              fill="none"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const VISIBLE_LIQ_ROWS = 6;

function LiquidityTable({ rows, compact }: { rows: TokenLiquidity[]; compact?: boolean }) {
  const display = compact ? rows.slice(0, VISIBLE_LIQ_ROWS) : rows;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-gray-50 border-b border-gray-200">
          <th className="text-left p-2 font-medium text-gray-700">Asset</th>
          <th className="text-right p-2 font-medium text-gray-700">Liq. @5%</th>
          <th className="text-right p-2 font-medium text-gray-700">Liq. @10%</th>
        </tr>
      </thead>
      <tbody>
        {display.map((t, i) => (
          <tr key={t.symbol} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
            <td className="p-2 font-medium text-gray-900 text-sm">{t.symbol}</td>
            <td className="p-2 text-right font-mono text-gray-700 text-sm">{formatUsd(t.liq5)}</td>
            <td className="p-2 text-right font-mono text-gray-700 text-sm">{formatUsd(t.liq10)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AggregateLiquidityTable({ data }: { data: TokenLiquidity[] }) {
  const [showModal, setShowModal] = useState(false);
  const sorted = [...data].filter((t) => t.liq5 > 0 || t.liq10 > 0).sort((a, b) => b.liq10 - a.liq10);

  return (
    <>
      <div className="rounded-lg border border-gray-200 overflow-hidden flex flex-col">
        <h4 className="text-sm font-medium text-gray-700 px-3 py-2 bg-gray-50 border-b border-gray-200">
          DEX Liquidity by Asset
        </h4>
        <LiquidityTable rows={sorted} compact />
        {sorted.length > VISIBLE_LIQ_ROWS && (
          <button
            onClick={() => setShowModal(true)}
            className="text-xs text-[#2C41F6] hover:text-[#1f2fdb] py-2 border-t border-gray-100"
          >
            Show all {sorted.length} assets
          </button>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-lg border border-gray-200 shadow-lg max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h4 className="text-sm font-semibold text-gray-900">DEX Liquidity by Asset</h4>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
            </div>
            <div className="overflow-y-auto">
              <LiquidityTable rows={sorted} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function RiskPage() {
  const { data: positions, loading, error } = useCachedFetch<Position[]>("positions", "/api/positions");
  const { data: liquidityData, loading: liqLoading } = useCachedFetch<TokenLiquidity[]>("liquidity", "/api/liquidity");
  const liquidity = liquidityData ?? [];
  const [includeStable, setIncludeStable] = useState(false);
  const [riskMetric, setRiskMetric] = useState<RiskMetric>("debt");
  const [assetFilter, setAssetFilter] = useState("all");

  const liquidityMap = new Map<string, TokenLiquidity>();
  for (const t of liquidity) {
    liquidityMap.set(t.symbol, t);
  }

  const positionsList = positions ?? [];

  const assets = useMemo(() => {
    const s = new Set<string>();
    for (const p of positionsList) {
      if (p.collateral) s.add(p.collateral.symbol);
      if (p.debt) s.add(p.debt.symbol);
    }
    return Array.from(s).sort();
  }, [positionsList]);

  const filteredPositions = useMemo(() => {
    if (assetFilter === "all") return positionsList;
    return positionsList.filter(
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
                  {" "}&middot; {positionsList.length} positions analyzed
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
                  <AggregateLiquidityTable data={liquidity} />
                ) : liqLoading ? (
                  <div className="rounded-lg border border-gray-200 p-4 h-[284px] flex flex-col items-center justify-center gap-3 text-gray-400 text-sm">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading DEX liquidity data...
                  </div>
                ) : null}
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
                        liqLoading={liqLoading}
                        title={c.pair}
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
