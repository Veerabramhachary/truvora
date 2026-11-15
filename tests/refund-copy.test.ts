import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
    FULL_REFUND_WINDOW_DAYS,
    MAX_PAYMENT_AGE_DAYS,
    MIN_REFUND_PAISE,
    REFUND_COOLDOWN_DAYS,
} from "@/lib/refund-policy";

// The policy is code; the Terms, plan guide and checkout copy are what users
// actually read. If the numbers drift apart, one of them is lying.
const terms = readFileSync("app/(marketing)/terms/page.tsx", "utf8");
const planGuide = readFileSync("PLAN_GUIDE.md", "utf8");
const checkout = readFileSync(
    "app/(dashboard)/billing/checkout/[planId]/page.tsx",
    "utf8",
);
const razorpaySetup = readFileSync("RAZORPAY_SETUP.md", "utf8");
const envExample = readFileSync(".env.example", "utf8");

describe("refund copy matches the policy", () => {
    it("Terms state the same limits as the code", () => {
        expect(terms).toContain(`within ${FULL_REFUND_WINDOW_DAYS} days`);
        expect(terms).toContain(`previous ${REFUND_COOLDOWN_DAYS} days`);
        expect(terms).toContain(`about ${MAX_PAYMENT_AGE_DAYS}`);
        expect(terms).toContain(`below ₹${MIN_REFUND_PAISE / BigInt(100)}`);
        expect(terms).toContain("5&ndash;7 working days");
    });

    it("no page still tells users to contact support to cancel", () => {
        expect(terms).not.toMatch(
            /contact support for\s+cancellation or refund requests/i,
        );
        expect(planGuide).not.toMatch(
            /no automatic renewal,\s+cancellation, refund, or proration flow yet/i,
        );
    });

    it("checkout explains immediate cancellation instead of a missing flow", () => {
        expect(checkout).toContain("does not\n                            renew automatically");
        expect(checkout).toContain("refund policy is in the Terms");
    });

    it("the ops guide no longer lists the refund UI as unbuilt", () => {
        expect(razorpaySetup).not.toMatch(/Refund UI, cancellation/);
        expect(razorpaySetup).toContain("BILLING_REFUNDS_ENABLED");
    });

    it("shipping the feature does not switch it on", () => {
        expect(envExample).toContain('BILLING_REFUNDS_ENABLED="false"');
    });
});
