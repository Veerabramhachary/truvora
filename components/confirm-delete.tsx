"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { apiErrorMessage } from "@/lib/api-error";

interface ConfirmDeleteDialogProps {
    open: boolean;
    /** Name of the thing being deleted, echoed back so the user is certain. */
    name: string;
    description?: string;
    onConfirm: () => Promise<void>;
    onCancel: () => void;
    onSuccess: () => void;
}

/**
 * Destructive-action guard. Destructive actions get a real confirmation with
 * the target's name spelled out rather than a bare `confirm()`, so the click
 * can't be mistaken for anything else.
 */
export function ConfirmDeleteDialog({
    open,
    name,
    description,
    onConfirm,
    onCancel,
    onSuccess,
}: ConfirmDeleteDialogProps) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleConfirm = async () => {
        setIsDeleting(true);
        setError(null);
        try {
            await onConfirm();
            onSuccess();
        } catch (err) {
            setError(apiErrorMessage(err, "Could not delete it. Try again."));
            setIsDeleting(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next && !isDeleting) {
                    setError(null);
                    onCancel();
                }
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Delete {name}?</DialogTitle>
                    <DialogDescription>
                        {description ??
                            "This removes it from Truvora. It can't be undone."}
                    </DialogDescription>
                </DialogHeader>

                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}

                <DialogFooter className="gap-2 sm:justify-end">
                    <Button
                        variant="outline"
                        onClick={onCancel}
                        disabled={isDeleting}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleConfirm}
                        disabled={isDeleting}
                    >
                        {isDeleting && (
                            <Loader2
                                className="me-2 h-4 w-4 animate-spin"
                                aria-hidden="true"
                            />
                        )}
                        {isDeleting ? "Deleting…" : "Delete"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
