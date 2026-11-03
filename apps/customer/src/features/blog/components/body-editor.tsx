"use client";

import { $isLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { $isListNode, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, ListItemNode, ListNode, REMOVE_LIST_COMMAND } from "@lexical/list";
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
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatQuantity } from "@/lib/format";
import { Banner, Button, Icon, Input, type IconName } from "@/ui";
import { cx } from "@/ui/cx";
import { countWords, EMPTY_BODY_JSON, lexicalToPlainText, readingMinutes } from "../rules/body";

/*
 * The post body editor, on the same `lexical` engine Payload's richText field uses, so what `editorState.toJSON()` gives is
 * what Payload stores. Ported from apps/platform components/panel/rich-text-editor.tsx with a new toolbar. It registers only
 * the nodes its toolbar makes (paragraphs, two heading levels, quotes, dividers, both list types, links, bold, italic,
 * underline): exactly the grammar the platform renders for client sites.
 */

const EDITOR_NODES = [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, HorizontalRuleNode];

/**
 * Tries the stored body on a throwaway editor first. A body naming a node this editor does not register would otherwise
 * fail inside LexicalComposer, and a render-time error fails the whole page.
 */
function canLoad(json: string): boolean {
  try {
    const trial = createEditor({ namespace: "blog-body-trial", nodes: EDITOR_NODES, onError: () => undefined });
    trial.setEditorState(trial.parseEditorState(json));
    return true;
  } catch {
    return false;
  }
}

type BlockType = "paragraph" | "h2" | "h3" | "quote" | "bullet" | "number";

interface ToolbarState {
  readonly blockType: BlockType;
  readonly formats: ReadonlySet<TextFormatType>;
  readonly linkUrl: string | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

const TRACKED_FORMATS: readonly TextFormatType[] = ["bold", "italic", "underline"];

/** The selection's block, formats and link. Runs inside `editorState.read`. */
function $readSelection(): Pick<ToolbarState, "blockType" | "formats" | "linkUrl"> | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const anchor = selection.anchor.getNode();
  const top = $isRootOrShadowRoot(anchor) ? null : anchor.getTopLevelElement();
  let blockType: BlockType = "paragraph";
  if ($isListNode(top)) blockType = top.getListType() === "number" ? "number" : "bullet";
  else if ($isHeadingNode(top)) blockType = top.getTag() === "h3" ? "h3" : "h2";
  else if ($isQuoteNode(top)) blockType = "quote";
  const parent = anchor.getParent();
  const link = $isLinkNode(anchor) ? anchor : $isLinkNode(parent) ? parent : null;
  return { blockType, formats: new Set(TRACKED_FORMATS.filter((format) => selection.hasFormat(format))), linkUrl: link === null ? null : link.getURL() };
}

/** "example.com" becomes "https://example.com". Anything with another scheme is refused: sites only render http(s) links. */
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

function useToolbarState(editor: LexicalEditor): ToolbarState {
  const [state, setState] = useState<ToolbarState>({ blockType: "paragraph", formats: new Set(), linkUrl: null, canUndo: false, canRedo: false });
  useEffect(() => {
    const offUpdate = editor.registerUpdateListener(({ editorState }) =>
      editorState.read(() => {
        const read = $readSelection();
        if (read !== null) setState((current) => ({ ...current, ...read }));
      }),
    );
    const offUndo = editor.registerCommand(CAN_UNDO_COMMAND, (canUndo: boolean) => (setState((current) => ({ ...current, canUndo })), false), COMMAND_PRIORITY_LOW);
    const offRedo = editor.registerCommand(CAN_REDO_COMMAND, (canRedo: boolean) => (setState((current) => ({ ...current, canRedo })), false), COMMAND_PRIORITY_LOW);
    return () => {
      offUpdate();
      offUndo();
      offRedo();
    };
  }, [editor]);
  return state;
}

/** A toolbar button. Pressing it keeps the text selection where it was. */
function ToolButton({ icon, label, active = false, disabled = false, onPress }: { readonly icon: IconName; readonly label: string; readonly active?: boolean; readonly disabled?: boolean; readonly onPress: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      className={cx(
        "grid size-8 shrink-0 place-items-center rounded-control text-ink-2 transition-colors duration-100 hover:bg-surface-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-ring disabled:text-ink-disabled",
        active && "bg-accent-wash text-accent-text",
      )}
    >
      <Icon name={icon} size="sm" />
    </button>
  );
}

const Divider = () => <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />;

function LinkBar({ initialUrl, onApply, onRemove, onClose }: { readonly initialUrl: string | null; readonly onApply: (url: string) => void; readonly onRemove: () => void; readonly onClose: () => void }) {
  const [value, setValue] = useState(initialUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const apply = () => {
    const url = normaliseLinkUrl(value);
    if (url === null) setError("Use a web address, like example.com/page.");
    else onApply(url);
  };
  return (
    <div className="flex flex-col gap-1.5 border-t border-border-subtle px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Link address"
          value={value}
          autoFocus
          spellCheck={false}
          autoCapitalize="none"
          className="min-w-0 flex-1"
          onChange={(event) => {
            setValue(event.currentTarget.value);
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
        />
        <Button size="sm" variant="primary" onClick={apply}>
          {initialUrl === null ? "Add link" : "Update"}
        </Button>
        {initialUrl === null ? null : (
          <Button size="sm" onClick={onRemove}>
            Remove
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
      {error === null ? null : (
        <p role="alert" className="type-meta text-neg-text">
          {error}
        </p>
      )}
    </div>
  );
}

function Toolbar({ readOnly }: { readonly readOnly: boolean }) {
  const [editor] = useLexicalComposerContext();
  const state = useToolbarState(editor);
  const [linkOpen, setLinkOpen] = useState(false);

  const setBlock = (type: BlockType) => {
    if (type === "bullet" || type === "number") {
      const insert = type === "bullet" ? INSERT_UNORDERED_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND;
      editor.dispatchCommand(state.blockType === type ? REMOVE_LIST_COMMAND : insert, undefined);
      return;
    }
    // Pressing the style the text already has turns it back into a paragraph.
    const next = state.blockType === type ? "paragraph" : type;
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      $setBlocksType(selection, () => (next === "paragraph" ? $createParagraphNode() : next === "quote" ? $createQuoteNode() : $createHeadingNode(next)));
    });
  };
  const format = (value: TextFormatType) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, value);

  if (readOnly) return null;
  return (
    <div className="sticky top-0 z-10 border-b border-border-subtle bg-surface">
      <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5 overflow-x-auto px-2 py-1.5">
        <ToolButton icon="ArrowCounterClockwise" label="Undo" disabled={!state.canUndo} onPress={() => editor.dispatchCommand(UNDO_COMMAND, undefined)} />
        <ToolButton icon="ArrowClockwise" label="Redo" disabled={!state.canRedo} onPress={() => editor.dispatchCommand(REDO_COMMAND, undefined)} />
        <Divider />
        <ToolButton icon="TextHTwo" label="Heading" active={state.blockType === "h2"} onPress={() => setBlock("h2")} />
        <ToolButton icon="TextHThree" label="Subheading" active={state.blockType === "h3"} onPress={() => setBlock("h3")} />
        <ToolButton icon="Quotes" label="Quote" active={state.blockType === "quote"} onPress={() => setBlock("quote")} />
        <Divider />
        <ToolButton icon="TextB" label="Bold" active={state.formats.has("bold")} onPress={() => format("bold")} />
        <ToolButton icon="TextItalic" label="Italic" active={state.formats.has("italic")} onPress={() => format("italic")} />
        <ToolButton icon="TextUnderline" label="Underline" active={state.formats.has("underline")} onPress={() => format("underline")} />
        <ToolButton icon="Link" label="Link" active={state.linkUrl !== null || linkOpen} onPress={() => setLinkOpen((open) => !open)} />
        <Divider />
        <ToolButton icon="ListBullets" label="Bulleted list" active={state.blockType === "bullet"} onPress={() => setBlock("bullet")} />
        <ToolButton icon="ListNumbers" label="Numbered list" active={state.blockType === "number"} onPress={() => setBlock("number")} />
        <ToolButton icon="Minus" label="Divider" onPress={() => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)} />
      </div>
      {linkOpen ? (
        <LinkBar
          // Opens again with the current link's address each time it opens on a different link.
          key={state.linkUrl ?? ""}
          initialUrl={state.linkUrl}
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

/** A second layer for a throw `canLoad` did not predict, so the rest of the editor keeps working. */
class BodyBoundary extends Component<{ readonly onCrash: () => void; readonly children: ReactNode }, { readonly crashed: boolean }> {
  constructor(props: { readonly onCrash: () => void; readonly children: ReactNode }) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError(): { readonly crashed: boolean } {
    return { crashed: true };
  }

  override componentDidCatch(): void {
    this.props.onCrash();
  }

  override render(): ReactNode {
    return this.state.crashed ? null : this.props.children;
  }
}

const THEME = {
  paragraph: "mb-4 last:mb-0",
  heading: { h2: "mt-8 mb-3 type-title first:mt-0", h3: "mt-6 mb-2 type-section first:mt-0" },
  quote: "my-5 border-l-2 border-border-control pl-4 text-ink-2 italic",
  list: { ul: "mb-4 list-disc pl-6", ol: "mb-4 list-decimal pl-6", listitem: "mb-1.5" },
  hr: "my-6 border-border",
  link: "text-accent-text underline underline-offset-2",
  text: { bold: "font-semibold", italic: "italic", underline: "underline" },
} as const;

export interface BodyEditorProps {
  /** The stored body as JSON (rules/body.ts bodyJsonOf). Read once, at mount. */
  readonly initialJson: string;
  /** Called with the document's JSON after every edit, not on selection moves. */
  readonly onChange: (json: string) => void;
  readonly readOnly?: boolean;
}

/** The body: toolbar, writing area, and the word count with reading time underneath. */
export function BodyEditor({ initialJson, onChange, readOnly = false }: BodyEditorProps) {
  const loadable = useMemo(() => canLoad(initialJson), [initialJson]);
  const [failed, setFailed] = useState(!loadable);
  // Counted from the stored body to begin with (the change listener skips the initial load), then on every edit.
  const [words, setWords] = useState(() => (loadable ? countWords(lexicalToPlainText(JSON.parse(initialJson))) : 0));
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  // A body that cannot load reports the empty body, so saving starts it fresh and the rest of the post still saves.
  useEffect(() => {
    if (!loadable) onChangeRef.current(EMPTY_BODY_JSON);
  }, [loadable]);

  const initialConfig = useMemo(
    () => ({ namespace: "blog-body", theme: THEME, nodes: EDITOR_NODES, editorState: initialJson, editable: !readOnly, onError: (error: Error) => console.error("Blog body editor:", error) }),
    [initialJson, readOnly],
  );
  const handleChange = useCallback((editorState: EditorState) => {
    onChangeRef.current(JSON.stringify(editorState.toJSON()));
    editorState.read(() => setWords(countWords($getRoot().getTextContent())));
  }, []);
  const handleCrash = useCallback(() => {
    setFailed(true);
    onChangeRef.current(EMPTY_BODY_JSON);
  }, []);

  if (failed) {
    return (
      <Banner tone="warn">
        This post&apos;s text could not be opened here. You can still change everything else, and publish, unpublish or delete it. Saving now starts the
        text fresh.
      </Banner>
    );
  }

  return (
    <div className="overflow-hidden rounded-control border border-border-control">
      <BodyBoundary onCrash={handleCrash}>
        <LexicalComposer initialConfig={initialConfig}>
          <Toolbar readOnly={readOnly} />
          <div className="relative">
            <RichTextPlugin
              contentEditable={<ContentEditable aria-label="Post text" className="block min-h-80 px-4 py-4 type-body text-ink focus:outline-none" />}
              placeholder={<div className="pointer-events-none absolute top-4 left-4 type-body text-ink-muted">Start writing</div>}
              ErrorBoundary={LexicalErrorBoundary}
            />
            <HistoryPlugin />
            <ListPlugin />
            <LinkPlugin />
            <HorizontalRulePlugin />
            <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
          </div>
        </LexicalComposer>
      </BodyBoundary>
      <p className="flex justify-end border-t border-border-subtle px-4 py-2 type-meta">
        {formatQuantity(words, "word")}, {readingMinutes(words)} min read
      </p>
    </div>
  );
}
