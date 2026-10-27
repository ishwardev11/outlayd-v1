# Responsive Device Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Optimize Outlayd for mobile phones, tablets, and desktops while maintaining the exact same UI styling, branding, and components.

**Architecture:** Responsive mobile navigation wrapper (top header + hamburger slide-over drawer + bottom nav bar) around existing sidebar, fluid table scroll wrappers, touch-friendly action states, and responsive container padding without visual alteration.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS 4, Lucide React, Radix UI.

---

### Task 1: Mobile Navigation Component & Dashboard Layout Integration

**Files:**
- Create: `src/components/layout/MobileNav.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Step 1: Create `MobileNav.tsx`**
Create a mobile navigation client component providing:
1. Fixed Top Bar (`md:hidden`): Outlayd logo + Hamburger button to toggle the full drawer.
2. Slide-over Mobile Drawer: Backdrop blur overlay displaying the exact Outlayd `Sidebar` navigation, closed via button or backdrop tap or navigation.
3. Fixed Bottom Bar (`md:hidden`): Fast thumb access to `/dashboard`, `/ledger`, `/vendors`, and `/reports` with active highlight.

**Step 2: Update `src/app/(dashboard)/layout.tsx`**
- Change `<div className="sticky top-0 h-screen shrink-0">` to `<div className="hidden md:block sticky top-0 h-screen shrink-0">`.
- Render `<MobileNav />` inside the layout.
- Add `pb-20 md:pb-0` to `<main>` to prevent content clipping behind bottom navigation.

**Step 3: Verification & Commit**
- Verify component imports and types.
- Commit: `git add src/components/layout/MobileNav.tsx src/app/(dashboard)/layout.tsx; git commit -m "feat: add responsive mobile navigation and dashboard layout wrapper"`

---

### Task 2: Marketing Landing Page Mobile Menu

**Files:**
- Modify: `src/app/(marketing)/page.tsx`

**Step 1: Add Mobile Menu Toggle to Marketing Navbar**
- In `Navbar`: Add `isMobileMenuOpen` state.
- Add mobile hamburger button (`md:hidden`).
- Render animated mobile dropdown containing:
  - Links: Services, How it works, Why Outlayd, Pricing, FAQ.
  - Auth: Log in and Get Started buttons.
  - Automatically close on link click.

**Step 2: Verification & Commit**
- Verify dropdown toggles and mobile links navigate smoothly.
- Commit: `git add src/app/(marketing)/page.tsx; git commit -m "feat: add mobile hamburger menu to marketing landing page"`

---

### Task 3: Container Spacing Standardization

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`
- Modify: `src/app/(dashboard)/ledger/page.tsx`
- Modify: `src/app/(dashboard)/vendors/page.tsx`
- Modify: `src/app/(dashboard)/reports/page.tsx`
- Modify: `src/app/(dashboard)/procurement/page.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`

**Step 1: Update Page Padding**
- Change hardcoded `p-8` to `p-4 sm:p-6 lg:p-8` across all main dashboard page wrappers.
- On narrow viewports (360px–640px), this preserves 48px–64px of horizontal space for actual content.

**Step 2: Verification & Commit**
- Commit: `git add src/app/(dashboard)/; git commit -m "style: standardize responsive page padding across dashboard views"`

---

### Task 4: Table and Filter Bar Responsiveness

**Files:**
- Modify: `src/components/ledger/LedgerTable.tsx`
- Modify: `src/components/vendors/VendorsClient.tsx`
- Modify: `src/components/reports/ReportsClient.tsx`

**Step 1: Ledger Table**
- Wrap `<Table>` inside `<div className="overflow-x-auto w-full touch-pan-x">` with `min-w-[640px]` on the table element.

**Step 2: Vendors Client Table & Action Bar**
- Wrap `<Table>` inside `<div className="overflow-x-auto w-full touch-pan-x">` with `min-w-[640px]`.
- Change search input and batch merge buttons wrapper from `flex items-center justify-between` to `flex flex-col sm:flex-row sm:items-center justify-between gap-3`.

**Step 3: Reports Client Outflows Table & Filter Bar**
- Wrap Significant Outflows `<Table>` inside `<div className="overflow-x-auto w-full touch-pan-x">` with `min-w-[600px]`.
- In the filter bar, change `max-w-fit` to `w-full sm:max-w-fit` and allow select filters to wrap responsively without layout shifts.

**Step 4: Verification & Commit**
- Commit: `git add src/components/ledger/LedgerTable.tsx src/components/vendors/VendorsClient.tsx src/components/reports/ReportsClient.tsx; git commit -m "feat: make data tables and filter bars responsive for mobile viewports"`

---

### Task 5: Touch Interaction & Component Scaling

**Files:**
- Modify: `src/components/dashboard/ActionQueueClient.tsx`
- Modify: `src/components/dashboard/CashFlowChart.tsx`
- Modify: `src/components/ledger/ProcessingDrawer.tsx`

**Step 1: ActionQueueClient Touch Support**
- Change quick action buttons from hover-only (`opacity-0 group-hover:opacity-100`) to touch-accessible:
  `opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity`.
- Ensure buttons have adequate touch target padding.

**Step 2: CashFlowChart Header & Responsive Container**
- Change `CardHeader` from `flex flex-row items-center justify-between pb-2` to `flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2`.
- In `ResponsiveContainer`, ensure minimum width is `0` and margins adapt gracefully.

**Step 3: ProcessingDrawer Mobile Form Layout**
- In split categorization: update `grid grid-cols-[1fr_2fr_2fr]` to `grid grid-cols-1 sm:grid-cols-[1fr_2fr_2fr]` so amount, fund, and category don't get squished on mobile.
- In line items: wrap line item rows with `overflow-x-auto min-w-[500px]` so input columns remain legible.

**Step 4: Verification & Commit**
- Commit: `git add src/components/dashboard/ActionQueueClient.tsx src/components/dashboard/CashFlowChart.tsx src/components/ledger/ProcessingDrawer.tsx; git commit -m "feat: improve touch interaction and component layouts for mobile devices"`

---

### Task 6: Full Build Verification & Quality Assurance

**Step 1: Run Next.js Build**
- Run `npm run build` to ensure all TypeScript types, exports, and layout components compile cleanly with zero errors.

**Step 2: Final Commit & Summary**
- Ensure git working tree is clean.
