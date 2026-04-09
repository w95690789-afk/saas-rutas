# Design System Strategy: Industrial Intelligence

## 1. Overview & Creative North Star
The design system for this logistics platform is guided by the **"The Precision Architect"** Creative North Star. Unlike standard industrial tools that feel cluttered and utilitarian, this system treats logistical data with editorial prestige. We balance the heavy-duty nature of industrial operations with a digital-first, high-end sophistication.

The interface moves away from "boxed-in" thinking. By leveraging intentional asymmetry, expansive whitespace, and a strict tonal hierarchy, we create an environment that feels authoritative and calm—essential for high-stakes decision-making in fleet management.

---

## 2. Colors & Tonal Surface Theory
Color is used not just for decoration, but as a structural material.

### Primary Palette
*   **Primary (#031636):** Our "Deep Industrial Blue." Used for navigation and high-level containers to ground the interface.
*   **Secondary (#0058be):** "Electric Interactive." Reserved for active states, primary actions, and critical data highlights.
*   **Surface (#f7f9fb):** The foundation. A clean, sophisticated neutral that prevents eye fatigue.

### The "No-Line" Rule
To achieve a premium look, **1px solid borders are prohibited for sectioning.** Structural boundaries must be defined solely through background color shifts. 
*   *Implementation:* Use `surface-container-low` for sidebars and `surface` for the main content area. The transition between these colors is the only "border" needed.

### Surface Hierarchy & Nesting
Treat the UI as a series of layered plates.
*   **Level 0 (Base):** `surface` (#f7f9fb)
*   **Level 1 (Sections):** `surface-container-low` (#f2f4f6)
*   **Level 2 (Cards/Modules):** `surface-container-lowest` (#ffffff)
This "nesting" creates natural depth and focus without visual noise.

### The "Glass & Gradient" Rule
For floating elements like modals or tooltips, use **Glassmorphism**:
*   Background: `surface-container-lowest` at 85% opacity.
*   Effect: `backdrop-blur: 12px`.
*   *Signature Texture:* Main CTAs should utilize a subtle linear gradient from `secondary` (#0058be) to `secondary-container` (#2170e4) at a 135° angle to add "soul" to the interactive elements.

---

## 3. Typography: Editorial Authority
We utilize **Inter** to bridge the gap between industrial legibility and modern tech aesthetics.

*   **Display (3.5rem - 2.25rem):** Reserved for high-level dashboard metrics. Bold weights with tight letter-spacing (-0.02em) to feel impactful.
*   **Headlines (2rem - 1.5rem):** Semi-bold. These act as anchors for the "Asymmetric Layout" philosophy.
*   **Body (1rem - 0.75rem):** Regular weight. We prioritize line height (1.6) to ensure complex data tables remain readable during long shifts.
*   **Labels (Condensed):** For data-heavy tables, use a slightly tighter tracking to increase information density without sacrificing the "clean" look.

---

## 4. Elevation & Depth
Depth is achieved through **Tonal Layering** rather than structural lines.

*   **Ambient Shadows:** Traditional drop shadows are too "dirty" for this system. If a floating effect is required (e.g., a dragged shipping route), use a shadow tinted with `primary`: `box-shadow: 0 12px 32px -4px rgba(3, 22, 54, 0.08)`.
*   **The Ghost Border Fallback:** For input fields or where accessibility requires a boundary, use the `outline-variant` (#c5c6cf) at **20% opacity**. It should be felt, not seen.
*   **Layering Principle:** Place a white card (`surface-container-lowest`) on a light grey background (`surface-container-low`) to create an immediate, sophisticated lift.

---

## 5. Components

### Buttons & Interactive
*   **Primary:** Gradient fill (Secondary to Secondary-Container), `8px` corner radius, white text.
*   **Secondary:** Ghost style. No background, `outline-variant` (20% opacity) border. 
*   **Hover States:** Shift background color by 5% luminosity; never change the border size.

### Inputs (Floating Intelligence)
*   **Style:** `surface-container-lowest` background with a `2px` bottom-only accent in `secondary` when focused. Labels must be `label-md` and use `on-surface-variant` color.

### Data Tables (Industrial Density)
*   **Constraint:** **Forbid the use of divider lines.** 
*   **Separation:** Use alternating row fills (Zebra striping) using `surface-container-low` and `surface-container-lowest`. 
*   **Typography:** Use `body-sm` for row data to maximize column count while maintaining an editorial "feel."

### The "Route Chip" (Custom Component)
*   For fleet status, use high-contrast chips with `surface-variant` backgrounds and bold `on-surface` text. These should feel like physical industrial tags.

---

## 6. Do’s and Don’ts

### Do
*   **Do** use extreme whitespace (Spacing scale 16+) between major functional blocks to signify "Strategic Thinking" areas.
*   **Do** use `secondary_fixed_dim` for subtle highlights in charts and maps.
*   **Do** align text-heavy content to a strict baseline grid to maintain the editorial look.

### Don’t
*   **Don’t** use 100% black for text. Always use `on-surface` (#191c1e) to maintain the premium "ink-on-paper" feel.
*   **Don’t** use "Alert" colors for anything other than critical errors. Use tonal blues for "info" states to keep the UI calm.
*   **Don’t** use sharp 90-degree corners. Even in industrial contexts, the `8px` (`lg`) radius is mandatory to maintain the "Digital Advancement" persona.