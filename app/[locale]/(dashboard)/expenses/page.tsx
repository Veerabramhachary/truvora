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
import { useList } from "@refinedev/core";
import { format, isValid } from "date-fns";
import FormExpense from "./FormExpense";
import { useState } from "react";

const Page = () => {
    const [open, setOpen] = useState(false);
    const { query, result } = useList({
        resource: "expenses",
    });

    const { isLoading, isError } = query;
    const data = result?.data ?? [];

    // Prevents Layout Shift and provides better UX
    if (isLoading) {
        return (
            <div className="flex h-64 w-full items-center justify-center p-10">
                <p className="animate-pulse text-muted-foreground">
                    Loading expenses...
                </p>
            </div>
        );
    }

    if (isError) {
        return (
            <div
                role="alert"
                className="p-10 text-destructive text-center font-medium"
            >
                Failed to load expenses. Please refresh the page.
            </div>
        );
    }

    return (
        <section className="w-full space-y-6 relative">
            <Header src="/money.png" alt="Expenses Icon" title="Expenses">
                <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={()=>setOpen(!open)}>
                        Create
                    </Button>
                    <FeatureGate feature="exports" quantity={1} consume={true}>
                        <Button variant="outline" size="sm">
                        Export
                    </Button>
                    </FeatureGate>
                </div>
            </Header>
            {open && <FormExpense className="w-full bg-background p-3" onClose={() => setOpen(false)} />}

            {data.length === 0 ? (
                <div className="text-center p-20 border-2 border-dashed rounded-lg">
                    <p className="text-muted-foreground">No expenses found.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {data.map((item) => (
                        <Card
                            key={item.expenseId || item.id}
                            className="flex flex-col min-w-0"
                        >
                            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                                <CardTitle className="text-base font-semibold truncate max-w-37.5">
                                    {item.title}
                                </CardTitle>
                                <Badge
                                    variant={
                                        item.type === "expense"
                                            ? "destructive"
                                            : "secondary"
                                    }
                                    className="capitalize"
                                >
                                    {item.type}
                                </Badge>
                            </CardHeader>

                            <CardContent className="flex-1 space-y-3">
                                {/* Fixed: Removed h1 for price to fix SEO/Accessibility */}
                                <div>
                                    <p className="text-2xl font-bold tracking-tight">
                                        {item.currency || "$"}{" "}
                                        {item.amount.toLocaleString()}
                                    </p>
                                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                                        {item.categoryName}
                                    </p>
                                </div>

                                <p className="text-sm text-muted-foreground line-clamp-2 min-h-[40px]">
                                    {item.description ||
                                        "No description provided."}
                                </p>

                                <Separator />

                                <p className="text-xs font-medium text-muted-foreground">
                                    Date:{" "}
                                    {isValid(new Date(item.date))
                                        ? format(
                                            new Date(item.date),
                                            "MMM d, yyyy",
                                          )
                                        : "Invalid date"}
                                </p>
                            </CardContent>

                            <CardFooter className="grid grid-cols-2 gap-2 border-t p-3 bg-muted/30">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8"
                                >
                                    Edit
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-destructive hover:bg-destructive/10"
                                >
                                    Delete
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}
        </section>
    );
};

export default Page;
