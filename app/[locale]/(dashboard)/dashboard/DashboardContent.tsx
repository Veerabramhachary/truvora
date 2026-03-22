"use client";

import { ChartAreaInteractive } from "@/components/ChartAreaInteractive";
import SectionCards from "@/components/SectionCards";
import { SidebarInset } from "@/components/ui/sidebar";

export default function DashboardContent() {
    return (
        <SidebarInset>
            <div className="flex flex-1 flex-col">
                <div className="@container/main flex flex-1 flex-col gap-2">
                    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                        <div className="px-4 lg:px-6">
                            <SectionCards />
                        </div>
                        <div className="px-4 lg:px-6">
                            <ChartAreaInteractive />
                        </div>
                    </div>
                </div>
            </div>
        </SidebarInset>
    );
}
