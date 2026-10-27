interface WelcomeEmailProps {
    firstName: string;
    dashboardUrl: string;
}

export function WelcomeEmail({ firstName, dashboardUrl }: WelcomeEmailProps) {
    return (
        <div style={{ fontFamily: "Arial, sans-serif", color: "#172033", lineHeight: 1.6 }}>
            <h1 style={{ color: "#172033" }}>Welcome to Truvora, {firstName}!</h1>
            <p>
                Your account is ready. Truvora helps you keep track of your
                expenses and recurring subscriptions in one private dashboard.
            </p>
            <p style={{ margin: "28px 0" }}>
                <a
                    href={dashboardUrl}
                    style={{
                        backgroundColor: "#4f46e5",
                        borderRadius: "8px",
                        color: "#ffffff",
                        padding: "12px 18px",
                        textDecoration: "none",
                    }}
                >
                    Open your dashboard
                </a>
            </p>
            <p>Thanks for choosing Truvora.</p>
        </div>
    );
}
