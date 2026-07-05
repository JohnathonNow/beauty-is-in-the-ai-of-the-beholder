## 2024-06-27 - [Color Picker Accessibility]
**Learning:** Custom interactive elements (like the color picker options created dynamically via JavaScript) often lack native accessibility features compared to semantic HTML tags like `<button>`.
**Action:** When dynamically generating interactive elements, especially `<div>` or `<span>` elements acting as buttons, always explicitly add `role="button"`, `tabindex="0"`, descriptive `aria-label`s, and `keydown` event listeners for 'Enter' and 'Space' keys to ensure they are fully usable by screen readers and keyboard navigators.
## 2026-06-29 - Add explicit submit button to primary form
**Learning:** Relied on implicit 'Enter' keypresses for primary form submission (like login), which hides the primary action from the user and makes the UI less discoverable and accessible. Adding a semantic <label> and explicit <button> provides clear visual cues and ensures screen reader/keyboard users understand how to proceed.
**Action:** Always include a visible, explicit submit action (like a button) for primary forms and workflows, even if 'Enter' to submit is supported.
## 2026-06-30 - Missing Submit Buttons on Primary Forms
**Learning:** Primary forms and workflows in the UI (like global chat and game chat/guessing) lacked explicit submit buttons, relying entirely on implicit 'Enter' keyboard events. This is a critical accessibility and usability violation, as the action to submit is not easily discoverable to users, especially on mobile or for those using screen readers who expect standard form controls.
**Action:** Always include explicit, visible submit buttons alongside any implicit keyboard submission events (like 'Enter') when designing primary input workflows.
## 2024-07-06 - [Dynamic Image Accessibility]
**Learning:** Dynamically created `<img>` elements in the vanilla JavaScript frontend lacked `alt` text, which is an accessibility violation for screen readers.
**Action:** When dynamically creating `<img>` tags via `document.createElement("img")`, always explicitly assign descriptive `alt` text to ensure screen reader users have context.
