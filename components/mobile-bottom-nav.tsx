"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { MoreHorizontal } from "lucide-react"

import { dashboardNavItems } from "@/components/dashboard-nav-items"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const primaryItems = dashboardNavItems.filter((item) =>
  ["/dashboard", "/expenses", "/reports", "/transactions"].includes(item.url)
)

const moreItems = dashboardNavItems.filter((item) =>
  ["/subscriptions", "/settings"].includes(item.url)
)

function isItemActive(pathname: string, url: string) {
  return pathname === url || pathname.startsWith(`${url}/`)
}

export function MobileBottomNav() {
  const pathname = usePathname()
  const moreIsActive = moreItems.some((item) => isItemActive(pathname, item.url))

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-20px_hsl(var(--foreground))] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5 px-2 pt-1.5">
        {primaryItems.map((item) => {
          const isActive = isItemActive(pathname, item.url)

          return (
            <li key={item.url}>
              <Link
                href={item.url}
                aria-label={item.title}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground active:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full transition-colors",
                    isActive && "bg-primary/10"
                  )}
                >
                  <item.icon aria-hidden="true" />
                </span>
                <span className="max-w-full truncate">{item.mobileTitle}</span>
              </Link>
            </li>
          )
        })}
        <li>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                aria-label="More navigation options"
                className={cn(
                  "group flex h-auto min-h-14 w-full flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium leading-none text-muted-foreground hover:bg-transparent hover:text-foreground",
                  moreIsActive && "text-primary"
                )}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full transition-colors",
                    moreIsActive && "bg-primary/10"
                  )}
                >
                  <MoreHorizontal aria-hidden="true" />
                </span>
                <span>More</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl px-4 pb-8">
              <SheetHeader className="text-left">
                <SheetTitle>More</SheetTitle>
                <SheetDescription>
                  Manage subscriptions and personalize your workspace.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {moreItems.map((item) => {
                  const isActive = isItemActive(pathname, item.url)

                  return (
                    <Link
                      key={item.url}
                      href={item.url}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border bg-card px-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isActive && "border-primary/30 bg-primary/5 text-primary"
                      )}
                    >
                      <item.icon aria-hidden="true" />
                      {item.title}
                    </Link>
                  )
                })}
              </div>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  )
}
