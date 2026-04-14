"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/positions", label: "Positions" },
  { href: "/debt", label: "Debt & Caps" },
  { href: "/risk", label: "Debt at Risk" },
  { href: "/pools", label: "Pools" },
  { href: "/holders", label: "Top Holders" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              active
                ? "bg-[#2C41F6] text-white"
                : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
