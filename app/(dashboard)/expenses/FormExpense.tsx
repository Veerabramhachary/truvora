import {
    Card,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TransactionForm, type ExpenseRecord } from "./TransactionForm";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

function Toggle({ onSaved }: { onSaved?: () => void }) {
    return (
        <Tabs
            defaultValue="expenses"
            className="w-full max-w-md mx-auto"
        >
            <TabsList className="bg-gray-100 dark:bg-gray-800 rounded-full p-1">
                <TabsTrigger
                    value="expenses"
                    className="rounded-full px-6 py-1.5 transition-all
                        text-muted-foreground 
                        data-[state=active]:text-foreground 
                        data-[state=active]:bg-background 
                        data-[state=active]:shadow-sm
                        dark:data-[state=active]:bg-muted/50"
                >
                    Expenses
                </TabsTrigger>
                <TabsTrigger
                    value="income"
                    className="rounded-full px-6 py-1.5 transition-all
                    text-muted-foreground 
                    data-[state=active]:text-foreground 
                    data-[state=active]:bg-background 
                    data-[state=active]:shadow-sm
                    dark:data-[state=active]:bg-muted/50"
                >
                    Income
                </TabsTrigger>
            </TabsList>

            <TabsContent value="expenses">
                <ExpenseForm onSaved={onSaved} />
            </TabsContent>

            <TabsContent value="income">
                <IncomeForm onSaved={onSaved} />
            </TabsContent>
        </Tabs>
    );
}

const ExpenseForm = ({ onSaved }: { onSaved?: () => void }) => {
    return <TransactionForm type="expense" onSaved={onSaved} />;
};

const IncomeForm = ({ onSaved }: { onSaved?: () => void }) => {
    return <TransactionForm type="income" onSaved={onSaved} />;
};

interface FormExpenseProps {
    className?: string;
    onClose?: () => void;
    /** When set, renders a single prefilled form for this row instead of the
     * expense/income tab pair used for creating one. */
    editing?: ExpenseRecord | null;
    /** Called after a successful save. */
    onSaved?: () => void;
}

const FormExpense = ({
    className,
    onClose,
    editing,
    onSaved,
}: FormExpenseProps) => {
    return (
        <Card className={className}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle>
                    {editing ? "Edit transaction" : "Add transaction"}
                </CardTitle>
                {onClose && (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="h-8 w-8"
                        aria-label="close"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </CardHeader>
            {editing ? (
                // Keyed on the row id so switching which row is being edited
                // remounts the form with fresh defaultValues.
                <TransactionForm
                    key={editing.id}
                    type={editing.type}
                    editing={editing}
                    onSaved={onSaved ?? onClose}
                />
            ) : (
                <Toggle onSaved={onSaved} />
            )}
        </Card>
    );
};

export default FormExpense;
