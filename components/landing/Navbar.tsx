import Link from "next/link"
import { SiteLogo } from "@/components/site-logo"

const Navbar = () => {
    return (
        <nav className="fixed top-0 left-0 right-0 z-50 glass-nav bg-transparent">
            <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                <SiteLogo className="text-slate-900" />
                <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-500">
                    <Link href={"#features"} className="hover:text-slate-900 transition-colors text-slate-500">Features</Link>
                    <Link href={"#how-it-works"} className="hover:text-slate-900 transition-colors text-slate-500">How it works</Link>
                    <Link href={"#pricing"} className="hover:text-slate-900 transition-colors text-slate-500">Pricing</Link>
                </div>
                <div className="flex items-center gap-4">
                    {/* auth don't have any loacale  */}
                    <Link href={"/auth/sign-in"} className="hidden md:block text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                        Login
                    </Link>
                    <Link href={"/dashboard"} className="text-sm font-medium bg-slate-900 text-white px-4 py-2 rounded-full hover:bg-slate-600 transition-all shadow-sm">
                        Get Started
                    </Link>
                </div>
            </div>
        </nav> 
    )
}
export default Navbar
