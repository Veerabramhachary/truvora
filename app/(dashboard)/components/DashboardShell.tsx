"use client";

import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar";
import Providers from "./Providers";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import SiteHeader from "@/components/site-header";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

export default function DashboardShell({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div data-dashboard-root className="contents">
            <Providers>
                <SidebarProvider>
                    <AppSidebar />
                    <SidebarInset>
                        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 w-full">
                            <div className="flex items-center gap-2 px-4 w-full">
                                <SidebarTrigger className="-ml-1 hidden md:flex" />
                                <Separator
                                    orientation="vertical"
                                    className="mr-2 hidden data-[orientation=vertical]:h-4 md:block"
                                />
                                <SiteHeader />
                            </div>
                        </header>
                        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 pb-24 md:pb-4">
                            {children}
                        </div>
                    </SidebarInset>
                    <MobileBottomNav />
                </SidebarProvider>
            </Providers>
        </div>
    );
}
