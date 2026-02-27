# B2B Micro-SaaS for Non-Profit Expense Reporting & Accounts Payable

## Overview
A specialized platform designed to automate expense reporting and accounts payable for small non-profits. The system ingests receipts and invoices, extracts structured data via AI, and provides a streamlined workflow for admins to review, categorize by fund, and track payment status. 

## Target Audience & Roles
- **Primary User**: Non-profit Accountants / Administrators.
- **Workflow Focus**: The platform is strictly an admin-facing workflow tool for the MVP. Volunteers/employees do not have separate logins; the admin manages all uploads and processing.
- **Payments**: Handled externally (via bank transfer, check, etc.). The dashboard tracks the status of these external payments.

## Core Architecture & Pages

The application follows a **Hybrid Modular Workspace** approach, combining dedicated reporting pages with high-speed, kanban-filtered processing views.

### 1. Global Navigation
- **Dashboard**: High-level metrics and morning briefing.
- **Ledger / Processing**: The core engine for reviewing and approving documents.
- **Vendors**: Simple CRM for frequent payees and 1099 tracking.
- **Reports**: Dedicated interface for exporting fund-specific financial reports.
- **Settings**: Organization details, Fund management, and Category setup.

### 2. Dashboard ("Morning Briefing")
- **Top Metrics**:
  - Total Amount Awaiting Payment ($)
  - Documents Needing Review (Count)
  - Top 3 Funds by Spend (Visual/Chart)
- **Action Queue**: Highlights the 5 oldest or most urgent documents requiring attention.
- **Global Actions**: Prominent "Upload Document" dropzone.

### 3. Ledger / Processing Page
The primary workspace for handling accounts payable.
- **Kanban Filter Widgets**: Large, clickable status cards at the top acting as quick-filters:
  - `[All]`
  - `[Auto-Extracting]` (Currently being processed by AI)
  - `[Needs Review]` (AI complete, awaiting human verification)
  - `[Awaiting Payment]` (Verified and approved for payout)
  - `[Paid]` (External payment completed)
- **Data Table**: 
  - Columns: Date, Vendor, Amount, Fund Tag, Category, Status.
  - Controls: Sorting, search, and batch actions (e.g., "Mark 10 selected as Paid").
- **The Slide-Out Drawer (Processing UI)**:
  - Triggered by clicking a row in the Data Table.
  - Slides in from the right to maintain context.
  - **Left Pane**: Zoomable, scrollable view of the original receipt/invoice image or PDF.
  - **Right Pane**: Editable form pre-filled with AI-extracted data (Vendor, Amount, Date, Line Items).
  - **Action**: Admin verifies data, selects the "Fund" tag from a dropdown, and clicks "Approve & Next" to instantly load the next document in the queue without leaving the page.

## AI Data Extraction
- **Input**: Images (JPG, PNG) or PDFs of receipts and invoices.
- **Extracted Fields**: Vendor Name, Total Amount, Date, Document Type (Receipt vs. Invoice), Line Items.
- **Workflow**: Documents enter the `[Auto-Extracting]` state upon upload and transition to `[Needs Review]` upon successful extraction.

## Future Considerations (Post-MVP)
- Integration with external payment gateways (Stripe Connect, Plaid) to handle actual fund transfers.
- Separate volunteer/employee portal for submitting expenses directly.
