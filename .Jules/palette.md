## 2024-06-27 - [Color Picker Accessibility]
**Learning:** Custom interactive elements (like the color picker options created dynamically via JavaScript) often lack native accessibility features compared to semantic HTML tags like `<button>`.
**Action:** When dynamically generating interactive elements, especially `<div>` or `<span>` elements acting as buttons, always explicitly add `role="button"`, `tabindex="0"`, descriptive `aria-label`s, and `keydown` event listeners for 'Enter' and 'Space' keys to ensure they are fully usable by screen readers and keyboard navigators.
## 2026-06-29 - Add explicit submit button to primary form
**Learning:** Relied on implicit 'Enter' keypresses for primary form submission (like login), which hides the primary action from the user and makes the UI less discoverable and accessible. Adding a semantic <label> and explicit <button> provides clear visual cues and ensures screen reader/keyboard users understand how to proceed.
**Action:** Always include a visible, explicit submit action (like a button) for primary forms and workflows, even if 'Enter' to submit is supported.
## 2026-06-30 - Missing Submit Buttons on Primary Forms
**Learning:** Primary forms and workflows in the UI (like global chat and game chat/guessing) lacked explicit submit buttons, relying entirely on implicit 'Enter' keyboard events. This is a critical accessibility and usability violation, as the action to submit is not easily discoverable to users, especially on mobile or for those using screen readers who expect standard form controls.
**Action:** Always include explicit, visible submit buttons alongside any implicit keyboard submission events (like 'Enter') when designing primary input workflows.
## 2026-07-03 - Added input validation to submit buttons
**Learning:** In vanilla JavaScript web apps where input values are cleared programmatically after submission, native `input` events do not fire automatically. This causes input-validation event listeners (e.g. enabling/disabling a submit button) to get out of sync with the actual DOM state.
**Action:** When programmatically changing an input field's value, manually dispatch an `input` event (`input.dispatchEvent(new Event("input"))`) to ensure UI state remains synchronized.
## 2024-07-06 - [Dynamic Image Accessibility]
**Learning:** Dynamically created `<img>` elements in the vanilla JavaScript frontend lacked `alt` text, which is an accessibility violation for screen readers.
**Action:** When dynamically creating `<img>` tags via `document.createElement("img")`, always explicitly assign descriptive `alt` text to ensure screen reader users have context.
## 2026-07-01 - Synchronizing aria-pressed state for custom toggle buttons
**Learning:** For custom toggle buttons in the vanilla JS frontend (such as drawing tools or dynamically generated color picker swatches), failing to explicitly synchronize the `aria-pressed` attribute when visual selection classes (like `.active-tool` or `.colorpicked`) change leaves screen reader users unaware of their currently active selection.
**Action:** Whenever implementing or modifying custom toggle controls, dynamically set `aria-pressed="true"` on the newly selected element and `aria-pressed="false"` on the unselected elements along with visual class toggling.
## 2024-07-07 - Contextual aria-labels for generic buttons
**Learning:** Dynamically generating buttons with brief, generic text (e.g., 'Kick' or 'Ban') that rely on visual adjacency for context creates an accessibility issue for screen reader users. They will only hear "Kick, button" without knowing who they are kicking.
**Action:** When dynamically generating such buttons, always add an explicit, contextual `aria-label` (e.g., 'Kick [PlayerName]') to ensure proper screen reader accessibility.

## 2026-07-04 - Screen reader notifications for dynamic game state updates
**Learning:** Dynamic DOM updates for game state (like chat messages, prompts to draw, score updates) in the vanilla JS frontend were not notifying screen readers because the container elements lacked `aria-live` and `role` attributes. This left screen reader users unaware of critical game events (e.g. someone chatting, it's their turn to draw, or receiving a score).
**Action:** Always add `aria-live="polite"` and either `role="log"` (for message streams) or `role="status"` (for single state updates) to container elements where dynamic game information is updated to ensure screen reader users receive timely notifications.
## 2026-07-06 - Temporary visual feedback on buttons
**Learning:** When implementing temporary visual feedback on buttons in the vanilla JS frontend (like changing text to "Copied!" and reverting after 2 seconds), failing to clear the timeout on rapid consecutive clicks causes the revert text (e.g. "Copied!" captured in the second click) to become permanently stuck when the final timeout fires.
**Action:** Always use `clearTimeout` to reset any pending timeouts before applying new state, and manage variables carefully to prevent race conditions during rapid user interaction.
