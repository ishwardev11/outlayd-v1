# Expense Reporting Dashboard MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a specialized SaaS dashboard for non-profit admins to manage, review, and approve receipt/invoice extractions.

**Architecture:** Next.js App Router application with a hybrid layout. Core features include a global navigation sidebar, a high-level metrics dashboard, and a Kanban-filtered Ledger table with a slide-out processing drawer for rapid document review.

**Tech Stack:** Next.js 14, React, Tailwind CSS, shadcn/ui, Lucide React (Icons).

---

### Task 1: Project Setup & Dependencies

**Files:**
- Create: `package.json`, `tailwind.config.ts`, `components.json` (via scaffold)

**Step 1: Scaffold Next.js App**
Run: `npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm -y`
Expected: Next.js project is created in the current directory.

**Step 2: Initialize shadcn/ui**
Run: `npx shadcn@latest init -d -y`
Expected: `components.json` is created and configured.

**Step 3: Install Required shadcn/ui Components**
Run: `npx shadcn@latest add button card table badge sheet input select label scroll-area -y`
Expected: UI components are added to `src/components/ui/`.

**Step 4: Commit**
```bash
git add .
git commit -m "chore: scaffold nextjs app and install shadcn components"
```

---

### Task 2: Global Layout & Navigation

**Files:**
- Create: `src/components/layout/Sidebar.tsx`
- Modify: `src/app/layout.tsx:10-30`

**Step 1: Create Sidebar Component**
Implement `Sidebar.tsx` with links to Dashboard, Ledger, Vendors, Reports, and Settings using Lucide icons.

**Step 2: Update App Layout**
Wrap `{children}` in `src/app/layout.tsx` with a flex container holding the `Sidebar` and a main content area (`w-full flex`).

**Step 3: Run Dev Server to verify**
Run: `npm run dev` and open in browser to ensure the layout renders correctly without crashing.

**Step 4: Commit**
```bash
git add src/components/layout/Sidebar.tsx src/app/layout.tsx
git commit -m "feat: implement global sidebar layout"
```

---

### Task 3: Dashboard Metrics & Queue (UI Only)

**Files:**
- Modify: `src/app/page.tsx:1-50`

**Step 1: Implement Dashboard UI**
Update `page.tsx` to include three standard `Card` components for Metrics at the top ("$Awaiting", "To Review", "Top Funds"), and a simple list below representing the "Action Queue".

**Step 2: Run Dev Server to verify**
Run: `npm run dev` and visually verify the dashboard layout.

**Step 3: Commit**
```bash
git add src/app/page.tsx
git commit -m "feat: build dashboard metrics and queue ui"
```

---

### Task 4: Ledger / Processing Page Foundation

**Files:**
- Create: `src/app/ledger/page.tsx`
- Create: `src/components/ledger/KanbanFilters.tsx`

**Step 1: Create Ledger Route**
Implement `src/app/ledger/page.tsx` with a basic page shell.

**Step 2: Implement Kanban Filters**
Create `KanbanFilters.tsx` utilizing a row of cards displaying counts for `All`, `Extracting`, `Needs Review`, `Awaiting Payment`, `Paid`. Add this to the top of the Ledger page.

**Step 3: Run Dev Server to verify**
Run: `npm run dev` and navigate to `/ledger` to verify the filters render.

**Step 4: Commit**
```bash
git add src/app/ledger/page.tsx src/components/ledger/KanbanFilters.tsx
git commit -m "feat: implement ledger page and kanban filters"
```

---

### Task 5: Document Data Table & Slide-Out Drawer

**Files:**
- Create: `src/components/ledger/LedgerTable.tsx`
- Create: `src/components/ledger/ProcessingDrawer.tsx`
- Modify: `src/app/ledger/page.tsx:20-40`

**Step 1: Implement Ledger Table**
Create a `Table` component displaying mock data (Date, Vendor, Amount, Fund Tag, Status).

**Step 2: Implement Processing Drawer**
Create a `Sheet` (from shadcn) component `ProcessingDrawer.tsx`. It should trigger when a table row is clicked. Inside, create a two-column layout: left for an image placeholder, right for the data form (Inputs for Vendor, Amount, Select for Fund).

**Step 3: Integrate into Ledger Page**
Add both components to `src/app/ledger/page.tsx`. Ensure state manages which row is selected to open the drawer.

**Step 4: Run Dev Server to verify**
Run: `npm run dev`, navigate to `/ledger`, click a row, and verify the drawer slides out correctly.

**Step 5: Commit**
```bash
git add src/components/ledger/LedgerTable.tsx src/components/ledger/ProcessingDrawer.tsx src/app/ledger/page.tsx
git commit -m "feat: implement ledger data table and processing side drawer"
```
