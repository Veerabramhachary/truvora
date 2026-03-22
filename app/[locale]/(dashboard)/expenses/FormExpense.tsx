import {
    Card,
    CardAction,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TransactionForm } from "./TransactionForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

function Toggle() {
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
                <ExpenseForm />
            </TabsContent>

            <TabsContent value="income">
                <IncomeForm />
            </TabsContent>
        </Tabs>
    );
}

const ExpenseForm = () => {
    return <TransactionForm type="expense" />;
};

const IncomeForm = () => {
    return <TransactionForm type="income" />;
};

const FormExpense = ({ className, onClose }: { className?: string, onClose?: () => void; }) => {
    return (
        <Card className={className}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle>Add Transaction</CardTitle>
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
            <Toggle />
        </Card>
    );
};

export default FormExpense;
