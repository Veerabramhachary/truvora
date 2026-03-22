import { Bell, SearchIcon } from "lucide-react";
import { ModeToggle } from "./mode-toggle";

const SiteHeader = () => {
    return (
        <div className="flex flex-row justify-between items-center w-full px-2">
            <div className="flex flex-row gap-2 ">
                <SearchIcon />
                <div className="flex w-1/2">
                    <input
                        type="search"
                        placeholder="Search...."
                        className="search border-b outline-0 w-full"
                        name="search"
                    />
                </div>
            </div>
            <div className="flex flex-row items-center gap-4">
                <Bell/>
                <ModeToggle/>
            </div>
        </div>
    );
};
export default SiteHeader;
