import {
    expenseCategories,
    incomeCategories,
    subscriptionsCategories,
} from "@/lib/categories";
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
    CommandList,
} from "./ui/command";
import { cn } from "@/lib/utils";

interface CategortSectorProps {
    type: "income" | "expense" | "subscription";
    value: string;
    onValueChange: (value: string) => void;
    customCategories?: { id: string; name: string }[];
}
const CategorySelector = ({
    type,
    value,
    onValueChange,
    customCategories = [],
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

    const selectedItem = allItems.find((item) => item.label === value);
    const selectedCustomCategory = customCategories.find(
        (category) => category.name === value,
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                >
                    {selectedItem?.label ??
                        selectedCustomCategory?.name ??
                        (value || "Select a category...")}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={4}
                collisionPadding={12}
                className="max-h-[min(26rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] overflow-hidden p-0"
            >
                <Command>
                    <CommandInput placeholder="Search categories..." />
                    <CommandList className="max-h-[min(21rem,calc(var(--radix-popover-content-available-height)-3rem))]">
                        <CommandEmpty>No category found.</CommandEmpty>
                        {categories.map((group) => (
                            <CommandGroup key={group.label} heading={group.label}>
                                {group.items.map((item) => (
                                    <CommandItem
                                        key={item.value}
                                        value={item.value}
                                        // cmdk lowercases the value it hands back from onSelect,
                                        // and the API looks the category up by its stored name
                                        // (the label). Read from `item` instead of the callback
                                        // argument so mixed-case labels survive.
                                        onSelect={() => {
                                            onValueChange(
                                                item.label === value
                                                    ? ""
                                                    : item.label,
                                            );
                                            setOpen(false);
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "ms-2 h-4 w-4 shrink-0",
                                                value === item.label
                                                    ? "opacity-100"
                                                    : "opacity-0",
                                            )}
                                        />
                                        {item.label}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        ))}
                        {customCategories.length > 0 && (
                            <CommandGroup heading="Your Categories">
                                {customCategories.map((category) => (
                                    <CommandItem
                                        key={category.id}
                                        value={category.name}
                                        onSelect={() => {
                                            onValueChange(
                                                category.name === value
                                                    ? ""
                                                    : category.name,
                                            );
                                            setOpen(false);
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "ms-2 h-4 w-4 shrink-0",
                                                value === category.name
                                                    ? "opacity-100"
                                                    : "opacity-0",
                                            )}
                                        />
                                        {category.name}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
};
export default CategorySelector;
