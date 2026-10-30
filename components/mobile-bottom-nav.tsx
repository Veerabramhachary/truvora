"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { dashboardNavItems } from "@/components/dashboard-nav-items"
import { cn } from "@/lib/utils"

export function MobileBottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-6">
        {dashboardNavItems.map((item) => {
          const isActive =
            pathname === item.url || pathname.startsWith(`${item.url}/`)

          return (
            <li key={item.url}>
              <Link
                href={item.url}
                aria-label={item.title}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 px-0.5 text-[10px] font-medium leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground active:text-foreground"
                )}
              >
                <item.icon aria-hidden="true" className="size-[18px] shrink-0" />
                <span className="max-w-full truncate">{item.mobileTitle}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
