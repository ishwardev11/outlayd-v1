export const TEMPLATES: Record<string, { categories: any[], funds: any[] }> = {
    digital_agency: {
        categories: [
            { name: "Software & Cloud Infrastructure" },
            { name: "Marketing & Advertising" },
            { name: "Contractor & Freelance Fees" },
            { name: "Legal & Professional Services" },
            { name: "Office & Equipment" },
            { name: "Travel & Meals" }
        ],
        funds: [
            { name: "General OpEx" },
            { name: "Client Projects" },
            { name: "Internal R&D" },
            { name: "Employee Benefits" },
            { name: "Sales & Outbound" }
        ]
    },
    ecommerce: {
        categories: [
            { name: "Cost of Goods Sold (COGS)" },
            { name: "Shipping & Fulfillment" },
            { name: "Merchant Processing Fees" },
            { name: "Advertising & Promotions" },
            { name: "Packaging Supplies" },
            { name: "Warehouse Rent & Storage" }
        ],
        funds: [
            { name: "Store Operations" },
            { name: "Logistics & Supply Chain" },
            { name: "Marketing & Growth" },
            { name: "Customer Acquisition" },
            { name: "Inventory Expansion" }
        ]
    },
    non_profit: {
        categories: [
            { name: "Program Supplies" },
            { name: "Fundraising Expenses" },
            { name: "Administrative & Overhead" },
            { name: "Professional Fees (Legal & Accounting)" },
            { name: "Travel & Events" },
            { name: "Grants & Awards" }
        ],
        funds: [
            { name: "General Unrestricted" },
            { name: "Restricted Grant" },
            { name: "Community Outreach" },
            { name: "Building Fund" },
            { name: "Emergency Relief" }
        ]
    }
};
