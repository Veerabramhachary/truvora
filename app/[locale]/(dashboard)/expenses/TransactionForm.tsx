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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
// If 'Field' is giving you trouble, we'll use the classic Label/Input pattern for maximum compatibility
import { Label } from "@/components/ui/label";
import { useCreate } from "@refinedev/core";
import { toast } from "sonner";
import CategorySelector from "@/components/category-selector";

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

export function TransactionForm({ type }: { type: "income" | "expense" }) {
    const { mutateAsync } = useCreate();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as Resolver<FormValues>,
        defaultValues: {
            type,
            date: new Date(),
            currency: "USD",
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

    const onSubmit: SubmitHandler<FormValues> = async (data) => {
        try {
            await mutateAsync({
                resource: "expenses",
                values: data,
            });
            form.reset();
            toast.success(
                `${type.charAt(0).toUpperCase() + type.slice(1)} added successfully`,
            );
        } catch (error) {
            toast.error(`Error adding ${type}`);
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

            <div className="grid grid-cols-2 gap-4">
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
                <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select
                        onValueChange={(v) => setValue("currency", v)}
                        defaultValue="USD"
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
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

            <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Add {type}
            </Button>
        </form>
    );
}
