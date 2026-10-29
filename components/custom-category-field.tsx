"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LockKeyhole, Plus } from "lucide-react";
import { toast } from "sonner";
import CategorySelector from "@/components/category-selector";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorMessage } from "@/lib/api-error";

type CategoryType = "expense" | "subscription";
type CustomCategory = { id: string; name: string };

type CustomCategoryFieldProps = {
    type: CategoryType;
    value: string;
    onValueChange: (value: string) => void;
};

export function CustomCategoryField({
    type,
    value,
    onValueChange,
}: CustomCategoryFieldProps) {
    const [categories, setCategories] = useState<CustomCategory[]>([]);
    const [canCreate, setCanCreate] = useState(false);
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const [categoriesResponse, featureResponse] = await Promise.all([
                    fetch(`/api/categories?type=${type}`),
                    fetch("/api/feature?feature=customCategories"),
                ]);
                if (!featureResponse.ok) {
                    throw new Error("Could not load category options");
                }

                const featureData = (await featureResponse.json()) as {
                    allowed?: boolean;
                };
                if (categoriesResponse.status === 403 && !featureData.allowed) {
                    if (!cancelled) {
                        setCategories([]);
                        setCanCreate(false);
                    }
                    return;
                }
                if (!categoriesResponse.ok) {
                    throw new Error("Could not load category options");
                }

                const categoryData =
                    (await categoriesResponse.json()) as CustomCategory[];
                if (!cancelled) {
                    setCategories(categoryData);
                    setCanCreate(featureData.allowed === true);
                }
            } catch (error) {
                if (!cancelled) {
                    toast.error(apiErrorMessage(error, "Could not load categories."));
                }
            }
        }

        void load();
        return () => {
            cancelled = true;
        };
    }, [type]);

    async function addCategory(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const categoryName = name.trim();
        if (!categoryName || saving) return;

        setSaving(true);
        try {
            const response = await fetch("/api/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: categoryName, type }),
            });
            const responseText = await response.text();
            let category: CustomCategory | { error?: string };
            try {
                category = JSON.parse(responseText) as CustomCategory | { error?: string };
            } catch {
                throw new Error(
                    responseText || `Could not create category (HTTP ${response.status})`,
                );
            }
            if (!response.ok || !("name" in category)) {
                throw new Error(
                    "error" in category
                        ? category.error
                        : "Could not create category",
                );
            }

            setCategories((current) => [...current, category]);
            onValueChange(category.name);
            setName("");
            setOpen(false);
            toast.success("Custom category added");
        } catch (error) {
            toast.error(apiErrorMessage(error, "Could not add category."));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-2">
            <CategorySelector
                type={type}
                value={value}
                customCategories={categories}
                onValueChange={onValueChange}
            />
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground"
                disabled={!canCreate || saving}
                title={
                    canCreate
                        ? "Add a category for this form"
                        : "Upgrade your plan to create custom categories"
                }
                onClick={() => setOpen(true)}
            >
                {canCreate ? (
                    <Plus className="mr-1.5 h-4 w-4" />
                ) : (
                    <LockKeyhole className="mr-1.5 h-4 w-4" />
                )}
                {canCreate ? "Add custom category" : "Custom categories (paid)"}
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Add a custom category</DialogTitle>
                        <DialogDescription>
                            Create a category just for your {type === "expense" ? "expenses" : "subscriptions"}.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={addCategory} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor={`custom-category-${type}`}>Category name</Label>
                            <Input
                                id={`custom-category-${type}`}
                                autoFocus
                                maxLength={40}
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="e.g. Pet care"
                                required
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                                disabled={saving}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={!name.trim() || saving}>
                                {saving ? "Adding..." : "Add category"}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
