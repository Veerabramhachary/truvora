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
import { useCreate } from "@refinedev/core";

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

const SubsForm = ({className}: {className?: string}) => {
    const { mutateAsync } = useCreate();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as Resolver<FormValues>,
        defaultValues: {
            interval: "month",
            startDate: new Date(),
            currency: "USD",
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


    const onSubmit: SubmitHandler<FormValues> = async (data) => {
        try {
            const result = await mutateAsync(
                {
                    resource: "subscriptions",
                    values: data,
                }
            );
            console.log(result);
            if(result.data.status === "201"){
                toast.success("Subscription added successfully");
                form.reset();
            }
        } catch (error) {
            toast.error("Error adding subscription");
            console.error(error);
        }
    };

    return (
        <Card className={className}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-4 text-left">
                {/* Title */}
                <div className="space-y-2">
                    <Label htmlFor="name">Subscription Name</Label>
                    <Input id="name" {...register("name")} placeholder="Netflix, Spotify..." />
                    {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
                </div>

                {/* Price & Currency */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="price">Price</Label>
                        <Input id="price" type="number" step="0.01" {...register("price")} placeholder="0.00" />
                    </div>
                    <div className="space-y-2">
                        <Label>Currency</Label>
                        <Select onValueChange={(v) => setValue("currency", v)} defaultValue="USD">
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="USD">USD ($)</SelectItem>
                                <SelectItem value="EUR">EUR (€)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
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
                </div>
                {errors.endDate && <p className="text-sm text-destructive">{errors.endDate.message}</p>}

                {/* Interval & Category */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Billing Cycle</Label>
                        <Select onValueChange={(v: "month" | "year") => setValue("interval", v)} defaultValue="month">
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="month">Monthly</SelectItem>
                                <SelectItem value="year">Yearly</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Category</Label>
                        <Select onValueChange={(v) => setValue("category", v)}>
                            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="entertainment">Entertainment</SelectItem>
                                <SelectItem value="utilities">Utilities</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Subscription
                </Button>
            </form>
        </Card>
    );
};

export default SubsForm;