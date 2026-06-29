## 2024-06-27 - [Color Picker Accessibility]
**Learning:** Custom interactive elements (like the color picker options created dynamically via JavaScript) often lack native accessibility features compared to semantic HTML tags like `<button>`.
**Action:** When dynamically generating interactive elements, especially `<div>` or `<span>` elements acting as buttons, always explicitly add `role="button"`, `tabindex="0"`, descriptive `aria-label`s, and `keydown` event listeners for 'Enter' and 'Space' keys to ensure they are fully usable by screen readers and keyboard navigators.
## 2026-06-29 - Add explicit submit button to primary form
**Learning:** Relied on implicit 'Enter' keypresses for primary form submission (like login), which hides the primary action from the user and makes the UI less discoverable and accessible. Adding a semantic <label> and explicit <button> provides clear visual cues and ensures screen reader/keyboard users understand how to proceed.
**Action:** Always include a visible, explicit submit action (like a button) for primary forms and workflows, even if 'Enter' to submit is supported.
