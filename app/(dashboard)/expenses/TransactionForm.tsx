"use client";

import { useForm, SubmitHandler, useWatch, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { useCreate, useUpdate, type BaseRecord, type HttpError } from "@refinedev/core";
import { useRefreshAll } from "@/lib/use-refresh";
import { toast } from "sonner";
import CategorySelector from "@/components/category-selector";
import { apiErrorMessage } from "@/lib/api-error";
import { CurrencySelect } from "@/components/currency-select";
import { DEFAULT_CURRENCY } from "@/lib/currencies";

const formSchema = z.object({
    title: z.string().min(2, "Title is required"),
    note: z.string().optional(),
    amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
    date: z.date(),
    category: z.string().min(1, "Select a category"),
    currency: z.string().min(1, "Currency is required"),
    type: z.enum(["income", "expense"]),
});

type FormValues = z.infer<typeof formSchema>;

export interface ExpenseRecord {
    id: string;
    title: string;
    note?: string | null;
    amount: number | string;
    date: string | Date;
    type: "income" | "expense";
    currency?: string | null;
    /** Named `description` because that's what GET /api/expenses returns. */
    description?: string | null;
    /** Display label from the `categories` join — exactly what the selector submits. */
    categoryName?: string | null;
}

interface TransactionFormProps {
    type: "income" | "expense";
    /** When present the form edits this row instead of creating a new one. */
    editing?: ExpenseRecord | null;
    /** Called after a successful save, so the parent can close the panel. */
    onSaved?: () => void;
}

export function TransactionForm({
    type,
    editing,
    onSaved,
}: TransactionFormProps) {
    // TVariables has to be spelled out: Refine defaults it to `{}`, which
    // would reject the form values on `mutateAsync`.
    const { mutateAsync: createAsync } =
        useCreate<BaseRecord, HttpError, FormValues>();
    const { mutateAsync: updateAsync } =
        useUpdate<BaseRecord, HttpError, FormValues>();
    const refreshAll = useRefreshAll();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as Resolver<FormValues>,
        defaultValues: editing
            ? {
                  type: editing.type,
                  title: editing.title,
                  note: editing.description ?? "",
                  amount: Number(editing.amount),
                  date: new Date(editing.date),
                  category: editing.categoryName ?? "",
                  currency: editing.currency ?? DEFAULT_CURRENCY,
              }
            : {
                  type,
                  date: new Date(),
                  currency: DEFAULT_CURRENCY,
                  title: "",
                  note: "",
                  category: "",
                  amount: 0,
              },
    });

    const {
        register,
        handleSubmit,
        setValue,
        control,
        formState: { errors, isSubmitting },
    } = form;

    // Use useWatch instead of watch to please the React Compiler
    const dateValue = useWatch({ control, name: "date" });
    const categoryValue = useWatch({ control, name: "category" });
    const currencyValue = useWatch({ control, name: "currency" });

    const onSubmit: SubmitHandler<FormValues> = async (data) => {
        const isEdit = Boolean(editing);
        try {
            if (editing) {
                await updateAsync({
                    resource: "expenses",
                    id: editing.id,
                    values: data,
                });
            } else {
                await createAsync({
                    resource: "expenses",
                    values: data,
                });
            }
            // The dashboard reads through useCustom, which Refine doesn't
            // auto-invalidate for this resource.
            refreshAll();
            form.reset();
            toast.success(
                isEdit
                    ? "Changes saved"
                    : `${type.charAt(0).toUpperCase() + type.slice(1)} added successfully`,
            );
            onSaved?.();
        } catch (error) {
            toast.error(
                apiErrorMessage(
                    error,
                    `Error saving the ${isEdit ? "changes" : type}`,
                ),
            );
        }
    };

    return (
        <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-5 p-4 text-left"
        >
            {/* Title */}
            <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                    id="title"
                    {...register("title")}
                    placeholder="Salary, Rent, etc."
                />
                {errors.title && (
                    <p className="text-sm text-red-500">
                        {errors.title.message}
                    </p>
                )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Amount */}
                <div className="space-y-2">
                    <Label htmlFor="amount">Amount</Label>
                    <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        {...register("amount")}
                    />
                    {errors.amount && (
                        <p className="text-sm text-red-500">
                            {errors.amount.message}
                        </p>
                    )}
                </div>

                {/* Currency */}
                <CurrencySelect
                    value={currencyValue ?? DEFAULT_CURRENCY}
                    onValueChange={(v) => setValue("currency", v)}
                    errorMessage={errors.currency?.message}
                />
            </div>
            {/* Note */}
            <div className="space-y-2">
                <Label htmlFor="note">Note</Label>
                <Input id="note" type="text" {...register("note")} />
                {errors.note && (
                    <p className="text-sm text-red-500">
                        {errors.note.message}
                    </p>
                )}
            </div>

            {/* Date */}
            <div className="space-y-2 flex flex-col">
                <Label>Date</Label>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateValue ? (
                                format(dateValue, "PPP")
                            ) : (
                                <span>Pick a date</span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar
                            mode="single"
                            selected={dateValue}
                            onSelect={(d) => d && setValue("date", d)}
                            autoFocus
                        />
                    </PopoverContent>
                </Popover>
            </div>

            {/* Category */}
            <div className="space-y-2">
                <Label>Category</Label>
                <CategorySelector type={type} value={categoryValue} onValueChange={(v) => setValue("category", v)}/>
                {errors.category && (
                    <p className="text-sm text-red-500">
                        {errors.category.message}
                    </p>
                )}
            </div>

            <div className="flex gap-2">
                <Button
                    type="submit"
                    className="flex-1"
                    disabled={isSubmitting}
                >
                    {isSubmitting && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {editing ? "Save changes" : `Add ${type}`}
                </Button>
                {editing && (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onSaved?.()}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                )}
            </div>
        </form>
    );
}
