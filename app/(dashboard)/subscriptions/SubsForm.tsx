"use client"

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { Resolver, SubmitHandler, useForm, useWatch } from "react-hook-form";
import z from "zod";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCreate, useUpdate, type BaseRecord, type HttpError } from "@refinedev/core";
import { useRefreshAll } from "@/lib/use-refresh";
import CategorySelector from "@/components/category-selector";
import { apiErrorMessage } from "@/lib/api-error";
import { CurrencySelect } from "@/components/currency-select";
import { DEFAULT_CURRENCY } from "@/lib/currencies";

const formSchema = z.object({
    name: z.string().min(2, "name is required"),
    note: z.string().optional(),
    price: z.coerce.number().min(0.01, "Amount must be greater than 0"),
    startDate: z.date({ error: "Start date is required" }),
    endDate: z.date().optional(), // Optional if it's an ongoing subscription
    category: z.string().min(1, "Select a category"),
    currency: z.string().min(1, "Currency is required"),
    interval: z.enum(["month", "year"]),
}).refine((data) => {
    // Validation: End date must be after Start date if it exists
    if (data.endDate && data.startDate) {
        return data.endDate > data.startDate;
    }
    return true;
}, {
    message: "End date must be after start date",
    path: ["endDate"],
});

type FormValues = z.infer<typeof formSchema>;

export interface SubscriptionRecord {
    id: string;
    title: string;
    active: boolean;
    amount: string | number;
    /** Start date — GET /api/subscriptions returns it under this key. */
    date: string | Date;
    description?: string | null;
    categoryId?: string | null;
    categoryName?: string | null;
    currency?: string | null;
    interval?: "month" | "year" | null;
    endDate: string | Date;
    nextDate: string | Date;
}

interface SubsFormProps {
    className?: string;
    /** When present the form edits this row instead of creating a new one. */
    editing?: SubscriptionRecord | null;
    /** Called after a successful save, so the parent can close the panel. */
    onSaved?: () => void;
}

// Ongoing subscriptions are stored with a far-future `end_date` (see
// app/api/subscriptions/schema.ts). Anything at or beyond this year means
// "no end date" and should be shown as such rather than prefilled.
const ONGOING_END_YEAR = 9900;

const SubsForm = ({ className, editing, onSaved }: SubsFormProps) => {
    // TVariables has to be spelled out: Refine defaults it to `{}`, which
    // would reject the form values on `mutateAsync`.
    const { mutateAsync: createAsync } =
        useCreate<BaseRecord, HttpError, FormValues>();
    const { mutateAsync: updateAsync } =
        useUpdate<BaseRecord, HttpError, FormValues>();
    const refreshAll = useRefreshAll();

    const editingEnd = editing ? new Date(editing.endDate) : null;
    // Ongoing subscriptions are stored with a far-future `end_date`; anything
    // at or beyond ONGOING_END_YEAR means "no end date" and shouldn't be
    // prefilled into the calendar.
    const prefilledEnd =
        editingEnd &&
        !isNaN(editingEnd.getTime()) &&
        editingEnd.getUTCFullYear() < ONGOING_END_YEAR
            ? editingEnd
            : undefined;

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as Resolver<FormValues>,
        defaultValues: editing
            ? {
                  interval: editing.interval ?? "month",
                  startDate: new Date(editing.date),
                  endDate: prefilledEnd,
                  currency: editing.currency ?? DEFAULT_CURRENCY,
                  name: editing.title,
                  note: editing.description ?? "",
                  category: editing.categoryName ?? "",
                  price: Number(editing.amount),
              }
            : {
                  interval: "month",
                  startDate: new Date(),
                  currency: DEFAULT_CURRENCY,
                  name: "",
                  note: "",
                  category: "",
              },
    });

    const {
        register,
        handleSubmit,
        setValue,
        control,
        formState: { errors, isSubmitting },
    } = form;

    const startDate = useWatch({ control, name: "startDate" });
    const endDate = useWatch({ control, name: "endDate" });
    const categoryValue = useWatch({ control, name: "category" });
    const currencyValue = useWatch({ control, name: "currency" });
    const intervalValue = useWatch({ control, name: "interval" });


    const onSubmit: SubmitHandler<FormValues> = async (data) => {
        const isEdit = Boolean(editing);
        try {
            if (editing) {
                await updateAsync({
                    resource: "subscriptions",
                    id: editing.id,
                    values: data,
                });
            } else {
                await createAsync({
                    resource: "subscriptions",
                    values: data,
                });
            }
            // The dashboard reads through useCustom, which Refine doesn't
            // auto-invalidate for this resource.
            refreshAll();
            form.reset();
            toast.success(
                isEdit ? "Changes saved" : "Subscription added successfully",
            );
            onSaved?.();
        } catch (error) {
            toast.error(
                apiErrorMessage(
                    error,
                    isEdit
                        ? "Error saving the changes"
                        : "Error adding subscription",
                ),
            );
        }
    };

    return (
        <Card className={className}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-4 text-left">
                {/* Title */}
                <div className="space-y-2">
                    <Label htmlFor="name">Subscription Name</Label>
                    <Input id="name" {...register("name")} placeholder="Netflix, Spotify..." />
                    {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                </div>

                {/* Price & Currency */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="price">Price</Label>
                        <Input id="price" type="number" step="0.01" {...register("price")} placeholder="0.00" />
                        {errors.price && <p className="text-sm text-destructive">{errors.price.message}</p>}
                    </div>
                    <CurrencySelect
                        value={currencyValue ?? DEFAULT_CURRENCY}
                        onValueChange={(v) => setValue("currency", v)}
                        errorMessage={errors.currency?.message}
                    />
                </div>

                {/* Dates Section */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Start Date */}
                    <div className="space-y-2 flex flex-col">
                        <Label>Start Date</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className={cn("justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {startDate ? format(startDate, "PP") : <span>Pick date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={startDate}
                                    onSelect={(d) => d && setValue("startDate", d)}
                                    autoFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* End Date */}
                    <div className="space-y-2 flex flex-col">
                        <Label>End Date (Optional)</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className={cn("justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {endDate ? format(endDate, "PP") : <span>No end date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={endDate}
                                    onSelect={(d) => setValue("endDate", d || undefined)}
                                    autoFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                    {errors.endDate && <p className="text-sm text-destructive">{errors.endDate.message}</p>}
                </div>

                {/* Interval & Category */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Billing Cycle</Label>
                        <Select onValueChange={(v: "month" | "year") => setValue("interval", v)} value={intervalValue ?? "month"}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="month">Monthly</SelectItem>
                                <SelectItem value="year">Yearly</SelectItem>
                            </SelectContent>
                        </Select>
                        {errors.interval && <p className="text-sm text-destructive">{errors.interval.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label>Category</Label>
                        <CategorySelector value= {categoryValue}type="subscription" onValueChange={(v) => setValue("category", v)} />
                        {errors.category && <p className="text-sm text-destructive">{errors.category.message}</p>}
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button type="submit" className="flex-1" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {editing ? "Save changes" : "Add Subscription"}
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
        </Card>
    );
};

export default SubsForm;