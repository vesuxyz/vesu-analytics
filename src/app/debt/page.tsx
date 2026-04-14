"use client";

import { useEffect, useState, useMemo, useCallback } from "react";

interface DecimalValue {
  value: string;
  decimals: number;
}

interface Pair {
  collateralAssetAddress: string;
  debtAssetAddress: string;
  maxLTV: DecimalValue;
  debtCap: DecimalValue;
  totalDebt: DecimalValue;
  liquidationFactor: DecimalValue;
}

interface Asset {
  address: string;
  name: string;
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
  assets: Asset[];
  pairs: Pair[];
}

interface PairRow {
  poolId: string;
  poolName: string;
  collateralSymbol: string;
  debtSymbol: string;
  totalDebt: string;
  totalDebtUsdNum: number;
  totalDebtUsd: string;
  debtCap: string;
  debtCapNum: number;
  utilization: number;
  maxLTV: number;
}

type SortKey =
  | "pool"
  | "pair"
  | "totalDebtUsd"
  | "debtCap"
  | "utilization"
  | "maxLTV";
type SortDir = "asc" | "desc";

function formatDecimal(value: string, decimals: number, displayDecimals = 2): string {
  if (!value || value === "0") return "0";
  const raw = BigInt(value);
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;
  const frac = remainder.toString().padStart(decimals, "0").slice(0, displayDecimals);
  return `${whole.toLocaleString("en-US")}.${frac}`;
}

function formatUsdNum(num: number): string {
  if (num === 0) return "$0";
  if (num < 1) return `$${num.toFixed(2)}`;
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function parseDecimal(val: DecimalValue): number {
  return Number(val.value) / 10 ** val.decimals;
}

function SortHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className={`p-3 font-medium text-zinc-300 cursor-pointer select-none hover:text-zinc-100 ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      <span className="ml-1 text-xs">
        {active ? (currentDir === "asc" ? "\u25B2" : "\u25BC") : "\u25BC\u25B2"}
      </span>
    </th>
  );
}

export default function DebtPage() {
  const [rows, setRows] = useState<PairRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("totalDebtUsd");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Filters
  const [poolFilter, setPoolFilter] = useState("all");
  const [assetFilter, setAssetFilter] = useState("all");

  useEffect(() => {
    fetch("/api/pools")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        const pools: Pool[] = json.data;
        const result: PairRow[] = [];

        for (const pool of pools) {
          if (pool.isDeprecated) continue;

          const assetMap = new Map<string, Asset>();
          for (const a of pool.assets) {
            assetMap.set(a.address, a);
          }

          for (const pair of pool.pairs) {
            const collateral = assetMap.get(pair.collateralAssetAddress);
            const debtAsset = assetMap.get(pair.debtAssetAddress);
            if (!collateral || !debtAsset) continue;

            const totalDebtNum = parseDecimal(pair.totalDebt);
            const debtCapNum = parseDecimal(pair.debtCap);
            const utilPct =
              debtCapNum > 0 ? (totalDebtNum / debtCapNum) * 100 : 0;
            const debtUsdPrice = debtAsset.usdPrice
              ? parseDecimal(debtAsset.usdPrice)
              : 0;
            const totalDebtUsdNum = totalDebtNum * debtUsdPrice;

            result.push({
              poolId: pool.id,
              poolName: pool.name,
              collateralSymbol: collateral.symbol,
              debtSymbol: debtAsset.symbol,
              totalDebt: formatDecimal(pair.totalDebt.value, pair.totalDebt.decimals, 2),
              totalDebtUsdNum,
              totalDebtUsd: formatUsdNum(totalDebtUsdNum),
              debtCap: formatDecimal(pair.debtCap.value, pair.debtCap.decimals, 0),
              debtCapNum,
              utilization: utilPct,
              maxLTV: parseDecimal(pair.maxLTV) * 100,
            });
          }
        }

        setRows(result);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey]
  );

  const pools = useMemo(() => {
    const s = new Set(rows.map((r) => r.poolName));
    return Array.from(s).sort();
  }, [rows]);

  const assets = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      s.add(r.collateralSymbol);
      s.add(r.debtSymbol);
    }
    return Array.from(s).sort();
  }, [rows]);

  const sorted = useMemo(() => {
    let filtered = rows;

    if (poolFilter !== "all") {
      filtered = filtered.filter((r) => r.poolName === poolFilter);
    }
    if (assetFilter !== "all") {
      filtered = filtered.filter(
        (r) => r.collateralSymbol === assetFilter || r.debtSymbol === assetFilter
      );
    }

    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "pool":
          cmp = a.poolName.localeCompare(b.poolName);
          break;
        case "pair":
          cmp = `${a.collateralSymbol}/${a.debtSymbol}`.localeCompare(
            `${b.collateralSymbol}/${b.debtSymbol}`
          );
          break;
        case "totalDebtUsd":
          cmp = a.totalDebtUsdNum - b.totalDebtUsdNum;
          break;
        case "debtCap":
          cmp = a.debtCapNum - b.debtCapNum;
          break;
        case "utilization":
          cmp = a.utilization - b.utilization;
          break;
        case "maxLTV":
          cmp = a.maxLTV - b.maxLTV;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, poolFilter, assetFilter, sortKey, sortDir]);

  return (
    <div className="p-8">
      <div className="max-w-[1400px] mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold mb-1">Debt & Caps</h2>
          <p className="text-zinc-400 text-sm">
            Total debt and debt caps per lending pair across active Vesu pools
            {!loading && (
              <span className="text-zinc-500">
                {" "}&middot; {sorted.length} of {rows.length} pairs
              </span>
            )}
          </p>
        </div>

        {/* Filters */}
        {!loading && !error && (
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select
              value={poolFilter}
              onChange={(e) => setPoolFilter(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All pools</option>
              {pools.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={assetFilter}
              onChange={(e) => setAssetFilter(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All assets</option>
              {assets.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 text-zinc-400">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading pool data...
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 text-red-300">
            Error: {error}
          </div>
        )}

        {!loading && !error && (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-900 border-b border-zinc-800">
                  <SortHeader label="Pool" sortKey="pool" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Pair" sortKey="pair" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <th className="text-right p-3 font-medium text-zinc-300">Total Debt</th>
                  <SortHeader label="Debt (USD)" sortKey="totalDebtUsd" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Debt Cap" sortKey="debtCap" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Cap Usage" sortKey="utilization" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Max LTV" sortKey="maxLTV" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr
                    key={`${row.poolId}-${row.collateralSymbol}-${row.debtSymbol}`}
                    className={`border-b border-zinc-800/50 hover:bg-zinc-900/50 ${
                      i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/20"
                    }`}
                  >
                    <td className="p-3 text-zinc-400">{row.poolName}</td>
                    <td className="p-3">
                      <a
                        href={`https://vesu.xyz/lend/${row.poolId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        <span className="text-zinc-200">{row.collateralSymbol}</span>
                        <span className="text-zinc-500 mx-1">/</span>
                        <span className="text-zinc-300">{row.debtSymbol}</span>
                      </a>
                    </td>
                    <td className="text-right p-3 font-mono text-zinc-300">
                      {row.totalDebt}
                    </td>
                    <td className="text-right p-3 font-mono text-zinc-300">
                      {row.totalDebtUsd}
                    </td>
                    <td className="text-right p-3 font-mono text-zinc-400">
                      {row.debtCap}
                    </td>
                    <td className="text-right p-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              row.utilization > 90
                                ? "bg-red-500"
                                : row.utilization > 70
                                ? "bg-yellow-500"
                                : "bg-blue-500"
                            }`}
                            style={{ width: `${Math.min(row.utilization, 100)}%` }}
                          />
                        </div>
                        <span className="font-mono text-zinc-400 w-12 text-right">
                          {row.utilization.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="text-right p-3 font-mono text-zinc-400">
                      {row.maxLTV.toFixed(1)}%
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-zinc-500">
                      No active lending pairs found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
