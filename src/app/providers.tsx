"use client";

import { DataCacheProvider } from "@/lib/data-cache";
import { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <DataCacheProvider>{children}</DataCacheProvider>;
}
