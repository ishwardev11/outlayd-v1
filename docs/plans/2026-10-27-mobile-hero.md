# Mobile Hero Responsive Styling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the landing-page hero badge, heading, and description fully visible without horizontal overflow at mobile widths from 320px to 428px.

**Architecture:** Make responsive-only class changes in the existing `HeroSection` and retain its current colors, copy, desktop breakpoints, and composition. Allow the badge to wrap instead of clipping; use a fluid mobile heading size and explicit shrinkable text widths.

**Tech Stack:** Next.js App Router, React, Tailwind CSS 4, ESLint.

---

### Task 1: Make the hero badge and copy fit mobile widths

**Files:**
- Modify: `src/app/(marketing)/page.tsx` in `HeroSection`

**Step 1: Inspect the exact target classes**

Read `HeroSection` and confirm the current section padding, badge overflow behavior, and typography classes before editing.

**Step 2: Update the badge to wrap rather than clip**

Keep its colors and pill styling. Add centered wrapping behavior and `min-w-0` to a text span; keep the indicator dot from shrinking. Remove the badge's `overflow-hidden` so its text is not cut off.

**Step 3: Make heading and description fluid within the section**

Keep the section's `px-4 sm:px-6` padding and existing desktop sizes. Replace the unsupported `xs:` heading size with a mobile `clamp()` size before the existing `sm:`, `md:`, and `lg:` sizes. Add `min-w-0`/`w-full` where needed so the text column and paragraph use only the available width.

**Step 4: Run focused lint**

Run from `expense-dashboard`:

```powershell
npm run lint -- "src/app/(marketing)/page.tsx"
```

Expected: ESLint completes without errors for the edited page.

**Step 5: Verify mobile and desktop layout**

At 320px, 375px, and 428px viewport widths, verify that the badge and copy remain fully visible and `document.documentElement.scrollWidth` does not exceed `window.innerWidth`. Check a desktop width to confirm existing layout and typography remain intact.

**Step 6: Run the production build**

Run from `expense-dashboard`:

```powershell
npm run build
```

Expected: the Next.js build completes successfully.
