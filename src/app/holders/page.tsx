"use client";

import { useEffect, useState, useCallback, useMemo } from "react";

interface BalancesResponse {
  holders: { address: string; label: string | null; balances: Record<string, string> }[];
  others: Record<string, string>;
  totalSupply: Record<string, string>;
  timestamp: string;
}

interface TokenProgress {
  status: "pending" | "scanning" | "done";
  events: number;
  holders: number;
  percent: number;
}

const TOKEN_ORDER = [
  "USDC",
  "USDT",
  "WBTC",
  "solvBTC",
  "tBTC",
  "LBTC",
  "ETH",
  "wstETH",
  "STRK",
];

type SortKey = "label" | typeof TOKEN_ORDER[number];
type SortDir = "asc" | "desc";

function shortenAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

function parseFormattedBalance(s: string): number {
  if (!s || s === "-" || s === "0") return 0;
  return parseFloat(s.replace(/,/g, ""));
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
      className={`p-3 font-medium text-zinc-300 cursor-pointer select-none hover:text-zinc-100 min-w-[130px] ${
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

export default function Home() {
  const [data, setData] = useState<BalancesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("STRK");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [labelFilter, setLabelFilter] = useState("all");
  const [tokenProgress, setTokenProgress] = useState<
    Record<string, TokenProgress>
  >(() => {
    const init: Record<string, TokenProgress> = {};
    for (const s of TOKEN_ORDER) {
      init[s] = { status: "pending", events: 0, holders: 0, percent: 0 };
    }
    return init;
  });
  const [balanceProgress, setBalanceProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setData(null);
    setBalanceProgress(null);
    setTokenProgress(() => {
      const init: Record<string, TokenProgress> = {};
      for (const s of TOKEN_ORDER) {
        init[s] = { status: "pending", events: 0, holders: 0, percent: 0 };
      }
      return init;
    });

    const evtSource = new EventSource("/api/balances");

    evtSource.onmessage = (e) => {
      const event = JSON.parse(e.data);

      if (event.type === "scanning") {
        const pct = event.latestBlock > 0
          ? Math.round((event.blockProgress / event.latestBlock) * 100)
          : 0;
        setTokenProgress((prev) => ({
          ...prev,
          [event.symbol]: {
            status: "scanning",
            events: event.events,
            holders: 0,
            percent: pct,
          },
        }));
      } else if (event.type === "scanned") {
        setTokenProgress((prev) => ({
          ...prev,
          [event.symbol]: {
            status: "done",
            events: event.events,
            holders: event.holders,
            percent: 100,
          },
        }));
      } else if (event.type === "querying_balances") {
        setBalanceProgress({ done: event.done, total: event.total });
      } else if (event.type === "done") {
        setData(event.data);
        setLoading(false);
        evtSource.close();
      } else if (event.type === "error") {
        setError(event.message);
        setLoading(false);
        evtSource.close();
      }
    };

    evtSource.onerror = () => {
      // EventSource fires onerror on close too — only treat as
      // error if the stream was genuinely lost (readyState CLOSED)
      if (evtSource.readyState === EventSource.CLOSED) {
        setError("Connection lost");
        setLoading(false);
      }
    };

    return () => evtSource.close();
  }, []);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

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

  const labelOptions = useMemo(() => {
    if (!data) return [];
    const s = new Set<string>();
    for (const h of data.holders) {
      if (h.label) s.add(h.label);
    }
    return Array.from(s).sort();
  }, [data]);

  const sortedHolders = useMemo(() => {
    if (!data) return [];
    let filtered = data.holders;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (h) =>
          h.address.toLowerCase().includes(q) ||
          (h.label && h.label.toLowerCase().includes(q))
      );
    }
    if (labelFilter !== "all") {
      filtered = filtered.filter((h) => h.label === labelFilter);
    }

    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "label") {
        cmp = (a.label ?? "").localeCompare(b.label ?? "");
      } else {
        cmp =
          parseFormattedBalance(a.balances[sortKey]) -
          parseFormattedBalance(b.balances[sortKey]);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [data, searchQuery, labelFilter, sortKey, sortDir]);

  const progressValues = Object.values(tokenProgress);
  const doneCount = progressValues.filter((t) => t.status === "done").length;
  const totalTokens = TOKEN_ORDER.length;
  const allScanned = doneCount === totalTokens;
  const avgScanPercent =
    progressValues.reduce((sum, t) => sum + t.percent, 0) / totalTokens;

  return (
    <div className="p-8">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold mb-1">Top Holders</h2>
            <p className="text-zinc-400 text-sm">
              Discovered by scanning on-chain Transfer events
              {data && (
                <span className="text-zinc-500">
                  {" "}
                  &middot; {new Date(data.timestamp).toLocaleString()}
                </span>
              )}
            </p>
          </div>
          {data && (
            <button
              onClick={load}
              disabled={loading}
              className="px-4 py-2 text-sm rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors disabled:opacity-50"
            >
              Refresh
            </button>
          )}
        </div>

        {/* Filters */}
        {data && (
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All labels</option>
              {labelOptions.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search address or label..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-64"
            />
            {(searchQuery || labelFilter !== "all") && (
              <span className="text-xs text-zinc-500">
                {sortedHolders.length} of {data.holders.length} holders
              </span>
            )}
          </div>
        )}

        {/* Progress panel */}
        {loading && (
          <div className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
            {/* Overall progress bar */}
            <div className="mb-4">
              <div className="flex justify-between text-sm text-zinc-400 mb-2">
                <span>
                  {allScanned
                    ? balanceProgress
                      ? "Querying balances..."
                      : "Finalizing..."
                    : `Scanning blocks... ${Math.round(avgScanPercent)}%`}
                </span>
                {balanceProgress && (
                  <span>
                    {balanceProgress.done}/{balanceProgress.total} calls
                  </span>
                )}
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      allScanned
                        ? balanceProgress
                          ? 70 +
                            (balanceProgress.done / balanceProgress.total) * 30
                          : 100
                        : (avgScanPercent / 100) * 70
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Per-token status */}
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
              {TOKEN_ORDER.map((symbol) => {
                const tp = tokenProgress[symbol];
                return (
                  <div
                    key={symbol}
                    className={`rounded-md border px-3 py-2 text-center text-xs transition-colors ${
                      tp.status === "done"
                        ? "border-green-800/50 bg-green-900/20 text-green-400"
                        : tp.status === "scanning"
                        ? "border-blue-800/50 bg-blue-900/20 text-blue-400"
                        : "border-zinc-800 bg-zinc-900/30 text-zinc-500"
                    }`}
                  >
                    <div className="font-medium mb-1">{symbol}</div>
                    {tp.status !== "pending" && (
                      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mb-1">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            tp.status === "done" ? "bg-green-500" : "bg-blue-500"
                          }`}
                          style={{ width: `${tp.percent}%` }}
                        />
                      </div>
                    )}
                    <div className="tabular-nums">
                      {tp.status === "pending" && "waiting"}
                      {tp.status === "scanning" && `${tp.percent}%`}
                      {tp.status === "done" &&
                        `${tp.events.toLocaleString()} events`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 text-red-300 mb-6">
            Error: {error}
          </div>
        )}

        {data && (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-900 border-b border-zinc-800">
                  <th className="text-left p-3 font-medium text-zinc-300 sticky left-0 bg-zinc-900 min-w-[50px]">
                    #
                  </th>
                  <SortHeader
                    label="Address"
                    sortKey="label"
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                  {TOKEN_ORDER.map((symbol) => (
                    <SortHeader
                      key={symbol}
                      label={symbol}
                      sortKey={symbol}
                      currentKey={sortKey}
                      currentDir={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedHolders.map((holder, i) => (
                  <tr
                    key={holder.address}
                    className={`border-b border-zinc-800/50 hover:bg-zinc-900/50 ${
                      i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/20"
                    }`}
                  >
                    <td className="p-3 sticky left-0 bg-inherit text-zinc-500">
                      {i + 1}
                    </td>
                    <td className="p-3">
                      {holder.label && (
                        <div className="text-zinc-200 text-xs font-medium mb-0.5">
                          {holder.label}
                        </div>
                      )}
                      <a
                        href={`https://voyager.online/contract/${holder.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline"
                      >
                        {shortenAddress(holder.address)}
                      </a>
                    </td>
                    {TOKEN_ORDER.map((symbol) => (
                      <td
                        key={symbol}
                        className="text-right p-3 font-mono text-zinc-300"
                      >
                        {holder.balances[symbol] ?? "-"}
                      </td>
                    ))}
                  </tr>
                ))}

                <tr className="border-b border-zinc-800 bg-zinc-900/40">
                  <td
                    className="p-3 sticky left-0 bg-zinc-900/40"
                    colSpan={2}
                  >
                    <span className="font-medium text-zinc-400 italic">
                      Others
                    </span>
                  </td>
                  {TOKEN_ORDER.map((symbol) => (
                    <td
                      key={symbol}
                      className="text-right p-3 font-mono text-zinc-400"
                    >
                      {data.others[symbol] ?? "-"}
                    </td>
                  ))}
                </tr>

                <tr className="bg-zinc-900 font-medium">
                  <td className="p-3 sticky left-0 bg-zinc-900" colSpan={2}>
                    <span className="text-zinc-200">Total Supply</span>
                  </td>
                  {TOKEN_ORDER.map((symbol) => (
                    <td
                      key={symbol}
                      className="text-right p-3 font-mono text-zinc-200"
                    >
                      {data.totalSupply[symbol] ?? "-"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
