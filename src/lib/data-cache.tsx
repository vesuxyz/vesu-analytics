"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";

interface CacheEntry<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  fetchedAt: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface DataCacheContextType {
  fetchCached: <T>(key: string, url: string) => CacheEntry<T>;
}

// Store cache on a module-level ref so it persists across page navigations
const cache = new Map<string, { data: unknown; fetchedAt: number }>();
const inflight = new Map<string, Promise<unknown>>();

const DataCacheContext = createContext<DataCacheContextType | null>(null);

export function DataCacheProvider({ children }: { children: ReactNode }) {
  const fetchCached = useCallback(<T,>(key: string, url: string): CacheEntry<T> => {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      return { data: cached.data as T, loading: false, error: null, fetchedAt: cached.fetchedAt };
    }
    return { data: (cached?.data as T) ?? null, loading: true, error: null, fetchedAt: 0 };
  }, []);

  return (
    <DataCacheContext.Provider value={{ fetchCached }}>
      {children}
    </DataCacheContext.Provider>
  );
}

export function useCachedFetch<T>(key: string, url: string): {
  data: T | null;
  loading: boolean;
  error: string | null;
} {
  const cached = cache.get(key);
  const isFresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL;

  const [data, setData] = useState<T | null>((cached?.data as T) ?? null);
  const [loading, setLoading] = useState(!isFresh);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isFresh) {
      setData(cached!.data as T);
      setLoading(false);
      return;
    }

    let cancelled = false;

    // Deduplicate inflight requests
    let promise = inflight.get(key);
    if (!promise) {
      promise = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((json) => {
          const result = json.data ?? json;
          cache.set(key, { data: result, fetchedAt: Date.now() });
          inflight.delete(key);
          return result;
        })
        .catch((err) => {
          inflight.delete(key);
          throw err;
        });
      inflight.set(key, promise);
    }

    promise
      .then((result) => {
        if (!cancelled) {
          setData(result as T);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [key, url, isFresh]);

  return { data, loading, error };
}
