import {
    expenseCategories,
    incomeCategories,
    subscriptionsCategories,
} from "@/app/[locale]/(dashboard)/expenses/categories";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Button } from "./ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
} from "./ui/command";
import { cn } from "@/lib/utils";

interface CategortSectorProps {
    type: "income" | "expense" | "subscription";
    value: string;
    onValueChange: (value: string) => void;
}
const CategorySelector = ({
    type,
    value,
    onValueChange,
}: CategortSectorProps) => {
    const [open, setOpen] = useState(false);
    let categories:
        | typeof incomeCategories
        | typeof expenseCategories
        | typeof subscriptionsCategories = [];
    switch (type) {
        case "income":
            categories = incomeCategories;
            break;
        case "expense":
            categories = expenseCategories;
            break;
        case "subscription":
            categories = subscriptionsCategories;
            break;
        default:
            categories = [];
            break;
    }

    const allItems = categories.flatMap((group) =>
        group.items.map((item) => ({
            ...item,
            group: group.label,
        })),
    );

    const selectedItem = allItems.find((item) => item.value === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                >
                    {selectedItem ? selectedItem.label : "Select a category..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                    <CommandInput placeholder="Search categories..." />
                    <CommandEmpty>No category found.</CommandEmpty>
                    {categories.map((group) => (
                        <CommandGroup key={group.label} heading={group.label}>
                            {group.items.map((item) => (
                                <CommandItem
                                    key={item.value}
                                    value={item.value}
                                    onSelect={(currentValue) => {
                                        onValueChange(
                                            currentValue === value
                                                ? ""
                                                : currentValue,
                                        );
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === item.value
                                                ? "opacity-100"
                                                : "opacity-0",
                                        )}
                                    />
                                    {item.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    ))}
                </Command>
            </PopoverContent>
        </Popover>
    );
};
export default CategorySelector;
