import { ModeToggle } from "./mode-toggle";

const SiteHeader = () => {
    return (
        <div className="flex flex-row justify-end items-center w-full px-2">
            <div className="flex flex-row items-center gap-4">
                <ModeToggle />
            </div>
        </div>
    );
};
export default SiteHeader;
