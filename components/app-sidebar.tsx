"use client"

import * as React from "react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { dashboardNavItems } from "@/components/dashboard-nav-items"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { useUser } from "@clerk/nextjs"

function SidebarSkeleton() {
  return (
    <div className="hidden w-(--sidebar-width) h-screen bg-sidebar animate-pulse p-4 flex-col gap-4 md:flex">
      <div className="h-8 w-32 bg-sidebar-accent rounded" /> {/* Header placeholder */}
      <div className="flex-1 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 w-full bg-sidebar-accent rounded" />
        ))}
      </div>
      <div className="h-12 w-full bg-sidebar-accent rounded" /> {/* Footer placeholder */}
    </div>
  );
}


export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isMobile } = useSidebar()
  const { user, isLoaded } = useUser()
  if (isMobile) return null
  if (!isLoaded) return <SidebarSkeleton />
  
  const userData = {
    name: user?.firstName?? "User",
    email: user?.primaryEmailAddress?.emailAddress?? "",
    avatar: user?.imageUrl ?? "",
  }
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        Truvora
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={dashboardNavItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
