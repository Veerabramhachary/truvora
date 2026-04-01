// email-template.tsx
interface SubscriptionItem {
    name: string;
    daysLeft: number;
    price?: string; // Optional: add if you have price data
}

interface EmailTemplateProps {
    userName: string;
    subscriptions: SubscriptionItem[];
}

export function EmailTemplate({ userName, subscriptions }: EmailTemplateProps) {
    return (
        <div className="font-sans">
            <div className="max-w-md mx-auto p-4">
                <h1 className="text-xl font-bold">Upcoming Renewals, {userName}!</h1>
                <p className="py-2">The following subscriptions are due soon:</p>
                
                <div className="space-y-3">
                    {subscriptions.map((sub, idx) => (
                        <div key={idx} className="p-3 border rounded-lg bg-slate-50">
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-indigo-600">{sub.name}</span>
                                <span className="text-sm px-2 py-1 bg-indigo-100 rounded">
                                    {sub.daysLeft} {sub.daysLeft === 1 ? "day" : "days"} left
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}