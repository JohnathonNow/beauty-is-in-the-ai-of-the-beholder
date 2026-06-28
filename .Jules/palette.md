## 2024-06-27 - [Color Picker Accessibility]
**Learning:** Custom interactive elements (like the color picker options created dynamically via JavaScript) often lack native accessibility features compared to semantic HTML tags like `<button>`.
**Action:** When dynamically generating interactive elements, especially `<div>` or `<span>` elements acting as buttons, always explicitly add `role="button"`, `tabindex="0"`, descriptive `aria-label`s, and `keydown` event listeners for 'Enter' and 'Space' keys to ensure they are fully usable by screen readers and keyboard navigators.
