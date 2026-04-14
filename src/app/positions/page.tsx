"use client";

import { useEffect, useState, useMemo, useCallback } from "react";

interface DecimalValue {
  value: string;
  decimals: number;
}

interface RawPosition {
  id: string;
  type: string;
  pool?: { id: string; name: string };
  walletAddress: string;
  ltv?: { max: DecimalValue; current: DecimalValue };
  healthFactor?: DecimalValue | null;
  collateral?: {
    symbol: string;
    address: string;
    decimals: number;
    value: string;
    usdPrice: DecimalValue;
  };
  debt?: {
    symbol: string;
    address: string;
    decimals: number;
    value: string;
    usdPrice: DecimalValue;
  };
  // earn positions
  collateralShares?: {
    symbol: string;
    decimals: number;
    value: string;
  };
  // vault positions
  shares?: {
    symbol: string;
    decimals: number;
    value: string;
  };
  assets?: {
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

function typeBadgeClass(type: string): string {
  switch (type) {
    case "multiply": return "bg-purple-900/40 text-purple-300";
    case "earn": return "bg-green-900/40 text-green-300";
    case "vault": return "bg-amber-900/40 text-amber-300";
    default: return "bg-blue-900/40 text-blue-300";
  }
}

function mapPosition(p: RawPosition): PositionRow {
  if (p.type === "vault") {
    const assetUsd = p.assets?.usdPrice ? parseDecimal(p.assets.usdPrice) : 0;
    return {
      id: p.id,
      pool: "-",
      poolId: "",
      type: p.type,
      wallet: p.walletAddress,
      collateralSymbol: p.assets?.symbol ?? "-",
      debtSymbol: "-",
      collateralAmount: p.assets ? formatAmount(p.assets.value, p.assets.decimals) : "0",
      collateralUsd: assetUsd,
      collateralUsdFmt: formatUsd(assetUsd),
      debtAmount: "-",
      debtUsd: 0,
      debtUsdFmt: "-",
      healthFactor: "-",
      healthFactorNum: Infinity,
    };
  }

  // borrow, multiply, earn — all have collateral
  const collUsd = p.collateral?.usdPrice ? parseDecimal(p.collateral.usdPrice) : 0;
  const debtUsd = p.debt?.usdPrice ? parseDecimal(p.debt.usdPrice) : 0;
  const hf = p.healthFactor ? parseDecimal(p.healthFactor) : null;

  return {
    id: p.id,
    pool: p.pool?.name ?? "-",
    poolId: p.pool?.id ?? "",
    type: p.type,
    wallet: p.walletAddress,
    collateralSymbol: p.collateral?.symbol ?? "-",
    debtSymbol: p.debt?.symbol ?? "-",
    collateralAmount: p.collateral ? formatAmount(p.collateral.value, p.collateral.decimals) : "0",
    collateralUsd: collUsd,
    collateralUsdFmt: formatUsd(collUsd),
    debtAmount: p.debt ? formatAmount(p.debt.value, p.debt.decimals) : "-",
    debtUsd: debtUsd,
    debtUsdFmt: debtUsd > 0 ? formatUsd(debtUsd) : "-",
    healthFactor: hf !== null ? hf.toFixed(2) : "-",
    healthFactorNum: hf ?? Infinity,
  };
}

export default function PositionsPage() {
  const [rows, setRows] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("collateralUsd");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Filters
  const [typeFilter, setTypeFilter] = useState("all");
  const [poolFilter, setPoolFilter] = useState("all");
  const [assetFilter, setAssetFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => {
    fetch("/api/positions")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        const positions: RawPosition[] = json.data;
        setRows(positions.map(mapPosition));
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

  const pools = useMemo(() => {
    const s = new Set(rows.map((r) => r.pool).filter((p) => p !== "-"));
    return Array.from(s).sort();
  }, [rows]);

  const assets = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (r.collateralSymbol !== "-") s.add(r.collateralSymbol);
      if (r.debtSymbol !== "-") s.add(r.debtSymbol);
    }
    return Array.from(s).sort();
  }, [rows]);

  const sorted = useMemo(() => {
    let filtered = rows;

    if (typeFilter !== "all") {
      filtered = filtered.filter((r) => r.type === typeFilter);
    }
    if (poolFilter !== "all") {
      filtered = filtered.filter((r) => r.pool === poolFilter);
    }
    if (assetFilter !== "all") {
      filtered = filtered.filter(
        (r) => r.collateralSymbol === assetFilter || r.debtSymbol === assetFilter
      );
    }
    if (userSearch) {
      const q = userSearch.toLowerCase();
      filtered = filtered.filter((r) => r.wallet.toLowerCase().includes(q));
    }

    const copy = [...filtered];
    copy.sort((a, b) => {
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

    return copy;
  }, [rows, typeFilter, poolFilter, assetFilter, userSearch, sortKey, sortDir]);

  return (
    <div className="p-8">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold mb-1">Positions</h2>
            <p className="text-zinc-400 text-sm">
              All open positions
              {!loading && (
                <span className="text-zinc-500">
                  {" "}&middot; {sorted.length} of {rows.length} positions
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Filters */}
        {!loading && !error && (
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All types</option>
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
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
            <input
              type="text"
              placeholder="Search user address..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
            />
          </div>
        )}

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
                    key={`${row.id}-${i}`}
                    className={`border-b border-zinc-800/50 hover:bg-zinc-900/50 ${
                      i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/20"
                    }`}
                  >
                    <td className="p-3 text-zinc-400 max-w-[180px] truncate">
                      {row.pool}
                    </td>
                    <td className="p-3">
                      {row.poolId ? (
                        <a
                          href={`https://vesu.xyz/lend/${row.poolId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          <span className="text-zinc-200">{row.collateralSymbol}</span>
                          {row.debtSymbol !== "-" && (
                            <>
                              <span className="text-zinc-500 mx-1">/</span>
                              <span className="text-zinc-300">{row.debtSymbol}</span>
                            </>
                          )}
                        </a>
                      ) : (
                        <span className="text-zinc-200">{row.collateralSymbol}</span>
                      )}
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
                        className={`px-2 py-0.5 rounded text-xs font-medium ${typeBadgeClass(row.type)}`}
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
                      {row.debtUsdFmt !== "-" ? (
                        <>
                          <div>{row.debtUsdFmt}</div>
                          <div className="text-xs text-zinc-500">
                            {row.debtAmount} {row.debtSymbol}
                          </div>
                        </>
                      ) : (
                        <span className="text-zinc-500">-</span>
                      )}
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
