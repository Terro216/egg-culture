# Interface actions

The public RU/EN interface shares `src/app/styles/buttons.css`, imported by the main layout.

- `btn`: primary action; use one per current task. Gold fill, dark text.
- `btn btn-secondary`: supporting action or a selectable option (`aria-pressed`).
- `btn btn-link`: navigation or a low-priority action, with an underline.

Controls use the existing UI font, 16 px, sentence case, 48 px minimum height,
12 × 20 px padding and a 4 px radius. Native `disabled`, `aria-busy` and keyboard
focus share the same styles. Async actions retain their loading labels.
Links use anchors; actions use buttons. Tabs, selectors and gameplay controls
retain their own semantics and layout.

Public profile and game-catalog account forms opt into the same styles through
their host selectors. Embedded game account forms keep their game theme.
The Adept certificate overrides only the palette tokens for its dark red surface.

Navigation groups: Teachings (Manifesto, Guide), Practice (Tools, Incubator),
Games, Chronicle (Blog, Clutch Book, Events), Boutique. Profile, Initiation and
RU/EN remain available in the utility area. Mobile navigation opens in document
flow; Escape returns focus to the menu button. Desktop groups are native details:
mouse hover reveals their links, while click, keyboard and touch remain supported.
Escape dismisses an open group and returns focus to its summary.

Tools retain their state while visitors follow links to `#calculator`, `#oracle`,
`#tasting-note`, `#descriptors` and `#egg-persona`; navigation never remounts them.
