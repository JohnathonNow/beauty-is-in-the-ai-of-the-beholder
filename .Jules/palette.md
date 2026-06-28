## 2024-06-27 - [Color Picker Accessibility]
**Learning:** Custom interactive elements (like the color picker options created dynamically via JavaScript) often lack native accessibility features compared to semantic HTML tags like `<button>`.
**Action:** When dynamically generating interactive elements, especially `<div>` or `<span>` elements acting as buttons, always explicitly add `role="button"`, `tabindex="0"`, descriptive `aria-label`s, and `keydown` event listeners for 'Enter' and 'Space' keys to ensure they are fully usable by screen readers and keyboard navigators.

## 2024-06-28 - [Invisible Form Submission Affordance]
**Learning:** The login input lacked a visible submit button. While pressing "Enter" worked, users without this prior knowledge or relying on screen readers wouldn't know how to proceed, which is a major accessibility block.
**Action:** Always provide a clear, visible submit button alongside text inputs, even if "Enter" key submission is supported. Wrap them in a logical container to visually link the action.
