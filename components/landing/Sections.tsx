import {
    ArrowRight,
    Bell,
    ChartArea,
    ChartNoAxesCombined,
    CircleCheck,
    FileDown,
    HandCoins,
    Lock,
    LucideShieldEllipsis,
    PlayCircle,
    WalletMinimal,
} from "lucide-react";
import Link from "next/link";

const Sections = () => {
    return (
        <>
            {/* hero sections */}
            <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden bg-white">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-200 h-100 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none -z-10"></div>
                <div className="max-w-6xl mx-auto px-6 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-xs font-medium mb-8 animate-fade-in-up text-black">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full rounded-full bg-indigo-400 opacity-70"></span>
                            <span className="relative inline-flex rounded-full h-2  w-2 bg-indigo-500"></span>
                        </span>
                        Introducing Truvora 1.0
                    </div>

                    <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-slate-900 mb-6 max-w-4xl mx-auto animate-fade-in-out delay-100 leading-tight">
                        Take Control of Subscriptions.{" "}
                        <span className="text-indigo-600">Privately</span>
                    </h1>

                    <p className="text-base md:text-lg text-slate-500 mb-10 max-w-2xl mx-auto animate-fade-in-up delay-200">
                        The most secure way to track expenses, manage recurring
                        payments, and optimize your budget — with data encrypted
                        both in transit and at rest for complete protection.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up delay-300">
                        <Link
                            href="/auth/login"
                            className="w-full sm:w-auto text-sm font-medium bg-indigo-600 text-white px-6 py-3 rounded-full hover:bg-indigo-700 transition-all shadow-sm flex items-center justify-center gap-2"
                        >
                            Get Started Free
                            <ArrowRight width={18} strokeWidth={1.5} />
                        </Link>
                        <Link
                            href="#"
                            className="w-full sm:w-auto text-sm font-medium bg-white text-slate-700 border border-slate-200 px-6 py-3 rounded-full hover:bg-slate-50 transition-all shadow-sm flex items-center justify-center gap-2"
                        >
                            <PlayCircle width={18} strokeWidth={1.5} />
                            View Demo
                        </Link>
                    </div>
                </div>
            </section>
            {/* How it Works Section */}
            <section
                id="how-it-works"
                className="py-24 bg-white border-y border-slate-100"
            >
                <div className="max-w-6xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-2xl md:text-3xl font-semiold tracking-tight text-slate-900 mb-4">
                            Simplicity at its core
                        </h2>
                        <p className="text-slate-500 max-w-xl mx-auto text-sm md:text-base">
                            We've removed the friction from managing your
                            digital life. Three simple steps to total financial
                            clarity.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8 relative">
                        {/* Connecting Line (Desktop)  */}
                        <div className="hidden md:block absolute top-12 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent"></div>

                        {/* Step 1 */}
                        <div className="relative flex flex-col items-center text-center">
                            <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-900 font-semibold mb-6 z-10 shadow-sm text-sm">
                                1
                            </div>
                            <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-2">
                                Add
                            </h3>
                            <p className="text-sm text-slate-500 leading-relaxed">
                                Manually add and manage your subscriptions with
                                just a few clicks. Your data stays secure and
                                encrypted.
                            </p>
                        </div>
                        {/* Step 2 */}
                        <div className="relative flex flex-col items-center text-center">
                            <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 font-semibold mb-6 z-10 shadow-sm text-sm">
                                2
                            </div>
                            <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-2">
                                Get Smart Insights
                            </h3>
                            <p className="text-sm text-slate-500 leading-relaxed">
                                Receive notifications before free trials end and
                                renewals hit. View clear charts of your spending
                                habits.
                            </p>
                        </div>
                        {/* Step 3 */}
                        <div className="relative flex flex-col items-center text-center">
                            <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-900 font-semibold mb-6 z-10 shadow-sm text-sm">
                                3
                            </div>
                            <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-2">
                                Optimize &amp; Save
                            </h3>
                            <p className="text-sm text-slate-500 leading-relaxed">
                                Identify unused services, track historical price
                                hikes, and take decisive action to lower your
                                monthly burn rate.
                            </p>
                        </div>
                    </div>
                </div>
            </section>
            {/* features Grid */}
            <section id="features" className="py-24 bg-slate-50">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="mb-16">
                        <h2 className="text-2xl md:text-3xl font-semibold mx-auto tracking-tight text-slate-900 mb-4 max-w-xl">
                            Everything you need. Nothing you don't.
                        </h2>
                        <p className="text-slate-500 max-w-xl mx-auto text-sm md:text-base">
                            Powerful tools designed with restraint. Built
                            specifically to protect your privacy while providing
                            deep financial insights.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Feature Card */}
                        <div className="hover:shadow-md   transition-shadow bg-white border-slate-200 border rounded-2xl pt-6 pr-6 pb-6 pl-6 shadow-sm">
                            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4">
                                <LucideShieldEllipsis
                                    width={20}
                                    strokeWidth={1.5}
                                />
                            </div>
                            <h3 className="text-base font-semibold text-slate-900 tracking-tight mb-2">
                                Security &amp; Encryption
                            </h3>
                            <p className="leading-relaxed text-sm text-slate-500">
                                Your financial data is encrypted in transit and
                                at rest. We follow strict security practices to
                                protect your data and do not sell or share it.
                            </p>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4">
                                <Bell width={20} strokeWidth={1.5} />
                            </div>
                            <h3 className="text-base font-semibold tracking-tight text-slate-900 mb-2">
                                Smart Reminders
                            </h3>
                            <p className="text-sm text-slate-500 leading-relaxed">
                                Customizable alerts before renewals. Never get
                                caught off guard by an auto-renewing yearly
                                subscription again.
                            </p>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4">
                                <ChartArea width={20} strokeWidth={1.5} />
                            </div>
                            <h3 className="text-base font-semibold tracking-tight text-slate-900 mb-2">
                                Advanced Analytics
                            </h3>
                            <p className="text-sm text-slate-500 leading-relaxed">
                                Visualize spending across categories over time.
                                Understand where your money goes with clean,
                                interactive charts.
                            </p>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4">
                                <ChartNoAxesCombined
                                    width={20}
                                    strokeWidth={1.5}
                                />
                            </div>
                            <h3 className="text-base font-semibold tracking-tight text-slate-900 mb-2">
                                Subscription History
                            </h3>
                            <p className="leading-relaxed text-sm text-slate-500">
                                Track price changes and historical billing. Know
                                exactly when a service increases their rates.
                            </p>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4">
                                <WalletMinimal width={20} strokeWidth={1.5} />
                            </div>
                            <h3 className="text-base font-semibold tracking-tight text-slate-900 mb-2">
                                Budget Management
                            </h3>
                            <p className="text-sm text-slate-500 leading-relaxed">
                                Set caps on SaaS or entertainment spending.
                                We'll warn you when you're approaching your
                                monthly limit.
                            </p>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4">
                                <FileDown width={20} strokeWidth={1.5} />
                            </div>
                            <h3 className="text-base font-semibold tracking-tight text-slate-900 mb-2">
                                Secure Export
                            </h3>
                            <p className="text-sm text-slate-500 leading-relaxed">
                                Easily export your data as CSV or PDF for
                                personal bookkeeping or tax preparation. Your
                                data is portable.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Why Choose Us Section */}
            <section className="py-24 bg-slate-900 text-white overflow-hidden relative">
                {/* Abstract Backround */}
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none"></div>

                <div className="max-w-6xl mx-auto px-6 relative z-10 flex flex-col lg:flex-row items-center gap-16">
                    <div className="lg:w-1/2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-slate-300 text-xs font-medium mb-6">
                            <Lock width="14" /> Privacy by Design
                        </div>
                        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-6">
                            You are the customer, not the product.
                        </h2>
                        <p className="text-slate-400 text-base mb-8 leading-relaxed">
                            Most financial apps are free because they analyze
                            and sell your transaction history to advertisers.
                            Truvora operates differently.
                            <br />
                            We charge a small, transparent subscription fee so
                            we never have to monetize your data. Your financial
                            records are encrypted both in transit and at rest,
                            ensuring that even our engineers cannot access them.
                        </p>
                        <ul className="space-y-4">
                            <li className="flex items-start gap-3 text-sm text-slate-300">
                                <CircleCheck
                                    width="20"
                                    className="text-indigo-400 shrink-0"
                                />
                                No data selling or sharing with third parties.
                            </li>
                            <li className="flex items-start gap-3 text-sm text-slate-300">
                                <CircleCheck
                                    width="20"
                                    className="text-indigo-400 shrink-0"
                                />
                                Clean, distraction-free interface (no ads or
                                cross-sells).
                            </li>
                            <li className="flex items-start gap-3 text-sm text-slate-300">
                                <HandCoins
                                    width="20"
                                    className="text-indigo-400 shrink-0"
                                />
                                Works globally with multi-currency support.
                            </li>
                        </ul>
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section id="pricing" className="py-24 bg-white">
                <div className="max-w-6xl mx-auto px-6"></div>
            </section>

            {/* CTA Sectuion */}
            <section className="py-24 bg-slate-50 border-slate-200">
                <div className="max-w-6xl mx-auto px-6 text-center">
                    <h2 className="text-3xl md:text-5xl font-semibold tracking-tight text-slate-900 mb-6">
                        Stop losing money to forgotten subscriptions.
                    </h2>
                    <p className="text-base text-slate-500 mb-10 max-w-2xl mx-auto">
                        Join thousands of privacy-conscious individuals taking
                        control of their recurring expenses today.
                    </p>
                    <a
                        href="#"
                        className="inline-flex items-center gap-2 text-sm font-medium bg-slate-900 text-white px-8 py-4 rounded-full hover:bg-slate-800 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                    >
                        Start Tracking for Free
                        <ArrowRight width={18} strokeWidth={1.5} />
                    </a>
                    <p className="mt-4 text-xs text-slate-400 font-medium">
                        No credit card required for the free plan.
                    </p>
                </div>
            </section>
            {/* Footer Section */}
            <footer className="bg-white border-t border-slate-200 py-12">
                <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-slate-900 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                        </div>
                        <span className="font-semibold text-sm tracking-tighter text-slate-900">
                            TRUVORA
                        </span>
                    </div>

                    <div className="flex gap-6 text-sm text-slate-500">
                        <Link
                            href="/privacy-policy"
                            className="hover:text-slate-900 transition-colors"
                        >
                            Privacy
                        </Link>
                        <Link
                            href="/terms"
                            className="hover:text-slate-900 transition-colors"
                        >
                            Terms
                        </Link>
                        <Link
                            href="#"
                            className="hover:text-slate-900 transition-colors"
                        >
                            Contact
                        </Link>
                        <Link
                            href="#"
                            className="hover:text-slate-900 transition-colors"
                        >
                            Twitter
                        </Link>
                    </div>

                    <div className="text-xs text-slate-400">
                        © 2026 Truvora Inc. All rights reserved.
                    </div>
                </div>
            </footer>
        </>
    );
};
export default Sections;
