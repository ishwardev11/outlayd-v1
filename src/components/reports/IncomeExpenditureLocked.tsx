"use client";

import { Scale } from "lucide-react";
import { FeatureLocked } from "@/components/ui/FeatureLocked";

export function IncomeExpenditureLocked({ business }: { business: boolean }) {
    return (
        <FeatureLocked
            title={business ? "Profit and Loss" : "Statement of Income and Expenditure"}
            tagline="Your income and spending for the year, straight from your records."
            heading="Financial statements are a Growth feature"
            features={[
                "Income by type and spending by group, with the surplus or deficit for the year",
                "This year against last year, or one column per fund",
                "Every line opens the entries behind it",
                "Download as CSV for your AGM or auditor",
            ]}
            context="financial_statements"
            icon={<Scale className="w-4 h-4" />}
        />
    );
}
