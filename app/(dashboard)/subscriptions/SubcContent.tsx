"use client";
import Header from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FeatureGate } from "@/lib/feature-gate";
import { useDelete, useList } from "@refinedev/core";
import { useRefreshAll } from "@/lib/use-refresh";
import { format, isValid } from "date-fns";
import { useEffect, useState } from "react";
import SubsForm, { type SubscriptionRecord } from "./SubsForm";
import { ConfirmDeleteDialog } from "@/components/confirm-delete";
import { toast } from "sonner";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCurrency } from "@/lib/currencies";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

const SubscContent = () => {
    const [open, setOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [subscriptionLimit, setSubscriptionLimit] = useState<number | null>(null);
    const [serverActiveCount, setServerActiveCount] = useState(0);
    const [editing, setEditing] = useState<SubscriptionRecord | null>(null);
    const [pendingDelete, setPendingDelete] =
        useState<SubscriptionRecord | null>(null);
    const { mutateAsync: deleteAsync } = useDelete();
    const refreshAll = useRefreshAll();

    const closeForm = () => {
        setOpen(false);
        setEditing(null);
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const response = await fetch("/api/export?type=subscriptions");
            if (!response.ok) {
                // Surface the server's reason instead of a console-only 404.
                throw response;
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "subscriptions.csv";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            const message =
                error instanceof Response
                    ? "Export isn't available yet."
                    : apiErrorMessage(error, "Could not export subscriptions.");
            toast.error(message);
        } finally {
            setExporting(false);
        }
    };

    const { query, result } = useList({
        resource: "subscriptions",
    });

    const { isLoading, isError } = query;
    // The data provider returns BaseRecord; assert the shape the API sends so
    // the cards below are typed.
    const data = (result?.data ?? []) as SubscriptionRecord[];
    const activeCardCount = data.filter((item) => item.active).length;

    useEffect(() => {
        let cancelled = false;
        fetch("/api/feature?feature=subscriptions", { cache: "no-store" })
            .then((response) => response.json())
            .then((payload: { limit?: number | null; usage?: number }) => {
                if (!cancelled && typeof payload.limit === "number") {
                    setSubscriptionLimit(payload.limit);
                }
                if (!cancelled && typeof payload.usage === "number") {
                    setServerActiveCount(payload.usage);
                }
            })
            .catch(() => {
                // FeatureGate still enforces the server-side limit if this
                // supplemental display request fails.
            });
        return () => {
            cancelled = true;
        };
    }, [activeCardCount]);

    const currentActiveCount = Math.max(activeCardCount, serverActiveCount);

    // 1. Consistent Loading State (Prevents CLS)
    if (isLoading) {
        return (
            <div className="p-10 flex items-center justify-center min-h-100">
                <p className="animate-pulse">Loading subscriptions...</p>
            </div>
        );
    }

    if (isError) {
        return (
            <div role="alert" className="p-10 text-destructive font-semibold">
                Error loading data. Please try again later.
            </div>
        );
    }

    return (
        <section className="w-full p-4 md:p-6">
            <Header
                src="/money.png"
                alt="Subscription Management"
                title="Subscriptions"
            >
                <div className="flex gap-2">
                    <FeatureGate feature="subscriptions" quantity={1}>
                        <Button
                            variant="secondary"
                            disabled={subscriptionLimit !== null && subscriptionLimit !== -1 && currentActiveCount >= subscriptionLimit}
                            title={subscriptionLimit !== null && subscriptionLimit !== -1 && currentActiveCount >= subscriptionLimit ? "Your active subscription limit has been reached." : undefined}
                            onClick={() => {
                                setEditing(null);
                                setOpen(true);
                            }}
                        >
                            Create
                        </Button>
                    </FeatureGate>
                    <FeatureGate feature="exports" quantity={1}>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExport}
                            disabled={exporting}
                        >
                            {exporting ? "Exporting..." : "Export"}
                        </Button>
                    </FeatureGate>
                </div>
            </Header>
            <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && closeForm()}>
                <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editing ? "Edit subscription" : "Add subscription"}</DialogTitle>
                        <DialogDescription>
                            {editing ? "Update the price, schedule, and category." : "Track the price and renewal schedule for a recurring service."}
                        </DialogDescription>
                    </DialogHeader>
                    <SubsForm key={editing?.id ?? "new-subscription"} editing={editing} onSaved={closeForm} />
                </DialogContent>
            </Dialog>
            {data.length === 0 ? (
                <div className="text-center p-20 border-2 border-dashed rounded-lg">
                    <p className="text-muted-foreground">
                        No subscriptions found.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {data.map((item) => (
                        <Card key={item.id} className="flex flex-col">
                            <CardHeader className="relative">
                                <div className="absolute top-4 right-4">
                                    <Badge
                                        variant={
                                            item.active
                                                ? "default"
                                                : "secondary"
                                        }
                                    >
                                        {item.active ? "Active" : "Inactive"}
                                    </Badge>
                                </div>
                                <CardTitle className="text-lg leading-tight pt-4">
                                    {item.title}
                                </CardTitle>
                            </CardHeader>

                            <CardContent className="flex-1 flex flex-col gap-3">
                                {/* Changed h1 to p with styling for SEO/Accessibility */}
                                <p className="text-2xl md:text-3xl font-bold tracking-tight">
                                    {formatCurrency(Number(item.amount), item.currency || "INR")}
                                </p>
                                <p className="text-sm text-muted-foreground line-clamp-2">
                                    {item.description}
                                </p>
                                <Badge
                                    variant="outline"
                                    className="w-fit font-normal"
                                >
                                    {item.categoryName}
                                </Badge>

                                <Separator />

                                <div className="text-xs space-y-1">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">
                                            Started:
                                        </span>
                                        <span>
                                            {isValid(new Date(item.date))
                                                ? format(
                                                      new Date(item.date),
                                                      "MMM d, yyyy",) 
                            
                                            : "N/A"}
                                        </span>
                                    </div>
                                    <div className="flex justify-between font-medium">
                                        <span className="text-muted-foreground">
                                            Next Date:
                                        </span>
                                        <span>
                                            {isValid(new Date(item.nextDate))
                                                ? format(
                                                      new Date(item.nextDate),
                                                      "MMM d, yyyy",
                                                  )
                                                : "N/A"}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>

                            <CardFooter className="border-t bg-muted/50 gap-2 p-3">
                                <Button
                                    className="flex-1"
                                    variant="ghost"
                                    size="sm"
                                    aria-label={`Edit ${item.title}`}
                                    onClick={() => {
                                        setEditing(item);
                                        setOpen(true);
                                    }}
                                >
                                    Edit
                                </Button>
                                <Button
                                    className="flex-1 text-destructive"
                                    variant="ghost"
                                    size="sm"
                                    aria-label={`Delete ${item.title}`}
                                    onClick={() => setPendingDelete(item)}
                                >
                                    Delete
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}

            <ConfirmDeleteDialog
                open={pendingDelete !== null}
                name={pendingDelete?.title ?? "this subscription"}
                description="It's removed along with its ledger entries. This can't be undone."
                onConfirm={async () => {
                    if (!pendingDelete) return;
                    await deleteAsync({
                        resource: "subscriptions",
                        id: pendingDelete.id,
                    });
                }}
                onCancel={() => setPendingDelete(null)}
                onSuccess={() => {
                    setPendingDelete(null);
                    closeForm();
                    query.refetch();
                    // Removing a subscription changes the dashboard totals.
                    refreshAll();
                }}
            />
        </section>
    );
};

export default SubscContent;
