/**
 * Billing periods are calendar based, so month-end dates must not roll over.
 * `2026-01-31 + 1 month` is `2026-02-28`, not `2026-03-03`.
 *
 * Dates are treated as instants and adjusted in UTC so a server in any time
 * zone computes the same period.
 */
export function addBillingInterval(
    start: Date,
    interval: "month" | "year",
    count: number,
): Date {
    if (!Number.isInteger(count) || count < 1) {
        throw new Error("Billing interval count must be a positive integer");
    }

    const end = new Date(start.getTime());

    if (interval === "year") {
        const month = end.getUTCMonth();
        const day = end.getUTCDate();
        end.setUTCDate(1);
        end.setUTCFullYear(end.getUTCFullYear() + count);
        end.setUTCMonth(month);
        end.setUTCDate(
            Math.min(day, daysInUtcMonth(end.getUTCFullYear(), month)),
        );
        return end;
    }

    const day = end.getUTCDate();
    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + count);
    end.setUTCDate(
        Math.min(day, daysInUtcMonth(end.getUTCFullYear(), end.getUTCMonth())),
    );
    return end;
}

function daysInUtcMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
