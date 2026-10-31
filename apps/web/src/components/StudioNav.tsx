"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
}

export function StudioNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="studio-nav" aria-label="ניווט ראשי">
      <ul>
        {items.map((item) => {
          const active = item.href === "/studio" ? pathname === "/studio" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
