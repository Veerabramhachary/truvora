import { ChartNoAxesColumn } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

const ReportContent = () => {
    return (
        <ComingSoon
            icon={ChartNoAxesColumn}
            title="Reports & Insights"
            description="Recurring-charge analytics and long-run spending trends are being built."
            highlights={[
                "Monthly and yearly spend breakdowns by category",
                "Upcoming renewals and price-increase alerts",
                "Exportable reports for accounting or tax time",
            ]}
        />
    );
};
export default ReportContent;
