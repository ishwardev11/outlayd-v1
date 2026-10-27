# Mobile Hero Responsive Design

## Goal

Fix mobile overflow and text clipping in the landing-page hero at viewport widths from 320px to 428px while preserving the existing visual design on larger screens.

## Scope

Update only `src/app/(marketing)/page.tsx` within `HeroSection`. Keep existing colors, copy, alignment, desktop sizing, CTA layout, and hero structure.

## Responsive treatment

- Keep the section's mobile horizontal padding and ensure its content can shrink to the available width.
- Let the announcement badge wrap naturally on narrow screens instead of clipping its text; keep the indicator dot from shrinking.
- Use a responsive mobile heading size and line height while retaining the existing larger breakpoints.
- Ensure the heading and description wrap within the hero's available width.
- Do not hide horizontal overflow globally, since that could mask clipping or affect unrelated sections.

## Verification

Check the hero at 320px, 375px, and 428px widths for complete badge and text visibility and no document-level horizontal overflow. Also confirm larger breakpoint styles remain intact, then run the project's focused lint/type/build validation.
