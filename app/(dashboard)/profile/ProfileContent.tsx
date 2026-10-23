import { CircleUser } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

const ProfileContent = () => {
    return (
        <ComingSoon
            icon={CircleUser}
            title="Profile"
            description="Personal details and sign-in methods are being wired up."
            highlights={[
                "Display name, avatar and timezone",
                "Connected sign-in methods (Google, GitHub, email)",
                "Sessions and active devices",
            ]}
        />
    );
};
export default ProfileContent;
