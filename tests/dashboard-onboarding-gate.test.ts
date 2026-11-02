import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
    auth: vi.fn(),
    needsOnboarding: vi.fn(),
    redirect: vi.fn((to: string) => {
        throw new Error(`REDIRECT:${to}`);
    }),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/onboarding", () => ({ needsOnboarding: m.needsOnboarding }));
vi.mock("@/app/(dashboard)/components/DashboardShell", () => ({ default: () => null }));

import DashboardLayout from "@/app/(dashboard)/layout";

describe("dashboard layout onboarding gate", () => {
    beforeEach(() => {
        m.auth.mockReset().mockResolvedValue({ userId: "user_1" });
        m.needsOnboarding.mockReset();
        m.redirect.mockClear();
    });

    it("sends a user who has not finished the wizard to /onboarding", async () => {
        m.needsOnboarding.mockResolvedValue(true);
        await expect(DashboardLayout({ children: null })).rejects.toThrow("REDIRECT:/onboarding");
    });

    it("lets finished (and pre-existing) users through", async () => {
        m.needsOnboarding.mockResolvedValue(false);
        await expect(DashboardLayout({ children: null })).resolves.toBeTruthy();
        expect(m.redirect).not.toHaveBeenCalled();
    });

    it("does nothing for a signed-out request (the proxy handles those)", async () => {
        m.auth.mockResolvedValue({ userId: null });
        await expect(DashboardLayout({ children: null })).resolves.toBeTruthy();
        expect(m.needsOnboarding).not.toHaveBeenCalled();
    });
});
