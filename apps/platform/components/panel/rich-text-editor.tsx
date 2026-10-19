"use client";

import { $isLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { HorizontalRuleNode, INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode";
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { $createHeadingNode, $createQuoteNode, $isHeadingNode, $isQuoteNode, HeadingNode, QuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  createEditor,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  type EditorState,
  type LexicalEditor,
  type TextFormatType,
} from "lexical";
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { lexicalToPlainText } from "@/lib/blog-text";
import { countWords, readingMinutes } from "@/lib/blog-text-stats";
import {
  BulletListGlyph,
  CollapseGlyph,
  DividerGlyph,
  ExpandGlyph,
  LinkGlyph,
  NumberListGlyph,
  QuoteGlyph,
  RedoGlyph,
  UndoGlyph,
} from "./blog-editor/icons";
import { Dropdown, type DropdownOption } from "./blog-editor/dropdown";

/**
 * A serialized Lexical editor state with a single empty paragraph — what a post with no body yet (or a freshly
 * mounted editor whose `initialValue` was `null`) starts from. Kept as a literal here rather than importing
 * `blog/actions.ts`'s `EMPTY_BODY` (a server-only-adjacent module this client component shouldn't pull in) — the
 * two are required to describe the same shape, and `blog/actions.ts`'s own comment says so.
 */
export const EMPTY_STATE_JSON = JSON.stringify({
  root: {
    type: "root",
    format: "",
    indent: 0,
    version: 1,
    direction: null,
    children: [{ type: "paragraph", format: "", indent: 0, version: 1, direction: null, children: [] }],
  },
});

function initialEditorStateJson(initialValue: unknown): string {
  if (initialValue === null || initialValue === undefined) return EMPTY_STATE_JSON;
  try {
    const json = JSON.stringify(initialValue);
    return json === undefined ? EMPTY_STATE_JSON : json;
  } catch {
    return EMPTY_STATE_JSON;
  }
}

/** Nodes this editor's toolbar can produce — kept as one list, since both the real `LexicalComposer` below and
 * `canLoadEditorState`'s trial editor must register exactly the same set for the trial to predict the real mount
 * correctly. Every one is also a node Payload's default `lexicalEditor()` registers, and one lib/blog-html.ts
 * renders. */
const EDITOR_NODES = [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, HorizontalRuleNode];

/**
 * A defensive try/catch around the same two-step load `@lexical/react/LexicalComposer` performs internally
 * (`editor.parseEditorState(json)` then `editor.setEditorState(...)`), run here against a disposable, unmounted
 * editor before the real one ever exists. A `root` whose children reference a node type this editor doesn't register
 * parses "successfully" with that node silently dropped, then fails Lexical's own "the editor state is empty"
 * invariant at `setEditorState`. Checking ahead means a bad `initialValue` never reaches `LexicalComposer` at all —
 * Next's App Router reports a page as a 500 the moment any render-time error is logged, even one a boundary caught.
 */
function canLoadEditorState(json: string): boolean {
  try {
    const trialEditor = createEditor({
      namespace: "brandbasket-blog-body-trial",
      nodes: EDITOR_NODES,
      onError: () => {
        // This trial only asks "would mounting throw" — nothing here needs a real handler.
      },
    });
    trialEditor.setEditorState(trialEditor.parseEditorState(json));
    return true;
  } catch {
    return false;
  }
}

function initialWordCount(json: string): number {
  try {
    return countWords(lexicalToPlainText(JSON.parse(json)));
  } catch {
    return 0;
  }
}

type BlockType = "paragraph" | "h2" | "h3" | "quote" | "bullet" | "number";

const BLOCK_LABELS: Readonly<Record<BlockType, string>> = {
  paragraph: "Paragraph",
  h2: "Heading",
  h3: "Subheading",
  quote: "Quote",
  bullet: "Bulleted list",
  number: "Numbered list",
};

const BLOCK_OPTIONS: readonly DropdownOption[] = (Object.keys(BLOCK_LABELS) as BlockType[]).map((type) => ({
  value: type,
  label: BLOCK_LABELS[type],
}));

/** What the toolbar shows as "on" for the current selection. */
interface ToolbarState {
  readonly blockType: BlockType;
  readonly formats: ReadonlySet<TextFormatType>;
  readonly isLink: boolean;
  readonly linkUrl: string;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

const INITIAL_TOOLBAR: ToolbarState = {
  blockType: "paragraph",
  formats: new Set(),
  isLink: false,
  linkUrl: "",
  canUndo: false,
  canRedo: false,
};

const TRACKED_FORMATS: readonly TextFormatType[] = ["bold", "italic", "underline"];

/** Reads the selection's block, formats and link. Must run inside `editorState.read`. */
function $readSelectionState(): Omit<ToolbarState, "canUndo" | "canRedo"> | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;

  const anchor = selection.anchor.getNode();
  // A list item's top-level element is its outermost list, which is what the style menu shows.
  const topLevel = $isRootOrShadowRoot(anchor) ? null : anchor.getTopLevelElement();
  let blockType: BlockType = "paragraph";
  if ($isListNode(topLevel)) blockType = topLevel.getListType() === "number" ? "number" : "bullet";
  else if ($isHeadingNode(topLevel)) {
    const tag = topLevel.getTag();
    blockType = tag === "h3" ? "h3" : "h2";
  } else if ($isQuoteNode(topLevel)) blockType = "quote";

  const parent = anchor.getParent();
  const link = $isLinkNode(anchor) ? anchor : $isLinkNode(parent) ? parent : null;

  return {
    blockType,
    formats: new Set(TRACKED_FORMATS.filter((format) => selection.hasFormat(format))),
    isLink: link !== null,
    linkUrl: link === null ? "" : link.getURL(),
  };
}

/** "example.com" → "https://example.com". Anything with another scheme is refused: sites only render http(s) links. */
function normaliseLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  readonly label: string;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()} // keeps the editor's text selection intact while clicking
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg text-ink-soft transition-colors duration-200 ease-calm hover:bg-paper-deep hover:text-ink disabled:pointer-events-none disabled:opacity-35",
        active && "bg-accent-pale text-accent-deep",
      )}
    >
      {children}
    </button>
  );
}

function Separator(): ReactElement {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line" />;
}

function useToolbarState(editor: LexicalEditor): ToolbarState {
  const [state, setState] = useState<ToolbarState>(INITIAL_TOOLBAR);

  useEffect(() => {
    const unregisterUpdate = editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selectionState = $readSelectionState();
        if (selectionState !== null) setState((current) => ({ ...current, ...selectionState }));
      });
    });
    const unregisterUndo = editor.registerCommand(
      CAN_UNDO_COMMAND,
      (canUndo: boolean) => {
        setState((current) => ({ ...current, canUndo }));
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    const unregisterRedo = editor.registerCommand(
      CAN_REDO_COMMAND,
      (canRedo: boolean) => {
        setState((current) => ({ ...current, canRedo }));
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    return () => {
      unregisterUpdate();
      unregisterUndo();
      unregisterRedo();
    };
  }, [editor]);

  return state;
}

function LinkBar({
  initialUrl,
  isLink,
  onApply,
  onRemove,
  onClose,
}: {
  readonly initialUrl: string;
  readonly isLink: boolean;
  readonly onApply: (url: string) => void;
  readonly onRemove: () => void;
  readonly onClose: () => void;
}): ReactElement {
  const [value, setValue] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);

  function apply(): void {
    const url = normaliseLinkUrl(value);
    if (url === null) {
      setError("Use a web address, like example.com/page.");
      return;
    }
    onApply(url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line/70 px-3 py-2">
      <LinkGlyph className="size-4 text-ink-soft" />
      <input
        aria-label="Link address"
        value={value}
        autoFocus
        placeholder="example.com/page"
        spellCheck={false}
        autoCapitalize="none"
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            apply();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        className="min-w-0 flex-1 bg-transparent py-1 text-sm text-ink outline-none placeholder:text-ink-soft/70"
      />
      <button type="button" onClick={apply} className="text-sm font-semibold text-accent-deep hover:text-ink">
        {isLink ? "Update" : "Add link"}
      </button>
      {isLink ? (
        <button type="button" onClick={onRemove} className="text-sm text-ink-soft hover:text-ink">
          Remove
        </button>
      ) : null}
      <button type="button" onClick={onClose} className="text-sm text-ink-soft hover:text-ink">
        Cancel
      </button>
      {error === null ? null : (
        <p role="alert" className="basis-full text-xs text-accent-deep">
          {error}
        </p>
      )}
    </div>
  );
}

function Toolbar({
  fullscreen,
  onToggleFullscreen,
}: {
  readonly fullscreen: boolean;
  readonly onToggleFullscreen: () => void;
}): ReactElement {
  const [editor] = useLexicalComposerContext();
  const state = useToolbarState(editor);
  const [linkOpen, setLinkOpen] = useState(false);

  const setBlock = useCallback(
    (type: BlockType) => {
      if (type === "bullet") {
        editor.dispatchCommand(
          state.blockType === "bullet" ? REMOVE_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND,
          undefined,
        );
        return;
      }
      if (type === "number") {
        editor.dispatchCommand(
          state.blockType === "number" ? REMOVE_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND,
          undefined,
        );
        return;
      }
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        if (type === "paragraph") $setBlocksType(selection, () => $createParagraphNode());
        else if (type === "quote") $setBlocksType(selection, () => $createQuoteNode());
        else $setBlocksType(selection, () => $createHeadingNode(type));
      });
    },
    [editor, state.blockType],
  );

  const format = (value: TextFormatType): void => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, value);
  };

  return (
    <div className="sticky top-0 z-10 rounded-t-card border-b border-line/70 bg-card/95 backdrop-blur">
      <div className="flex items-center gap-0.5 overflow-x-auto px-2 py-1.5 [scrollbar-width:none]">
        <ToolbarButton label="Undo" disabled={!state.canUndo} onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}>
          <UndoGlyph />
        </ToolbarButton>
        <ToolbarButton label="Redo" disabled={!state.canRedo} onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}>
          <RedoGlyph />
        </ToolbarButton>
        <Separator />
        <Dropdown
          ariaLabel="Text style"
          variant="toolbar"
          keepFocus
          value={state.blockType}
          options={BLOCK_OPTIONS}
          onChange={(type) => setBlock(type as BlockType)}
        />
        <Separator />
        <ToolbarButton label="Bold" active={state.formats.has("bold")} onClick={() => format("bold")}>
          <span className="text-sm font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton label="Italic" active={state.formats.has("italic")} onClick={() => format("italic")}>
          <span className="font-serif text-sm italic">I</span>
        </ToolbarButton>
        <ToolbarButton label="Underline" active={state.formats.has("underline")} onClick={() => format("underline")}>
          <span className="text-sm underline underline-offset-2">U</span>
        </ToolbarButton>
        <Separator />
        <ToolbarButton label="Link" active={state.isLink || linkOpen} onClick={() => setLinkOpen((open) => !open)}>
          <LinkGlyph />
        </ToolbarButton>
        <ToolbarButton label="Bulleted list" active={state.blockType === "bullet"} onClick={() => setBlock("bullet")}>
          <BulletListGlyph />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" active={state.blockType === "number"} onClick={() => setBlock("number")}>
          <NumberListGlyph />
        </ToolbarButton>
        <ToolbarButton label="Quote" active={state.blockType === "quote"} onClick={() => setBlock(state.blockType === "quote" ? "paragraph" : "quote")}>
          <QuoteGlyph />
        </ToolbarButton>
        <ToolbarButton
          label="Divider"
          onClick={() => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)}
        >
          <DividerGlyph />
        </ToolbarButton>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="ml-2 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-semibold text-ink-soft transition-colors duration-200 ease-calm hover:bg-paper-deep hover:text-ink"
        >
          {fullscreen ? <CollapseGlyph className="size-3.5" /> : <ExpandGlyph className="size-3.5" />}
          {fullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </div>
      {linkOpen ? (
        <LinkBar
          // Remounts with the current link's address each time the bar opens on a different link.
          key={state.linkUrl}
          initialUrl={state.linkUrl}
          isLink={state.isLink}
          onApply={(url) => {
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
            setLinkOpen(false);
          }}
          onRemove={() => {
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
            setLinkOpen(false);
          }}
          onClose={() => setLinkOpen(false)}
        />
      ) : null}
    </div>
  );
}

interface BodyEditorBoundaryProps {
  readonly onCrash: () => void;
  readonly children: ReactNode;
}

interface BodyEditorBoundaryState {
  readonly crashed: boolean;
}

/**
 * Catches a throw from `LexicalComposer` mounting a bad `editorState` that `canLoadEditorState` did not predict, so
 * the customer can still reach this page's other fields and its Publish/Unpublish/Delete buttons. A class component
 * because React error boundaries still require one; there is no hook equivalent.
 */
class BodyEditorErrorBoundary extends Component<BodyEditorBoundaryProps, BodyEditorBoundaryState> {
  constructor(props: BodyEditorBoundaryProps) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError(): BodyEditorBoundaryState {
    return { crashed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("Blog body editor failed to load a saved post body:", error);
    this.props.onCrash();
  }

  render(): ReactNode {
    if (this.state.crashed) return null; // the parent renders the visible fallback message instead
    return this.props.children;
  }
}

export interface RichTextEditorProps {
  /** A Lexical `SerializedEditorState` (from `lib/server/blog.ts`'s `BlogPost.body`), or `null`/`undefined` for a
   * fresh, empty post. Read once, at mount. */
  readonly initialValue: unknown;
  /** Called with the serialized document after every edit (not on selection moves). */
  readonly onChange: (json: string) => void;
  readonly placeholder?: string;
}

const EDITOR_THEME = {
  paragraph: "mb-4 last:mb-0",
  heading: {
    h2: "mb-3 mt-8 font-serif text-[1.65rem] leading-tight first:mt-0",
    h3: "mb-2 mt-6 font-serif text-xl leading-snug first:mt-0",
  },
  quote: "my-5 border-l-2 border-accent/50 pl-4 font-serif text-lg italic text-ink-soft",
  list: {
    ul: "mb-4 list-disc pl-6",
    ol: "mb-4 list-decimal pl-6",
    listitem: "mb-1.5",
  },
  hr: "my-6 border-line",
  link: "text-accent-deep underline decoration-accent/40 underline-offset-2",
  text: {
    bold: "font-semibold",
    italic: "italic",
    underline: "underline",
  },
} as const;

/**
 * The post body editor, built directly on the `lexical`/`@lexical/react` engine that Payload's own `richText` field
 * (collections/BlogPosts.ts) uses under the hood — not Payload's admin field component, which needs Payload's admin
 * app around it; customers never open Payload's admin. It serializes to exactly the `SerializedEditorState` shape
 * Payload stores, so what `editorState.toJSON()` produces here is what gets written.
 *
 * Registers only the node types its toolbar produces (EDITOR_NODES, plus Lexical's paragraph/text/linebreak/root),
 * each one lib/blog-html.ts turns into HTML for the client's website.
 *
 * `initialValue` is checked with `canLoadEditorState` before mounting: a body that fails renders a plain message in
 * the editor's place and reports an empty body, so the rest of the page keeps working and saving starts the body
 * fresh. `BodyEditorErrorBoundary` is a second layer for any unanticipated throw.
 */
export function RichTextEditor({ initialValue, onChange, placeholder = "Start writing…" }: RichTextEditorProps): ReactElement {
  // Computed once per mount: the editor owns its own state after that, and a later prop change (e.g. a save that
  // echoes back slightly different data) should not yank the customer's in-progress edit out from under them.
  const initialJson = useMemo(() => initialEditorStateJson(initialValue), [initialValue]);
  const contentLoadable = useMemo(() => canLoadEditorState(initialJson), [initialJson]);
  const [loadFailed, setLoadFailed] = useState(!contentLoadable);
  const [fullscreen, setFullscreen] = useState(false);
  // Counted from the saved body to begin with, then from the editor on every edit.
  const [words, setWords] = useState(() => (contentLoadable ? initialWordCount(initialJson) : 0));
  // The latest onChange, so the editor's own listeners (registered once) never call a stale one.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!contentLoadable) onChangeRef.current(EMPTY_STATE_JSON);
  }, [contentLoadable]);

  useEffect(() => {
    if (!fullscreen) return;
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") setFullscreen(false);
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreen]);

  const initialConfig = useMemo(
    () => ({
      namespace: "brandbasket-blog-body",
      theme: EDITOR_THEME,
      onError(error: Error): void {
        // The editor degrades gracefully (content just stops updating); logging is enough here.
        console.error("Blog body editor error:", error);
      },
      nodes: EDITOR_NODES,
      editorState: initialJson,
    }),
    [initialJson],
  );

  const handleChange = useCallback((editorState: EditorState) => {
    onChangeRef.current(JSON.stringify(editorState.toJSON()));
    editorState.read(() => setWords(countWords($getRoot().getTextContent())));
  }, []);

  const handleCrash = useCallback(() => {
    setLoadFailed(true);
    onChangeRef.current(EMPTY_STATE_JSON);
  }, []);

  if (loadFailed) {
    return (
      <p role="alert" className="rounded-card border border-line bg-card px-5 py-4 text-sm text-ink-soft">
        This post’s content couldn’t be loaded here. You can still edit everything else and publish, unpublish or delete
        it. Saving now will start the post body fresh.
      </p>
    );
  }

  const minutes = readingMinutes(words);

  return (
    <div
      className={cn(
        fullscreen
          ? "fixed inset-0 z-50 overflow-y-auto bg-paper px-4 py-6 sm:px-10"
          : "rounded-card border border-line bg-card",
      )}
    >
      <div className={cn(fullscreen && "mx-auto max-w-3xl rounded-card border border-line bg-card")}>
        <BodyEditorErrorBoundary onCrash={handleCrash}>
          <LexicalComposer initialConfig={initialConfig}>
            <Toolbar fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen((value) => !value)} />
            <div className="relative">
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    aria-label="Post body"
                    className={cn(
                      "block px-5 py-5 text-[1.0625rem] leading-relaxed text-ink focus:outline-none sm:px-7",
                      fullscreen ? "min-h-[70vh]" : "min-h-[380px]",
                    )}
                  />
                }
                placeholder={
                  <div className="pointer-events-none absolute left-5 top-5 text-[1.0625rem] text-ink-soft/70 sm:left-7">
                    {placeholder}
                  </div>
                }
                ErrorBoundary={LexicalErrorBoundary}
              />
              <HistoryPlugin />
              <ListPlugin />
              <LinkPlugin />
              <HorizontalRulePlugin />
              <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
            </div>
          </LexicalComposer>
        </BodyEditorErrorBoundary>
        <p className="flex justify-end gap-3 border-t border-line/70 px-5 py-2 text-xs tabular-nums text-ink-soft sm:px-7">
          <span>{words === 1 ? "1 word" : `${words} words`}</span>
          <span aria-hidden="true">·</span>
          <span>{minutes} min read</span>
        </p>
      </div>
    </div>
  );
}
