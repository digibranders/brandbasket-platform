# Console v2 patterns: spec notes

Package CR-A4. Companion to `mock-console-v2-patterns.html` (the living page). Source: `docs/implementation/CONSOLE-REDESIGN-PLAN.md` sections 3, 4 and 5.2 with the owner's defaults CD-1 to CD-21 approved. Binding: `05-PREMIUM-DESIGN-LANGUAGE.md`. Nothing here changes code. Build agents read this with the mock when they start CR-00 and CR-01.

Rule used throughout: no data source, no element. Business names are `<business>`.

## 1. What the page shows

Eight patterns (DataTable, RowActions, SidePanel, FilterBar, InlineEdit, Toast, BulkBar, CommandBar) plus the confirm dialog and the shortcut help, each in default, hover or focus, loading, empty, error, selected and disabled where the state applies. A width switch shows 1440 and 390 (the specimens use container queries, so the 390 layout is the real phone layout, not a scaled copy). A "Try it" block under each of DataTable, InlineEdit, Toast and CommandBar is live: a three row table you can drive with `j k x Enter e`, a real panel, a real undo toast, and a real `Ctrl K` command bar. The page also checks reduced motion: with the system setting on, no animation runs.

The page uses a white bordered secondary button because `05` section 3 specifies it. See open question 2.

## 2. Keyboard map

Principles (CD-9):

1. Single key shortcuts fire only when focus is not in an input, textarea, select or editable element, and no dialog is open. They never use a modifier except `Ctrl K` and `Cmd K`.
2. No shortcut deletes or sends anything on its own. A verb that emails the customer opens its confirm first (see section 3).
3. `Esc` always closes the top layer, one layer per press: toast focus, menu, dialog, command bar, side panel, selection.
4. Every shortcut has a visible button that does the same thing. The keys are speed, never the only way.
5. `?` opens the help dialog listing every shortcut that applies on the current screen, grouped Lists, Go to, Anywhere. It is a native `<dialog>`. The help is built from the same registry the handlers use, so the two cannot drift.
6. Shortcuts are scoped to a region. `j k Enter e x` act on the list that holds the keyboard cursor; a screen with two lists (Today has the table and the Calls card) uses the table.

### Global

| Key | Does | Notes |
|---|---|---|
| `Ctrl K` or `Cmd K` | Open or close the command bar | Works from inside a field too (the one exception to rule 1) |
| `?` | Open the shortcut help | Not while typing |
| `Esc` | Close the top layer | Order: toast with focus, menu, dialog or command bar, side panel, selection |
| `g` then `t` / `c` / `i` / `m` / `o` / `s` | Go to Today, Clients, Inbox, Money, Compliance, System | Two key sequence, the second key within 1.2 seconds. The plan lists `g t c i m`; `o` and `s` are added so the six rail items all have a key (Compliance is `o` because `c` is Clients) |
| `/` | Focus the filter search on the current list | |
| `u` | Undo the newest toast that carries Undo, while it is visible | Added here; not in the plan. See open question 4 |

### Lists (DataTable, FilterBar, BulkBar)

| Key | Does |
|---|---|
| `j` / `k` or `Down` / `Up` | Move the row cursor |
| `Enter` | Open the cursor row in the side panel |
| `e` | Run the row's one verb (confirm first if it emails the customer) |
| `x` or `Space` | Select or clear the cursor row |
| `Shift` with `j` / `k` | Extend the selection |
| `Ctrl A` or `Cmd A` | Select every row in the current filter (table focused) |
| `.` or `Shift F10` | Open the row menu (right click does the same) |
| `Esc` | Clear the selection |

### Side panel

`Enter` on a row opens it and moves focus to its heading. `Esc` closes it and returns focus to the opening row. `j` and `k` with focus outside a field step to the next or previous row and swap the panel. `e` runs the panel's primary. On phone (scrim present) focus is trapped; on wide screens the panel is a complementary region and focus may leave it.

### Row menu (RowActions)

`Enter` or `Space` on the dots opens it, focus on the first enabled item. Arrow keys, `Home`, `End`, type-ahead. `Enter` runs the item. `Esc` or `Tab` closes and returns focus to the dots. Disabled items stay focusable so the reason can be read.

### Inline edit

`Enter` or click starts editing with the text selected. `Enter` saves, `Esc` cancels, `Tab` or blur saves. In a multi-line note `Ctrl Enter` saves.

### Command bar

Combobox pattern: focus stays in the input, `aria-activedescendant` points at the highlighted option. `Down` and `Up` wrap. `Enter` opens or runs. `Ctrl Enter` opens in a new tab. `Esc` clears the text, then closes. `>` first shows actions only, `#` first searches request references; `Backspace` on an empty field leaves the mode.

### Conflicts inside the keyboard map

| Item | Resolution |
|---|---|
| Plan S12 gives `c` as "close a support ticket with undo" and `n` as "new request"; the Today list uses `e` for the verb | Keep `e` as the one verb everywhere. On Inbox the row verb for an answered ticket is Close, so `e` does it. `c` is dropped to avoid a second key for the same act; `n` stays on Inbox only |
| `g c` (Clients) and Compliance both want `c` | Clients keeps `c`; Compliance is `g o` |
| `x` versus `Space` | Both select; `Space` only when the table itself has focus, so it never conflicts with pressing a button |

## 3. Confirm and undo rules

The rule from plan 3.2, restated as a decision table. The test is one question: did anything leave the building, or can money or data not come back?

| Action kind | Control | Examples | Undo | Email sent |
|---|---|---|---|---|
| Reversible and internal, no customer email | Do it, then Toast with Undo (10 seconds) | Enquiry status, support ticket status through `updateTicket`, app error status, internal note, owner rename, preview link edit, bulk "Mark contacted" | Yes, where a reverse action exists | No |
| Changes what the customer sees, or emails them | ConfirmDialog with a consequence line, then a plain Toast (4 seconds, no Undo) | Send setup link, send preview, mark live, send report, resend email, cancel build, public reply, change request moves (quote, start, done, decline) | No, it already left | Yes |
| Irreversible, no customer email | ConfirmDialog with consequence line | Close a privacy request or breach, switch off staff, delete a coupon code, restore or extend a closure | No | No |
| Moves or records money | ConfirmDialog plus a required first-person tick box naming the amount, then a plain Toast | Refund, manual refund, add charge, waive | No | Often |
| Never bulk | None | Anything that moves money | n/a | n/a |
| A question the system asks | PromptPopup, three outcomes plus Dismiss, repeats until answered | "Did the kickoff call with `<business>` happen?" | n/a | n/a |

Detail rules:

1. **Undo is offered only where a reverse action exists and nothing was emailed.** The toast names the object and Undo restores that object. A request whose state changed meanwhile (the customer replied) disables Undo and says why.
2. **Undo is not offered after a confirm.** The confirm is the safeguard; a toast Undo after an email would be a lie.
3. **No undo of an undo.** The confirming toast after an Undo has no Undo.
4. **Bulk follows the single rule.** "Mark contacted" on three enquiries is one toast: "Marked 3 contacted" with Undo restoring all three. "Send setup link" on three is one confirm that says "Send 3 setup links?". A partial failure is stated with numbers ("2 of 3 marked contacted, 1 failed") and the failed row stays selected.
5. **Confirm copy:** title is the action with its object ("Send setup link to `<business>`?"), one consequence sentence in ink-2, primary on the right named for the act (never "OK" or "Yes"), "Keep" as the cancel. The destructive variant uses the red primary and states what is lost.
6. **Never a modal for anything else.** Menus, panels and the command bar are not confirmations.
7. **Errors keep the input.** A failed send keeps the typed reply; a failed inline edit keeps the typed value and focus.
8. **Where an exact copy of an existing dialog exists, reuse it.** The refund dialog text is the one R2-09 shipped, true to the code.
9. **Timer behaviour:** the Undo countdown pauses on hover and on focus inside the toast. Errors do not time out. At most three toasts show; older ones collapse.

## 4. The three conflicts in plan 4.1, with a recommendation each

### 4.1.1 "Modals for confirmation" versus ConfirmDialog

Sources: `apps/admin/DESIGN.md` "Not allowed" lists "Modals for confirmation"; R2-09 shipped `ConfirmDialog` for refunds and destructive actions.

Recommendation: adopt the plan's ruling, with one sharpening. Allow a native `<dialog>` for confirmation only in the three rows of section 3 that are not "reversible and internal" (customer-emailing, irreversible, money). Every reversible internal change uses an Undo toast. Rewrite the "Not allowed" line in `DESIGN.md` to: "Modals for anything reversible. A native dialog is allowed only to confirm an action that emails the customer, moves money, or cannot be undone." Why: the line was written before refunds existed; the refund dialog is the safest thing the console does, and removing it to honour the line would make the console worse. Undo toasts also cost one click less than a confirm, so the rule makes the common work faster.

### 4.1.2 52px versus 44px rows

Sources: `05` section 3 Tables says 52px; section 8 Console variant says 44px.

Recommendation: 44px rows everywhere in the console, header 36px with 12px muted text, one density and no setting (CD-10). Compact 36px rows are allowed only for read-only registers where staff scan, never act: Invoices and Access log. Why: section 8 of `05` is the console-specific rule and overrides the general table rule; the Today list needs about 12 rows visible at 1440 by 900. The customer app keeps 52px. The mock uses 44px; the 36px compact row is not drawn because no screen needs it for a list with actions. On phone a row stays 44px high, but the type chip and icon tile drop so the name, age and verb fit at 390.

### 4.1.3 "One raised surface per screen" versus SidePanel

Source: `apps/admin/DESIGN.md` "Surfaces".

Recommendation: a SidePanel is an overlay layer, not a second raised surface. The list stays the one focal card; the panel sits over the page with the popover shadow `0 1px 2px rgba(42,28,16,.05), 0 12px 32px -12px rgba(42,28,16,.14)`. Write it into `DESIGN.md` as: "Overlay layers (side panel, menu, toast, command bar, dialog) are not raised surfaces." Add one more guard: only one overlay layer of each kind is open at once, and a panel never contains a second panel. Why: without this the redesign cannot have panels at all, and the rule's intent (one place to look) is kept because the panel is dismissed with `Esc` and shows the same row the list already highlights.

## 5. Component props proposals

For CR-01. All in `packages/shared/src/ui/patterns/`, extending existing class strings and components rather than replacing them (`table.ts`, `filter-pills.tsx`, `global-search.tsx`, the console `confirm-dialog.tsx`). TypeScript, no `any`, explicit return types. These are proposals; CR-01 checks `packages/shared/src/ui/panel` for overlap first.

```ts
// DataTable
type Column<Row> = {
  id: string;
  header: string;                    // 12px muted, sentence case
  cell: (row: Row) => ReactNode;
  align?: 'start' | 'end';           // 'end' for Mono figures and ages
  hideBelow?: 'sm';                  // drops the column at 390
  hidden?: boolean;                  // column choice, only for optional money columns
};
type DataTableProps<Row> = {
  label: string;                     // aria-label, required
  columns: Column<Row>[];
  rows: Row[];
  rowId: (row: Row) => string;
  primaryVerb?: (row: Row) => { label: string; onRun: () => void; confirm?: ConfirmCopy; disabled?: string };
  menu?: (row: Row) => RowActionItem[];
  selectable?: boolean;
  selectedIds?: ReadonlySet<string>;
  onSelectionChange?: (ids: ReadonlySet<string>) => void;
  openId?: string | null;            // the row whose panel is open (marker)
  onOpen?: (id: string) => void;
  groups?: { id: string; label: string; count: number }[];  // Today bands
  state: 'ready' | 'loading' | 'empty' | 'error';
  empty?: ReactNode;                 // an EmptyState
  error?: ReactNode;                 // an ErrorState with Try again
  isDisabledRow?: (row: Row) => string | null;  // reason text
};

// RowActions
type RowActionItem = {
  id: string;
  label: string;                     // plain verb
  icon?: ReactNode;
  onSelect: () => void;
  confirm?: ConfirmCopy;
  disabledReason?: string;           // item stays focusable and shows the reason
  destructive?: boolean;             // red, must be last
};
type RowActionsProps = {
  verb?: { label: string; onRun: () => void; busy?: boolean; disabledReason?: string };
  items: RowActionItem[];            // max 5, enforced by a dev assert
  busy?: boolean;
  menuLabel?: string;                // default "More actions"
};

// SidePanel
type SidePanelProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  state?: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  children: ReactNode;
  primary?: { label: string; onRun: () => void; disabledReason?: string; busy?: boolean };
  secondary?: ReactNode;
  returnFocusTo?: RefObject<HTMLElement>;
  urlParam?: string;                 // default 'open'
  onStep?: (dir: 1 | -1) => void;    // j and k while open
};

// FilterBar
type FilterOption = { id: string; label: string; count?: number | null; tone?: 'late' };  // null = count failed, shows "?"
type FilterBarProps = {
  options: FilterOption[];
  value: string;
  onChange: (id: string) => void;
  search?: { value: string; onChange: (v: string) => void; placeholder: string };
  echoes?: { id: string; label: string; onRemove: () => void }[];
  state?: 'ready' | 'loading' | 'error' | 'disabled';
  onRetry?: () => void;
  sticky?: boolean;                  // default true
};

// InlineEdit
type InlineEditProps = {
  label: string;
  value: string;
  onSave: (next: string) => Promise<{ ok: true; undo?: () => Promise<void> } | { ok: false; message: string }>;
  validate?: (next: string) => string | null;   // fix text, never a code
  multiline?: boolean;
  emptyLabel?: string;               // "Add a note only staff can see"
  readOnlyReason?: string;           // renders plain text plus hint
  inputMode?: 'text' | 'url';
};
// never accepts a money field; a lint rule (or a type brand) blocks it

// Toast
type ToastInput = {
  message: string;                   // names the object
  tone?: 'info' | 'error';
  undo?: () => Promise<void>;        // presence gives 10 seconds and the button
  retry?: () => void;
  durationMs?: number;               // default 4000, 10000 with undo, none for error
};
// useToast(): { show(input: ToastInput): string; dismiss(id: string): void }
// <ToastRegion /> mounted once in app/(protected)/layout.tsx, aria-live polite, errors assertive

// BulkBar
type BulkAction = {
  id: string;
  label: string;
  run: (ids: string[]) => Promise<{ done: number; failed: string[] }>;
  confirm?: (count: number) => ConfirmCopy;   // required when it emails customers
  undo?: (ids: string[]) => Promise<void>;
  disabledReason?: (ids: string[]) => string | null;
};
type BulkBarProps = { count: number; actions: BulkAction[]; onClear: () => void; busy?: boolean };
// move money actions are not accepted: BulkAction has no 'money' flag by design

// CommandBar
type CommandItem = {
  id: string;
  group: 'recent' | 'go' | 'action' | 'client' | 'enquiry' | 'request' | 'invoice' | 'payment' | 'email';
  title: string;
  subtitle?: string;                 // never an email body
  icon?: ReactNode;
  hint?: string;                     // 'g t', 'Logged export'
  href?: string;
  run?: () => void;
  disabledReason?: string;
  confirm?: ConfirmCopy;
};
type CommandBarProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  staticItems: CommandItem[];        // Go to and Actions, always available
  search: (term: string, mode: 'all' | 'actions' | 'requestRef') => Promise<CommandItem[]>;
  recent: CommandItem[];             // browser storage only, no server data
};

// Shared
type ConfirmCopy = { title: string; consequence: string; confirmLabel: string; cancelLabel?: 'Keep'; tickSentence?: string; tone?: 'default' | 'danger' };
// useShortcuts(registry): wires keys, skips fields and open dialogs, feeds ShortcutHelp
```

Notes for build agents:

- The shortcut registry is one module. The help dialog and the handlers read it.
- Keep `TR_SELECTED`, `TD_NUM` and the rest of `table.ts` as the single source of class strings. Selected row changes from the current ink marker to the gold wash plus a 3px gold marker; this is a deliberate change, call it out in the CR-01 report.
- Every pattern must read tokens only; no hex in components.
- The SidePanel keeps its own URL (`?open=`); closing removes the param without a reload.

## 6. Gold budget and finish check

Specimens are not product screens, but each pattern was kept inside the rule. The only gold on any pattern is the selected row (wash `#FBF4EA` and a 3px `#C48A47` marker), the "waiting" chip wash, and the match mark in command bar results (wash). On a real screen that is one selected row, a handful of wash chips, and the rail mark: stay at three gold accents (marker, rail mark, one count) and use the sunken wash for everything else. Link buttons are never underlined (they use a sunken hover). Focus is a 2px ink ring with 2px offset; on ink toasts the ring is white. Shadows are warm (`rgba(42,28,16,...)`). There are no gradients. Reduced motion removes the skeleton pulse, the panel slide, the dialog scale and the toast rise.

## 7. Open questions

1. **Bordered secondary buttons.** `apps/admin/DESIGN.md` says "Outlined secondary buttons or chips" are not allowed and secondary buttons are soft fills; `05` section 3 says secondary is white with a `#E3E0D9` border. The mock follows `05` for secondary buttons on white surfaces and uses a sunken soft fill (`btn soft`) where a button sits on paper. Recommend: fold into CR-00 as a fourth conflict, ruling that secondary is the white bordered button inside a raised surface and the soft fill on paper.
2. **Shadows other than the raised surface.** `DESIGN.md` says no shadows other than the raised surface. Panels, menus, toasts and the command bar need the popover shadow. Recommend the same sentence as conflict 3: overlay layers carry the popover shadow.
3. **Row verb and panel primary.** When a panel is open, the row verb stays secondary and the panel foot carries the only primary. Confirm this reading of "one primary per screen" with the owner at G2, or allow the row verb to hide while its panel is open.
4. **`u` as a global undo key.** It is not in plan 3 or CD-9. It makes the 10 second toast reachable without a pointer, but a stray `u` could undo something the person did not mean to. Recommend yes, scoped to a toast that is visible and names the object. If no, drop it and keep the Undo button reachable with `Tab`.
5. **Shift selection and Select all.** Shift extend and `Ctrl A` are small additions to CD-12's bulk set. Keep only if bulk selection is used on lists longer than about 20 rows; otherwise cut both.
6. **Compact 36px rows** for Invoices and Access log: not drawn in the mock. Needed? CR-A3 owns those screens.
7. **Toast length.** The language file says 4 seconds; the plan says 10 for Undo. Treated as 4 for plain and 10 for Undo, errors persist. Confirm errors persisting is acceptable on Today.
8. **Phone touch targets.** 44px buttons at 390 follow `05` section 3; the 36px rule is desktop only. Confirm the console phone view should use 44px (CD-13 limits phone to kickoff prompt, a reply and a payment check).
9. **`g` sequence vs screen readers.** Two key sequences are not discoverable. They exist in the help dialog and command bar hints. Consider dropping them if usability tests show they are unused.
10. **Right click menu on a row** can conflict with the browser menu for staff who copy text. Recommend opening the row menu on right click only on the dots column and on rows with no text selection.
11. **Mono for ids and ages**: the specimens use `#REQ-0000` and `INV-0000` as placeholders. Confirm real reference formats when CR-A3 draws Inbox and Invoices.
