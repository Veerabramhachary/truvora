"use client";

import { ChartAreaInteractive } from "@/components/ChartAreaInteractive";
import SectionCards from "@/components/SectionCards";

/*
  Deliberately not a <SidebarInset>: that component renders a <main> element,
  and app/(dashboard)/layout.tsx already wraps this in one. Nesting a second
  <main> is invalid HTML and doubled the inset padding.
*/
export default function DashboardContent() {
    return (
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
    );
}
