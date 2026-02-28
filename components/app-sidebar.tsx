"use client";

import * as React from "react";
import { BarChart2, FileText, Home, Settings } from "lucide-react";

import { NavUser } from "@/components/nav-user";

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarRail,
} from "@/components/ui/sidebar";
import Link from "next/link";

const user = {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
};

// Simple nav items
const navItems = [
    { title: "Dashboard", url: "/app/dashboard", icon: Home },
    { title: "Transactions", url: "/app/transactions", icon: FileText },
    { title: "Reports", url: "/app/reports", icon: BarChart2 },
    { title: "Settings", url: "/app/settings", icon: Settings },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader></SidebarHeader>

            <SidebarContent className="flex flex-col gap-1">
                {navItems.map((item) => (
                    <Link
                        key={item.title}
                        href={item.url}
                        className="flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-200"
                    >
                        <item.icon className="w-5 h-5" />
                        <span>{item.title}</span>
                    </Link>
                ))}
            </SidebarContent>
            <SidebarFooter>
                <NavUser user={user} />
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    );
}
