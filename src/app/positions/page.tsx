"use client";

import { useEffect, useState, useMemo, useCallback } from "react";

interface DecimalValue {
  value: string;
  decimals: number;
}

interface RawPosition {
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

interface PositionRow {
  id: string;
  pool: string;
  poolId: string;
  type: string;
  wallet: string;
  collateralSymbol: string;
  debtSymbol: string;
  collateralAmount: string;
  collateralUsd: number;
  collateralUsdFmt: string;
  debtAmount: string;
  debtUsd: number;
  debtUsdFmt: string;
  healthFactor: string;
  healthFactorNum: number;
}

type SortKey =
  | "pool"
  | "pair"
  | "type"
  | "collateralUsd"
  | "debtUsd"
  | "healthFactor";
type SortDir = "asc" | "desc";

function parseDecimal(val: DecimalValue): number {
  return Number(val.value) / 10 ** val.decimals;
}

function formatAmount(value: string, decimals: number): string {
  if (!value || value === "0") return "0";
  const raw = BigInt(value);
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;
  const frac = remainder.toString().padStart(decimals, "0").slice(0, 4);
  return `${whole.toLocaleString("en-US")}.${frac}`;
}

function formatUsd(value: number): string {
  if (value === 0) return "$0";
  if (value < 1) return `$${value.toFixed(2)}`;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function shortenAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
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

export default function PositionsPage() {
  const [rows, setRows] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("collateralUsd");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    fetch("/api/positions")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        const positions: RawPosition[] = json.data;
        const mapped: PositionRow[] = positions.map((p) => {
          const collUsd = parseDecimal(p.collateral.usdPrice);
          const debtUsd = parseDecimal(p.debt.usdPrice);
          const hf = p.healthFactor ? parseDecimal(p.healthFactor) : null;

          return {
            id: p.id,
            pool: p.pool.name,
            poolId: p.pool.id,
            type: p.type,
            wallet: p.walletAddress,
            collateralSymbol: p.collateral.symbol,
            debtSymbol: p.debt.symbol,
            collateralAmount: formatAmount(p.collateral.value, p.collateral.decimals),
            collateralUsd: collUsd,
            collateralUsdFmt: formatUsd(collUsd),
            debtAmount: formatAmount(p.debt.value, p.debt.decimals),
            debtUsd: debtUsd,
            debtUsdFmt: formatUsd(debtUsd),
            healthFactor: hf !== null ? hf.toFixed(2) : "-",
            healthFactorNum: hf ?? Infinity,
          };
        });
        setRows(mapped);
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

  const types = useMemo(() => {
    const s = new Set(rows.map((r) => r.type));
    return Array.from(s).sort();
  }, [rows]);

  const sorted = useMemo(() => {
    const filtered =
      typeFilter === "all" ? [...rows] : rows.filter((r) => r.type === typeFilter);

    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "pool":
          cmp = a.pool.localeCompare(b.pool);
          break;
        case "pair":
          cmp = `${a.collateralSymbol}/${a.debtSymbol}`.localeCompare(
            `${b.collateralSymbol}/${b.debtSymbol}`
          );
          break;
        case "type":
          cmp = a.type.localeCompare(b.type);
          break;
        case "collateralUsd":
          cmp = a.collateralUsd - b.collateralUsd;
          break;
        case "debtUsd":
          cmp = a.debtUsd - b.debtUsd;
          break;
        case "healthFactor":
          cmp = a.healthFactorNum - b.healthFactorNum;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return filtered;
  }, [rows, typeFilter, sortKey, sortDir]);

  return (
    <div className="p-8">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold mb-1">Positions</h2>
            <p className="text-zinc-400 text-sm">
              All open borrow and multiply positions
              {!loading && (
                <span className="text-zinc-500">
                  {" "}&middot; {sorted.length} of {rows.length} positions
                </span>
              )}
            </p>
          </div>
          {types.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400">Type:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">All</option>
                {types.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {loading && (
          <div className="flex items-center gap-3 text-zinc-400">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading positions...
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
                  <th className="text-left p-3 font-medium text-zinc-300">User</th>
                  <SortHeader label="Type" sortKey="type" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortHeader label="Collateral (USD)" sortKey="collateralUsd" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Debt (USD)" sortKey="debtUsd" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Health Factor" sortKey="healthFactor" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`border-b border-zinc-800/50 hover:bg-zinc-900/50 ${
                      i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/20"
                    }`}
                  >
                    <td className="p-3 text-zinc-400 max-w-[180px] truncate">
                      {row.pool}
                    </td>
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
                    <td className="p-3 font-mono text-xs">
                      <a
                        href={`https://voyager.online/contract/${row.wallet}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 hover:underline"
                      >
                        {shortenAddress(row.wallet)}
                      </a>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          row.type === "multiply"
                            ? "bg-purple-900/40 text-purple-300"
                            : "bg-blue-900/40 text-blue-300"
                        }`}
                      >
                        {row.type}
                      </span>
                    </td>
                    <td className="text-right p-3 font-mono text-zinc-300">
                      <div>{row.collateralUsdFmt}</div>
                      <div className="text-xs text-zinc-500">
                        {row.collateralAmount} {row.collateralSymbol}
                      </div>
                    </td>
                    <td className="text-right p-3 font-mono text-zinc-300">
                      <div>{row.debtUsdFmt}</div>
                      <div className="text-xs text-zinc-500">
                        {row.debtAmount} {row.debtSymbol}
                      </div>
                    </td>
                    <td className="text-right p-3 font-mono">
                      <span
                        className={
                          row.healthFactor === "-"
                            ? "text-zinc-500"
                            : parseFloat(row.healthFactor) < 1.1
                            ? "text-red-400"
                            : parseFloat(row.healthFactor) < 1.5
                            ? "text-yellow-400"
                            : "text-green-400"
                        }
                      >
                        {row.healthFactor}
                      </span>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-zinc-500">
                      No positions found
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
