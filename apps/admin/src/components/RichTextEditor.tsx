import { useEffect, useRef, useState } from 'react';
import { EditorContent, Extension, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { App, Button, Divider, Tooltip, Typography } from 'antd';
import {
  BoldOutlined,
  CodeOutlined,
  FilePdfOutlined,
  ItalicOutlined,
  LinkOutlined,
  OrderedListOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  ShopOutlined,
  StrikethroughOutlined,
  TableOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { brand } from '@/config/theme';
import { BusinessCardDialog, EmbedDialog, LinkDialog } from './editor/EmbedDialogs';
import { InsertImageDialog } from './editor/InsertImageDialog';
import { DocumentPickerDialog, type DocumentLink } from './editor/DocumentPickerDialog';
import { ArticleDocument, ArticleFigure, EmbedBlock, tidyPastedHtml, type EmbedAttributes, type FigureAttributes } from './editor/nodes';

interface Props {
  value: string;
  onChange: (html: string) => void;
  /** Disables editing while a save is in flight. */
  disabled?: boolean;
  ariaLabel?: string;
  minHeight?: number;
  /**
   * Change this to replace the editor's content with `value`, e.g. after
   * "Discard changes". Without it the editor only adopts `value` while empty,
   * so it never overwrites what someone is typing.
   */
  resetKey?: number;
}

/**
 * A plain library image, as older articles contain, named in the markup
 * (`data-media-id`) so the server can record that the article uses it (MED 004).
 */
const LibraryImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      mediaId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-media-id'),
        renderHTML: (attributes: { mediaId?: string | null }) => (attributes.mediaId ? { 'data-media-id': attributes.mediaId } : {}),
      },
    };
  },
});

const HEADING_LABELS: Record<2 | 3 | 4, string> = { 2: 'Heading', 3: 'Subheading', 4: 'Minor heading' };

interface ToolButtonProps {
  label: string;
  icon?: React.ReactNode;
  text?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ToolButton({ label, icon, text, active, disabled, onClick }: ToolButtonProps) {
  return (
    <Tooltip title={label}>
      <Button
        size="small"
        type={active ? 'primary' : 'text'}
        aria-label={label}
        aria-pressed={active ?? false}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        icon={icon}
        style={{ fontWeight: text ? 600 : undefined, minWidth: 32 }}
      >
        {text}
      </Button>
    </Tooltip>
  );
}

/** Word and reading-time counts help editors judge length while writing. */
function countWords(editor: Editor | null): number {
  const text = editor?.getText() ?? '';
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

type Dialog = { kind: 'image'; file: File | null; existing: FigureAttributes | null } | { kind: 'embed' } | { kind: 'business' } | { kind: 'link'; href: string } | { kind: 'document'; selectedText: string } | null;

/**
 * A link to a library PDF keeps the document's id (`data-media-id`) through
 * editing and saving (change log 1.16), so the document counts as in use. The
 * link mark comes from StarterKit, so the attribute is added globally rather
 * than by replacing the mark.
 */
const DocumentLinkAttributes = Extension.create({
  name: 'documentLinkAttributes',
  addGlobalAttributes() {
    return [
      {
        types: ['link'],
        attributes: {
          mediaId: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-media-id'),
            renderHTML: (attributes) => (attributes.mediaId ? { 'data-media-id': attributes.mediaId } : {}),
          },
        },
      },
    ];
  },
});

/**
 * Rich text editor for article bodies (SRS BLOG 001, 1.10 BLOG 004). It
 * produces HTML limited to what the server allowlist keeps: headings, emphasis,
 * lists, quotes, code, links, captioned images, tables, and markers for videos,
 * maps and business cards. The server sanitises again on save, so the editor is
 * a convenience, never the security boundary (SEC 001).
 */
export function RichTextEditor({ value, onChange, disabled = false, ariaLabel = 'Article body', minHeight = 420, resetKey }: Props) {
  const { message } = App.useApp();
  const [dialog, setDialog] = useState<Dialog>(null);
  // Handlers the editor's own callbacks reach through refs, since the editor keeps the options it was created with.
  const openLinkRef = useRef<() => void>(() => undefined);
  const openImageRef = useRef<(file: File) => void>(() => undefined);
  const pasteNotifiedRef = useRef(false);
  const notifyPasteRef = useRef<() => void>(() => undefined);

  const editor = useEditor({
    editable: !disabled,
    extensions: [
      ArticleDocument,
      StarterKit.configure({
        document: false,
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto', 'tel'], HTMLAttributes: { rel: 'noopener noreferrer nofollow' } },
        // Underlined text reads as a link on the web, and the published page has
        // no underline style; Ctrl+U would only produce formatting that vanishes.
        underline: false,
      }),
      DocumentLinkAttributes,
      ArticleFigure,
      EmbedBlock,
      LibraryImage.configure({ inline: false, HTMLAttributes: { loading: 'lazy' } }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || '',
    onUpdate: ({ editor: instance }) => {
      const html = instance.getHTML();
      onChange(html === '<p></p>' ? '' : html);
    },
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        role: 'textbox',
        'aria-multiline': 'true',
        class: 'ms-editor-body',
        style: `min-height:${minHeight}px;padding:16px;outline:none;`,
      },
      // Ctrl/Cmd+K opens the link box, as it does in most writing tools.
      handleKeyDown: (_view, event) => {
        if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false;
        event.preventDefault();
        openLinkRef.current();
        return true;
      },
      transformPastedHTML: (html) => {
        const result = tidyPastedHtml(html);
        if (result.tidied) notifyPasteRef.current();
        return result.html;
      },
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.files ?? []).find((candidate) => candidate.type.startsWith('image/'));
        if (!file) return false;
        openImageRef.current(file);
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const file = Array.from((event as DragEvent).dataTransfer?.files ?? []).find((candidate) => candidate.type.startsWith('image/'));
        if (!file) return false;
        event.preventDefault();
        openImageRef.current(file);
        return true;
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    openLinkRef.current = () => {
      if (!editor || !editor.isEditable) return;
      setDialog({ kind: 'link', href: (editor.getAttributes('link').href as string | undefined) ?? '' });
    };
    openImageRef.current = (file: File) => {
      if (editor?.isEditable) setDialog({ kind: 'image', file, existing: null });
    };
    notifyPasteRef.current = () => {
      if (pasteNotifiedRef.current) return;
      pasteNotifiedRef.current = true;
      message.info('Pasted text was tidied: colours, fonts and other formatting the site does not use were removed.');
    };
  });

  // Adopt content loaded after mount (e.g. an existing article) without
  // clobbering what the editor already has while someone is typing.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = value || '';
    if (incoming !== current && (current === '<p></p>' || current === '')) editor.commands.setContent(incoming, { emitUpdate: false });
  }, [editor, value]);

  // An explicit reset (Discard changes) replaces whatever is on screen.
  const lastResetKey = useRef(resetKey);
  useEffect(() => {
    if (!editor || resetKey === lastResetKey.current) return;
    lastResetKey.current = resetKey;
    editor.commands.setContent(value || '', { emitUpdate: false });
  }, [editor, resetKey, value]);

  // No update event: TipTap emits one by default, which reported an unchanged
  // text as an edit on mount and left a freshly opened page "unsaved".
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  if (!editor) return null;
  const words = countWords(editor);
  const inTable = editor.isActive('table');
  const onFigure = editor.isActive('articleFigure');

  const applyLink = (href: string) => {
    if (href === '') editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setDialog(null);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setDialog(null);
  };

  const insertFigure = (attributes: FigureAttributes, existing: boolean) => {
    if (existing) editor.chain().focus().updateAttributes('articleFigure', attributes).run();
    else editor.chain().focus().insertContent({ type: 'articleFigure', attrs: attributes }).run();
    setDialog(null);
  };

  const insertDocument = (link: DocumentLink) => {
    const attrs = { href: link.href, mediaId: link.mediaId, class: 'ms-doc-link' };
    const { empty } = editor.state.selection;
    if (empty) editor.chain().focus().insertContent({ type: 'text', text: link.text, marks: [{ type: 'link', attrs }] }).run();
    else editor.chain().focus().extendMarkRange('link').insertContent({ type: 'text', text: link.text, marks: [{ type: 'link', attrs }] }).run();
    setDialog(null);
  };

  const insertEmbed = (attributes: EmbedAttributes) => {
    editor.chain().focus().insertContent({ type: 'embedBlock', attrs: attributes }).run();
    setDialog(null);
  };

  return (
    <div style={{ border: `1px solid ${brand.border}`, borderRadius: 10, background: brand.surfaceRaised, overflow: 'hidden' }}>
      <div
        role="toolbar"
        aria-label="Formatting"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', padding: '6px 8px', borderBottom: `1px solid ${brand.border}`, background: brand.surfaceMuted, position: 'sticky', top: 0, zIndex: 5 }}
      >
        <ToolButton label="Normal text" text="Text" active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()} />
        {([2, 3, 4] as const).map((level) => (
          <ToolButton
            key={level}
            label={HEADING_LABELS[level]}
            text={HEADING_LABELS[level].replace('Minor heading', 'Minor')}
            active={editor.isActive('heading', { level })}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          />
        ))}
        <Divider type="vertical" />
        <ToolButton label="Bold" icon={<BoldOutlined aria-hidden="true" />} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolButton label="Italic" icon={<ItalicOutlined aria-hidden="true" />} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolButton label="Strikethrough" icon={<StrikethroughOutlined aria-hidden="true" />} active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
        <Divider type="vertical" />
        <ToolButton label="Bulleted list" icon={<UnorderedListOutlined aria-hidden="true" />} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolButton label="Numbered list" icon={<OrderedListOutlined aria-hidden="true" />} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolButton label="Quote" text="❝" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolButton label="Code block" icon={<CodeOutlined aria-hidden="true" />} active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
        <ToolButton label="Divider" text="—" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
        <Divider type="vertical" />
        <ToolButton label="Link (Ctrl+K)" icon={<LinkOutlined aria-hidden="true" />} active={editor.isActive('link')} onClick={() => openLinkRef.current()} />
        <ToolButton label="Add an image" icon={<PictureOutlined aria-hidden="true" />} onClick={() => setDialog({ kind: 'image', file: null, existing: null })} />
        <ToolButton
          label="Link a PDF document"
          icon={<FilePdfOutlined aria-hidden="true" />}
          onClick={() => setDialog({ kind: 'document', selectedText: editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ') })}
        />
        <ToolButton label="Add a video or map" icon={<PlayCircleOutlined aria-hidden="true" />} onClick={() => setDialog({ kind: 'embed' })} />
        <ToolButton label="Add a business card" icon={<ShopOutlined aria-hidden="true" />} onClick={() => setDialog({ kind: 'business' })} />
        <ToolButton label="Insert table" icon={<TableOutlined aria-hidden="true" />} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
        <Divider type="vertical" />
        <ToolButton label="Undo" icon={<UndoOutlined aria-hidden="true" />} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
        <ToolButton label="Redo" icon={<RedoOutlined aria-hidden="true" />} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
      </div>

      {/* Context tools, shown only where they apply. */}
      {(inTable || onFigure) && (
        <div role="toolbar" aria-label={inTable ? 'Table' : 'Image'} style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', padding: '4px 8px', borderBottom: `1px solid ${brand.border}`, background: brand.surfaceMuted }}>
          {inTable && (
            <>
              <Typography.Text type="secondary" style={{ fontSize: 12.5, marginRight: 4 }}>
                Table:
              </Typography.Text>
              <ToolButton label="Add a row below" text="+ Row" onClick={() => editor.chain().focus().addRowAfter().run()} />
              <ToolButton label="Remove this row" text="− Row" onClick={() => editor.chain().focus().deleteRow().run()} />
              <ToolButton label="Add a column to the right" text="+ Column" onClick={() => editor.chain().focus().addColumnAfter().run()} />
              <ToolButton label="Remove this column" text="− Column" onClick={() => editor.chain().focus().deleteColumn().run()} />
              <ToolButton label="Header row on or off" text="Header row" onClick={() => editor.chain().focus().toggleHeaderRow().run()} />
              <ToolButton label="Delete the table" text="Delete table" onClick={() => editor.chain().focus().deleteTable().run()} />
            </>
          )}
          {onFigure && (
            <>
              <Typography.Text type="secondary" style={{ fontSize: 12.5, marginRight: 4 }}>
                Image:
              </Typography.Text>
              <ToolButton label="Change the description, caption or size" text="Image settings" onClick={() => setDialog({ kind: 'image', file: null, existing: editor.getAttributes('articleFigure') as FigureAttributes })} />
              <ToolButton label="Remove the image" text="Remove" onClick={() => editor.chain().focus().deleteSelection().run()} />
            </>
          )}
        </div>
      )}

      <EditorContent editor={editor} />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 12px', borderTop: `1px solid ${brand.border}`, background: brand.surfaceMuted }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Drop or paste a picture to add it. Colours and fonts are removed when you save.
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {words} words · about {Math.max(1, Math.round(words / 200))} min read
        </Typography.Text>
      </div>

      {dialog?.kind === 'link' && <LinkDialog initialUrl={dialog.href} onCancel={() => setDialog(null)} onApply={applyLink} onRemove={removeLink} />}
      {dialog?.kind === 'image' && <InsertImageDialog initialFile={dialog.file} existing={dialog.existing} onCancel={() => setDialog(null)} onInsert={(attributes) => insertFigure(attributes, dialog.existing !== null)} />}
      {dialog?.kind === 'document' && <DocumentPickerDialog selectedText={dialog.selectedText} onCancel={() => setDialog(null)} onInsert={insertDocument} />}
      {dialog?.kind === 'embed' && <EmbedDialog onCancel={() => setDialog(null)} onInsert={insertEmbed} />}
      {dialog?.kind === 'business' && <BusinessCardDialog onCancel={() => setDialog(null)} onInsert={insertEmbed} />}
    </div>
  );
}
