import { Suspense } from "react";
import DashboardContent from "./DashboardContent";

export default function Page() {
    return (
        <Suspense fallback={<div>Loading dashboard...</div>}>
            <DashboardContent />
        </Suspense>
    );
}
