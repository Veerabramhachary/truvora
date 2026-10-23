import { Plug } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function SelectProviderContent() {
    return (
        <ComingSoon
            icon={Plug}
            title="Choose a provider"
            description="Connecting a payment provider isn't available yet. Truvora will ship with Razorpay first, with room for a second gateway later."
            highlights={[
                "Guided provider setup with test-mode keys",
                "Plan mapping between Truvora and your gateway",
                "Webhook health checks and connection status",
            ]}
        />
    );
}
