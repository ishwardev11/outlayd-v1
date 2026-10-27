# Responsive Device Optimization Design

## 1. Goal & Constraints
- **Goal**: Optimize Outlayd for all device form factors (mobile phones, tablets, laptops, desktops).
- **Core Constraint**: Keep the UI design, branding, aesthetics, colors, components, and workflows intact. Do not redesign the look-and-feel; optimize layout, container sizing, touch targets, and responsiveness.

---

## 2. Navigation & Layout Adaptations

### 2.1 Dashboard Layout (`src/app/(dashboard)/layout.tsx` & `src/components/layout/`)
- **Desktop (≥ 768px / md+)**:
  - Unchanged: Persistent sticky left sidebar (`w-52 h-screen`), main content area beside it.
- **Mobile (< 768px)**:
  - Desktop sidebar hidden (`hidden md:block`).
  - **Mobile Top Header**: Fixed or sticky top bar (`h-14`) with Outlayd logo, active organization / title, and hamburger button.
  - **Slide-over Mobile Drawer**: Clicking the hamburger button smoothly slides out the exact same Outlayd `Sidebar` component in a drawer overlay with backdrop blur and close (`X`) button.
  - **Mobile Bottom Navigation Bar**: Fixed bottom bar (`h-16`) providing one-thumb reach to the 4 main views:
    - Dashboard (`/dashboard`)
    - Ledger (`/ledger`)
    - Vendors (`/vendors`)
    - Reports (`/reports`)
  - **Content Padding**: Adjusted to `px-4 py-4 pb-24 md:p-8 md:pb-8` so content never gets obscured behind the bottom navigation bar.

### 2.2 Marketing Landing Page (`src/app/(marketing)/page.tsx`)
- Keep existing navbar style and desktop links.
- Add mobile menu hamburger toggle in the top navbar (`md:hidden`).
- Tapping toggles an animated glassmorphic dropdown with the navigation links (`Services`, `How it works`, `Why Outlayd`, `Pricing`, `FAQ`, `Log in`, `Get Started`).

---

## 3. Data Views & Table Responsiveness

### 3.1 Ledger (`src/components/ledger/LedgerTable.tsx`)
- Encase `<Table>` in an `<div className="overflow-x-auto w-full">` wrapper with a min-width (`min-w-[640px]`).
- Row clickability and checkboxes maintain touch targets (min 44px height).
- Filters and search bar wrap gracefully on mobile (`flex-col sm:flex-row`).

### 3.2 Vendors (`src/components/vendors/VendorsClient.tsx`)
- Encase `<Table>` in an `overflow-x-auto` wrapper with `min-w-[640px]`.
- Top metrics cards wrap in responsive grid (`grid-cols-1 sm:grid-cols-3`).
- Search bar and batch actions flex-wrap cleanly (`flex-col sm:flex-row`).

### 3.3 Reports (`src/components/reports/ReportsClient.tsx`)
- Outflows table encased in `overflow-x-auto`.
- Top filter bar wraps cleanly without horizontal overflow (`w-full sm:w-auto`).
- Metric cards and charts stack on mobile (`grid-cols-1 md:grid-cols-2`).

---

## 4. Components & Modals

### 4.1 Cash Flow Chart (`src/components/dashboard/CashFlowChart.tsx`)
- Card header wraps title and total amount cleanly on narrow screens (`flex-col sm:flex-row`).
- ResponsiveContainer dimensions adjusted so small screens do not have fixed 500px min-width overflow.

### 4.2 Action Queue (`src/components/dashboard/ActionQueueClient.tsx`)
- Action buttons made visible on touch devices (`opacity-100 sm:opacity-0 sm:group-hover:opacity-100`) so mobile users without mouse hover can easily tap quick actions.

### 4.3 Review & Processing Drawer (`src/components/ledger/ProcessingDrawer.tsx`)
- Retain exact styling and content.
- Ensure split categorization and line item grids stack gracefully on mobile viewports (`grid-cols-1 sm:grid-cols-...`).
- Dialog content responsive sizing with smooth vertical scrolling on mobile.

---

## 5. Page Spacing & Container Scaling
- Standardize outer container padding across pages:
  - From hardcoded `p-8` to `p-4 sm:p-6 lg:p-8`
  - Pages updated: `dashboard/page.tsx`, `ledger/page.tsx`, `vendors/page.tsx`, `reports/page.tsx`, `procurement/page.tsx`, `settings/page.tsx`.
