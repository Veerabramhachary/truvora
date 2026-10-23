"use client"

import * as React from "react"
import {

  BookOpen,
  ChartNoAxesColumn,
  HandCoins,
  History,
  HomeIcon,
  Settings2,
  
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useUser } from "@clerk/nextjs"


//This is sample data.
const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: HomeIcon,
    },
    {
      title: "Expenses",
      url: "/expenses",
      icon: HandCoins,
    },
    {
      title: "Subscriptions",
      url: "/subscriptions",
      icon: BookOpen,
    },
    {
      title: "Reports & Insights",
      url: "/reports",
      icon: ChartNoAxesColumn
    },
    {
      title: "Transactions",
      url: "/transactions",
      icon: History
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings2,
    },
  ],
}

function SidebarSkeleton() {
  return (
    <div className="w-(--sidebar-width) h-screen bg-sidebar animate-pulse p-4 flex flex-col gap-4">
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

  const {user, isLoaded} = useUser();
  if(!isLoaded) return <SidebarSkeleton />;
  
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
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
