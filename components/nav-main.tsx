"use client";

import { type LucideIcon } from "lucide-react";

import {
    SidebarGroup,
    // SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar";
import {Link} from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";

export function NavMain({
    items,
}: {
    items: {
        title: string;
        url: string;
        icon?: LucideIcon;
        isActive?: boolean;
    }[];
}) {
    const pathname = usePathname();
    return (
        <SidebarGroup>
            {/* <SidebarGroupLabel>Platform</SidebarGroupLabel> */}
            <SidebarMenu>
                {items.map((item) => {
                    const isCurrentlyActive =
                        pathname === item.url || item.isActive;

                    return (
                        <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton
                                asChild
                                tooltip={item.title}
                                isActive={isCurrentlyActive}
                            >
                                <Link href={item.url}>
                                    {item.icon && <item.icon />}
                                    <span>{item.title}</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    );
                })}
            </SidebarMenu>
        </SidebarGroup>
    );
}
