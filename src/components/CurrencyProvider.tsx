"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { getCurrencyDetails, CurrencyDetails, formatCurrency } from "@/utils/currency";

interface CurrencyContextType {
    currency: string;
    symbol: string;
    details: CurrencyDetails;
    formatAmount: (
        amount: number | string | null | undefined,
        options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
    ) => string;
}

const defaultDetails = getCurrencyDetails("MYR");

const CurrencyContext = createContext<CurrencyContextType>({
    currency: defaultDetails.code,
    symbol: defaultDetails.symbol,
    details: defaultDetails,
    formatAmount: (amount, options) => formatCurrency(amount, defaultDetails.code, options),
});

export function CurrencyProvider({
    currency = "MYR",
    children,
}: {
    currency?: string | null;
    children: ReactNode;
}) {
    const details = getCurrencyDetails(currency || "MYR");

    const formatAmount = (
        amount: number | string | null | undefined,
        options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
    ) => {
        return formatCurrency(amount, details.code, options);
    };

    return (
        <CurrencyContext.Provider
            value={{
                currency: details.code,
                symbol: details.symbol,
                details,
                formatAmount,
            }}
        >
            {children}
        </CurrencyContext.Provider>
    );
}

export function useCurrency() {
    return useContext(CurrencyContext);
}
