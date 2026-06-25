## 2026-06-25 - Extracted Login Form Click Logic
**Learning:** Found an accessibility issue where the main login input form only accepted standard "Enter" keydowns, making it unintuitive and inaccessible for screen readers, mobile devices, and normal users expecting a button.
**Action:** Added a prominent, labeled "Play" button next to the input and extracted the inline logic into a `doLogin()` function bounded to both events. Also added `autofocus` and `placeholder` attributes.
