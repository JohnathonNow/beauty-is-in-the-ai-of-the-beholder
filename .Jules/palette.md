## 2026-10-31 - [Keyboard Shortcut Hints for Submit Buttons]
**Learning:** Overriding `title` attributes for validation states (like "Input required") can permanently destroy existing accessibility information like shortcut hints if not handled carefully.
**Action:** When creating logic to dynamically override titles, always check for and preserve the element's original `title` using a data attribute (like `dataset.originalTitle`), restoring it when the validation constraint is lifted.
