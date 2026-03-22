// types/index.ts
export interface Plan {
    id: string;
    name: string;
    description: string;
    currency: string;
    price: number;
    interval: "month" | "year";
    intervalCount: number;
    features: string[];
    isActive: boolean;
    stripePriceId?: string | null;
    createdAt: Date;
    updatedAt: Date;
}
