import { Settings2 } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

const SettingsContent = () => {
    return (
        <ComingSoon
            icon={Settings2}
            title="Settings"
            description="Workspace preferences are on the way — currency, reminders and account controls in one place."
            highlights={[
                "Default currency, date format and week start",
                "Renewal reminder timing (1, 3 or 7 days ahead)",
                "Notification and email preferences",
                "Data export and account deletion",
            ]}
        />
    );
};
export default SettingsContent;
