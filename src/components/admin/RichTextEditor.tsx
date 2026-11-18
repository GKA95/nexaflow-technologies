import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { FontSize, TextStyle } from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import Image from '@tiptap/extension-image';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import Placeholder from '@tiptap/extension-placeholder';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Code2,
  Eraser,
  Highlighter,
  Image as ImageIcon,
  Indent,
  Italic,
  Keyboard,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Outdent,
  Palette,
  Quote,
  Redo2,
  RefreshCw,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Table as TableIcon,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import {
  countWordsFromRichContent,
  estimateReadingTimeMinutes,
  extractPlainText,
  plainTextToHtml,
} from '../../../server/shared/richText';
import { apiFetch } from '../../utils/authSession';
import { normalizeImageUrl } from '../../utils/media';

const AlignedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-align': {
        default: 'center',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-align') || 'center',
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes['data-align'] ? { 'data-align': attributes['data-align'] } : {},
      },
    };
  },
});

const TEXT_COLOR_SWATCHES = [
  { label: 'Obsidian Ink', value: '#070B24' },
  { label: 'Slate Body', value: '#334155' },
  { label: 'Soft Cloud', value: '#F7F8FF' },
  { label: 'Electric Blue', value: '#176BFF' },
  { label: 'Cyan Glow', value: '#00D4FF' },
  { label: 'Emerald', value: '#059669' },
  { label: 'Amber', value: '#D97706' },
  { label: 'Crimson', value: '#DC2626' },
];

const HIGHLIGHT_SWATCHES = [
  { label: 'Warm Yellow', value: '#FEF08A' },
  { label: 'Cyan Mist', value: '#BAE6FD' },
  { label: 'Mint Glow', value: '#BBF7D0' },
  { label: 'Soft Amber', value: '#FDE68A' },
  { label: 'Rose Tint', value: '#FECDD3' },
  { label: 'Deep Indigo', value: 'rgba(23, 107, 255, 0.25)' },
];

const FONT_SIZE_OPTIONS = [
  { label: 'Default', value: '' },
  { label: '14px', value: '14px' },
  { label: '16px', value: '16px' },
  { label: '18px', value: '18px' },
  { label: '20px', value: '20px' },
  { label: '24px', value: '24px' },
  { label: '28px', value: '28px' },
];

const FONT_FAMILY_OPTIONS = [
  { label: 'Default (DM Sans)', value: '' },
  { label: 'Display (Plus Jakarta Sans)', value: '"Plus Jakarta Sans", sans-serif' },
  { label: 'Editorial Serif', value: 'Georgia, serif' },
  { label: 'Code (JetBrains Mono)', value: '"JetBrains Mono", monospace' },
];

type PopoverKind = 'color' | 'highlight' | 'link' | 'image' | 'table' | 'shortcuts' | null;

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeightClass?: string;
  label?: string;
  error?: string;
  saveStatus?: 'idle' | 'dirty' | 'saving' | 'saved' | 'local-draft';
  compact?: boolean;
  enableMedia?: boolean;
  id?: string;
}

function normalizeEditorHtml(raw: string | undefined | null): string {
  const html = plainTextToHtml(raw || '').trim();
  if (html === '<p></p>' || html === '<p><br></p>') return '';
  return html;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start writing formatted content...',
  minHeightClass = 'min-h-[260px]',
  label,
  error,
  saveStatus = 'idle',
  compact = false,
  enableMedia = true,
  id,
}: RichTextEditorProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lastEmittedRef = useRef<string>(normalizeEditorHtml(value));
  const [, setToolbarTick] = useState(0);

  const [activePopover, setActivePopover] = useState<PopoverKind>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkNewTab, setLinkNewTab] = useState(true);
  const [linkError, setLinkError] = useState('');

  const [imgUrl, setImgUrl] = useState('');
  const [imgAlt, setImgAlt] = useState('');
  const [imgAlign, setImgAlign] = useState<'left' | 'center' | 'right'>('center');
  const [imgError, setImgError] = useState('');
  const [resolvingImg, setResolvingImg] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [mediaConfig, setMediaConfig] = useState<{
    loaded: boolean;
    cloudinaryConfigured: boolean;
    maxFileSizeBytes: number;
  }>({ loaded: false, cloudinaryConfigured: false, maxFileSizeBytes: 5 * 1024 * 1024 });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
        },
      }),
      TextStyle,
      FontSize,
      FontFamily,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Superscript,
      Subscript,
      AlignedImage.configure({
        inline: false,
        allowBase64: false,
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder }),
    ],
    content: normalizeEditorHtml(value),
    editorProps: {
      attributes: {
        id: inputId,
        'aria-label': label || 'Rich text editor',
        'aria-multiline': 'true',
        class: `nf-rich-content ${minHeightClass} px-4 py-3.5 focus:outline-none`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.isEmpty ? '' : ed.getHTML();
      lastEmittedRef.current = html;
      onChange(html);
      setToolbarTick((t) => (t + 1) % 10000);
    },
    onSelectionUpdate: () => {
      setToolbarTick((t) => (t + 1) % 10000);
    },
    onTransaction: () => {
      setToolbarTick((t) => (t + 1) % 10000);
    },
  });

  // Synchronize external prop updates (e.g. loading another article, resetting form, restoring draft)
  // without disrupting cursor state during local typing.
  useEffect(() => {
    if (!editor) return;
    const incoming = normalizeEditorHtml(value);
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (incoming !== current && incoming !== lastEmittedRef.current) {
      lastEmittedRef.current = incoming;
      editor.commands.setContent(incoming || '', { emitUpdate: false });
    }
  }, [value, editor]);

  // Close popovers on outside click or Escape
  useEffect(() => {
    if (!activePopover) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setActivePopover(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePopover(null);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [activePopover]);

  const loadMediaConfig = useCallback(async () => {
    if (mediaConfig.loaded || !enableMedia) return;
    try {
      const res = await apiFetch('/api/admin/media/config', { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as {
          cloudinaryConfigured?: boolean;
          maxFileSizeMb?: number;
        };
        setMediaConfig({
          loaded: true,
          cloudinaryConfigured: Boolean(data.cloudinaryConfigured),
          maxFileSizeBytes: (Number(data.maxFileSizeMb) || 5) * 1024 * 1024,
        });
        return;
      }
    } catch {
      // Non-blocking
    }
    setMediaConfig((prev) => ({ ...prev, loaded: true }));
  }, [mediaConfig.loaded, enableMedia]);

  const wordCount = useMemo(() => countWordsFromRichContent(value), [value]);
  const charCount = useMemo(() => extractPlainText(value).length, [value]);
  const readingMinutes = useMemo(() => estimateReadingTimeMinutes(value), [value]);

  const openPopover = (kind: PopoverKind) => {
    if (activePopover === kind) {
      setActivePopover(null);
      return;
    }
    if (kind === 'link' && editor) {
      const attrs = editor.getAttributes('link');
      setLinkUrl(typeof attrs.href === 'string' ? attrs.href : '');
      setLinkNewTab(attrs.target !== '_self');
      setLinkError('');
    }
    if (kind === 'image' && editor) {
      const attrs = editor.getAttributes('image');
      setImgUrl(typeof attrs.src === 'string' ? attrs.src : '');
      setImgAlt(typeof attrs.alt === 'string' ? attrs.alt : '');
      const alignVal = attrs['data-align'];
      setImgAlign(
        alignVal === 'left' || alignVal === 'right' || alignVal === 'center'
          ? alignVal
          : 'center'
      );
      setImgError('');
      void loadMediaConfig();
    }
    setActivePopover(kind);
  };

  const applyLink = () => {
    if (!editor) return;
    const raw = linkUrl.trim();
    if (!raw) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setActivePopover(null);
      return;
    }
    const normalized =
      /^(https?:\/\/|mailto:|tel:|\/)/i.test(raw) ? raw : `https://${raw}`;
    if (!/^(https?:\/\/|mailto:|tel:|\/)/i.test(normalized)) {
      setLinkError('Enter a valid http(s), mailto, tel, or relative /path link.');
      return;
    }
    setLinkError('');
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({
        href: normalized,
        target: linkNewTab ? '_blank' : null,
        rel: linkNewTab ? 'noopener noreferrer' : null,
      })
      .run();
    setActivePopover(null);
  };

  const resolveExternalImage = async () => {
    const trimmed = imgUrl.trim();
    if (!trimmed) {
      setImgError('Enter an image URL first.');
      return;
    }
    const quick = normalizeImageUrl(trimmed);
    if (quick && quick !== trimmed) {
      setImgUrl(quick);
    }
    setResolvingImg(true);
    setImgError('');
    try {
      const res = await apiFetch('/api/admin/resolve-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        resolvedUrl?: string;
        error?: string;
      };
      if (res.ok && data.resolvedUrl) {
        setImgUrl(data.resolvedUrl);
      } else if (data.error) {
        setImgError(data.error);
      }
    } catch {
      setImgError('Could not reach URL resolver.');
    } finally {
      setResolvingImg(false);
    }
  };

  const handleImageFileUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type)) {
      setImgError('Please choose a PNG, JPG, WebP, or GIF image.');
      return;
    }
    if (file.size > mediaConfig.maxFileSizeBytes) {
      setImgError(
        `Image exceeds ${Math.round(mediaConfig.maxFileSizeBytes / (1024 * 1024))} MB limit.`
      );
      return;
    }

    setUploadingImg(true);
    setImgError('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
      });

      const res = await apiFetch('/api/admin/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dataUrl, filename: file.name }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !payload.url) {
        setImgError(payload.error || 'Image upload failed.');
        return;
      }
      setImgUrl(payload.url);
      if (!imgAlt.trim()) {
        setImgAlt(file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
      }
    } catch {
      setImgError('Could not upload image.');
    } finally {
      setUploadingImg(false);
    }
  };

  const insertImage = () => {
    if (!editor) return;
    const normalized = normalizeImageUrl(imgUrl.trim());
    if (!normalized || (!normalized.startsWith('/') && !/^https?:\/\//i.test(normalized))) {
      setImgError('Enter a valid https:// or /assets/... image URL.');
      return;
    }
    setImgError('');
    if (editor.isActive('image')) {
      editor
        .chain()
        .focus()
        .updateAttributes('image', {
          src: normalized,
          alt: imgAlt.trim() || 'Article visual',
          'data-align': imgAlign,
        })
        .run();
    } else {
      editor
        .chain()
        .focus()
        .setImage({
          src: normalized,
          alt: imgAlt.trim() || 'Article visual',
        })
        .updateAttributes('image', { 'data-align': imgAlign })
        .run();
    }
    setActivePopover(null);
  };

  if (!editor) {
    return (
      <div
        className={`rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] ${minHeightClass} animate-pulse`}
      />
    );
  }

  const currentHeadingValue = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
      ? 'h2'
      : editor.isActive('heading', { level: 3 })
        ? 'h3'
        : editor.isActive('heading', { level: 4 })
          ? 'h4'
          : 'p';

  const currentTextStyle = editor.getAttributes('textStyle') as {
    fontFamily?: string;
    fontSize?: string;
    color?: string;
  };

  const btnCls = (active: boolean, disabled = false) =>
    `inline-flex items-center justify-center w-8 h-8 rounded-md text-xs transition-colors ${
      disabled
        ? 'opacity-35 cursor-not-allowed text-[#4A5578] dark:text-[#6F7B9E]'
        : active
          ? 'bg-[#176BFF] text-white shadow-xs'
          : 'text-[#334155] dark:text-[#CBD5EE] hover:bg-[#E7ECF7] dark:hover:bg-[#10183A]'
    }`;

  const divider = (
    <span className="h-5 w-px bg-[#DCE3F2] dark:bg-[#1A2550] mx-0.5 shrink-0" aria-hidden="true" />
  );

  return (
    <div ref={wrapperRef} className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-[#070B24] dark:text-[#F7F8FF]">
          {label}
        </label>
      )}

      <div
        className={`rounded-xl border bg-[#F6F8FC] dark:bg-[#03051B] transition-colors ${
          error
            ? 'border-rose-500 ring-1 ring-rose-500/30'
            : 'border-[#DCE3F2] dark:border-[#1A2550] focus-within:border-[#176BFF] dark:focus-within:border-[#00D4FF]'
        }`}
      >
        {/* Categorized Formatting Toolbar */}
        <div className="relative border-b border-[#DCE3F2] dark:border-[#1A2550] bg-white/85 dark:bg-[#080D2B]/95 rounded-t-xl px-2.5 py-2 flex flex-wrap items-center gap-1">
          {/* History */}
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className={btnCls(false, !editor.can().undo())}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            className={btnCls(false, !editor.can().redo())}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          {divider}

          {/* Block Type */}
          <select
            aria-label="Text style"
            value={currentHeadingValue}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'p') editor.chain().focus().setParagraph().run();
              else if (val === 'h1') editor.chain().focus().toggleHeading({ level: 1 }).run();
              else if (val === 'h2') editor.chain().focus().toggleHeading({ level: 2 }).run();
              else if (val === 'h3') editor.chain().focus().toggleHeading({ level: 3 }).run();
              else if (val === 'h4') editor.chain().focus().toggleHeading({ level: 4 }).run();
            }}
            className="h-8 rounded-md border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-2 text-xs font-medium text-[#070B24] dark:text-[#F7F8FF]"
          >
            <option value="p">Paragraph</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="h4">Heading 4</option>
          </select>

          {!compact && (
            <>
              <select
                aria-label="Font family"
                value={currentTextStyle.fontFamily || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) editor.chain().focus().unsetFontFamily().run();
                  else editor.chain().focus().setFontFamily(val).run();
                }}
                className="h-8 rounded-md border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-2 text-xs text-[#070B24] dark:text-[#F7F8FF] max-w-[140px]"
              >
                {FONT_FAMILY_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <select
                aria-label="Font size"
                value={currentTextStyle.fontSize || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) editor.chain().focus().unsetFontSize().run();
                  else editor.chain().focus().setFontSize(val).run();
                }}
                className="h-8 rounded-md border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-2 text-xs text-[#070B24] dark:text-[#F7F8FF]"
              >
                {FONT_SIZE_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </>
          )}

          {divider}

          {/* Inline Formatting */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold (Ctrl+B)"
            aria-label="Bold"
            aria-pressed={editor.isActive('bold')}
            className={btnCls(editor.isActive('bold'))}
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic (Ctrl+I)"
            aria-label="Italic"
            aria-pressed={editor.isActive('italic')}
            className={btnCls(editor.isActive('italic'))}
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline (Ctrl+U)"
            aria-label="Underline"
            aria-pressed={editor.isActive('underline')}
            className={btnCls(editor.isActive('underline'))}
          >
            <UnderlineIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Strikethrough"
            aria-label="Strikethrough"
            aria-pressed={editor.isActive('strike')}
            className={btnCls(editor.isActive('strike'))}
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCode().run()}
            title="Inline Code"
            aria-label="Inline Code"
            aria-pressed={editor.isActive('code')}
            className={btnCls(editor.isActive('code'))}
          >
            <Code className="w-3.5 h-3.5" />
          </button>

          {!compact && (
            <>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleSuperscript().run()}
                title="Superscript"
                aria-label="Superscript"
                aria-pressed={editor.isActive('superscript')}
                className={btnCls(editor.isActive('superscript'))}
              >
                <SuperscriptIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleSubscript().run()}
                title="Subscript"
                aria-label="Subscript"
                aria-pressed={editor.isActive('subscript')}
                className={btnCls(editor.isActive('subscript'))}
              >
                <SubscriptIcon className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {/* Colors & Highlight */}
          <button
            type="button"
            onClick={() => openPopover('color')}
            title="Text Color"
            aria-label="Text Color"
            aria-expanded={activePopover === 'color'}
            className={btnCls(activePopover === 'color' || Boolean(currentTextStyle.color))}
          >
            <Palette className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => openPopover('highlight')}
            title="Highlight Color"
            aria-label="Highlight Color"
            aria-expanded={activePopover === 'highlight'}
            className={btnCls(activePopover === 'highlight' || editor.isActive('highlight'))}
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
            title="Clear Formatting"
            aria-label="Clear Formatting"
            className={btnCls(false)}
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>

          {divider}

          {/* Alignment */}
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            title="Align Left"
            aria-label="Align Left"
            aria-pressed={editor.isActive({ textAlign: 'left' })}
            className={btnCls(editor.isActive({ textAlign: 'left' }))}
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            title="Align Center"
            aria-label="Align Center"
            aria-pressed={editor.isActive({ textAlign: 'center' })}
            className={btnCls(editor.isActive({ textAlign: 'center' }))}
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            title="Align Right"
            aria-label="Align Right"
            aria-pressed={editor.isActive({ textAlign: 'right' })}
            className={btnCls(editor.isActive({ textAlign: 'right' }))}
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>
          {!compact && (
            <button
              type="button"
              onClick={() => editor.chain().focus().setTextAlign('justify').run()}
              title="Justify"
              aria-label="Justify"
              aria-pressed={editor.isActive({ textAlign: 'justify' })}
              className={btnCls(editor.isActive({ textAlign: 'justify' }))}
            >
              <AlignJustify className="w-3.5 h-3.5" />
            </button>
          )}

          {divider}

          {/* Lists & Blocks */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet List"
            aria-label="Bullet List"
            aria-pressed={editor.isActive('bulletList')}
            className={btnCls(editor.isActive('bulletList'))}
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Numbered List"
            aria-label="Numbered List"
            aria-pressed={editor.isActive('orderedList')}
            className={btnCls(editor.isActive('orderedList'))}
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().liftListItem('listItem').run()}
            disabled={!editor.can().liftListItem('listItem')}
            title="Outdent List Item"
            aria-label="Outdent List Item"
            className={btnCls(false, !editor.can().liftListItem('listItem'))}
          >
            <Outdent className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
            disabled={!editor.can().sinkListItem('listItem')}
            title="Indent List Item"
            aria-label="Indent List Item"
            className={btnCls(false, !editor.can().sinkListItem('listItem'))}
          >
            <Indent className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Blockquote"
            aria-label="Blockquote"
            aria-pressed={editor.isActive('blockquote')}
            className={btnCls(editor.isActive('blockquote'))}
          >
            <Quote className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            title="Code Block"
            aria-label="Code Block"
            aria-pressed={editor.isActive('codeBlock')}
            className={btnCls(editor.isActive('codeBlock'))}
          >
            <Code2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Horizontal Divider"
            aria-label="Horizontal Divider"
            className={btnCls(false)}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          {divider}

          {/* Link, Media, Table */}
          <button
            type="button"
            onClick={() => openPopover('link')}
            title="Insert / Edit Link"
            aria-label="Insert or Edit Link"
            aria-expanded={activePopover === 'link'}
            className={btnCls(activePopover === 'link' || editor.isActive('link'))}
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>

          {enableMedia && (
            <button
              type="button"
              onClick={() => openPopover('image')}
              title="Insert Image"
              aria-label="Insert Image"
              aria-expanded={activePopover === 'image'}
              className={btnCls(activePopover === 'image' || editor.isActive('image'))}
            >
              <ImageIcon className="w-3.5 h-3.5" />
            </button>
          )}

          {!compact && (
            <button
              type="button"
              onClick={() => openPopover('table')}
              title="Table Tools"
              aria-label="Table Tools"
              aria-expanded={activePopover === 'table'}
              className={btnCls(activePopover === 'table' || editor.isActive('table'))}
            >
              <TableIcon className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Contextual Popover Panels */}
          {activePopover === 'color' && (
            <div className="absolute left-2.5 top-full mt-1.5 z-30 w-64 rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-3 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold">Text Color</span>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().unsetColor().run();
                    setActivePopover(null);
                  }}
                  className="text-[11px] font-medium text-[#176BFF] dark:text-[#00D4FF] hover:underline"
                >
                  Reset
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {TEXT_COLOR_SWATCHES.map((sw) => (
                  <button
                    key={sw.value}
                    type="button"
                    title={sw.label}
                    aria-label={sw.label}
                    onClick={() => {
                      editor.chain().focus().setColor(sw.value).run();
                      setActivePopover(null);
                    }}
                    className="h-7 rounded-md border border-[#DCE3F2] dark:border-[#1A2550] transition-transform hover:scale-105"
                    style={{ backgroundColor: sw.value }}
                  />
                ))}
              </div>
            </div>
          )}

          {activePopover === 'highlight' && (
            <div className="absolute left-2.5 top-full mt-1.5 z-30 w-60 rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-3 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold">Highlight Color</span>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().unsetHighlight().run();
                    setActivePopover(null);
                  }}
                  className="text-[11px] font-medium text-[#176BFF] dark:text-[#00D4FF] hover:underline"
                >
                  Clear
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {HIGHLIGHT_SWATCHES.map((sw) => (
                  <button
                    key={sw.value}
                    type="button"
                    title={sw.label}
                    aria-label={sw.label}
                    onClick={() => {
                      editor.chain().focus().toggleHighlight({ color: sw.value }).run();
                      setActivePopover(null);
                    }}
                    className="h-7 rounded-md border border-[#DCE3F2] dark:border-[#1A2550] transition-transform hover:scale-105"
                    style={{ backgroundColor: sw.value }}
                  />
                ))}
              </div>
            </div>
          )}

          {activePopover === 'link' && (
            <div className="absolute right-2.5 sm:left-2.5 top-full mt-1.5 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-4 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Insert or Edit Link</span>
                <button
                  type="button"
                  onClick={() => setActivePopover(null)}
                  aria-label="Close link dialog"
                  className="p-1 rounded text-[#4A5578] hover:text-[#070B24] dark:text-[#AEB8D4] dark:hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => {
                    setLinkUrl(e.target.value);
                    setLinkError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyLink();
                    }
                  }}
                  placeholder="https://example.com or /solutions"
                  className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-xs"
                />
                {linkError && <p className="mt-1 text-[11px] text-rose-400">{linkError}</p>}
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={linkNewTab}
                  onChange={(e) => setLinkNewTab(e.target.checked)}
                />
                Open external links in a new tab
              </label>
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().extendMarkRange('link').unsetLink().run();
                    setActivePopover(null);
                  }}
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-3 py-1.5 text-xs text-rose-500 hover:bg-rose-500/10"
                >
                  Remove Link
                </button>
                <button
                  type="button"
                  onClick={applyLink}
                  className="rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-3.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap"
                >
                  Apply Link
                </button>
              </div>
            </div>
          )}

          {activePopover === 'image' && enableMedia && (
            <div className="absolute right-2.5 top-full mt-1.5 z-30 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-4 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">
                  {editor.isActive('image') ? 'Update Image' : 'Insert Image'}
                </span>
                <button
                  type="button"
                  onClick={() => setActivePopover(null)}
                  aria-label="Close image dialog"
                  className="p-1 rounded text-[#4A5578] hover:text-[#070B24] dark:text-[#AEB8D4] dark:hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {mediaConfig.cloudinaryConfigured && (
                <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-[#00D4FF]/60 bg-[#00D4FF]/5 px-3 py-2.5 text-xs font-medium text-[#176BFF] dark:text-[#00D4FF] cursor-pointer hover:bg-[#00D4FF]/10 transition-colors">
                  {uploadingImg ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Uploading image...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Upload image file (PNG, JPG, WebP, GIF)</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    disabled={uploadingImg}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      void handleImageFileUpload(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}

              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-[#4A5578] dark:text-[#AEB8D4]">
                  Image URL (Imgur, Google Drive, HTTPS, or /assets/...)
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="url"
                    value={imgUrl}
                    onChange={(e) => {
                      setImgUrl(e.target.value);
                      setImgError('');
                    }}
                    placeholder="https://i.imgur.com/... or /assets/images/..."
                    className="flex-1 min-w-0 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    disabled={resolvingImg || !imgUrl.trim()}
                    onClick={() => void resolveExternalImage()}
                    title="Resolve Imgur / Google Drive link"
                    className="shrink-0 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-2.5 py-1.5 text-xs hover:border-[#00D4FF] disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${resolvingImg ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1">
                  Alt Text (SEO &amp; Accessibility)
                </label>
                <input
                  type="text"
                  value={imgAlt}
                  onChange={(e) => setImgAlt(e.target.value)}
                  placeholder="Describe the image for readers and search engines"
                  className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-1.5 text-xs"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-[#4A5578] dark:text-[#AEB8D4]">
                  Alignment
                </span>
                <div className="inline-flex rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] p-0.5 bg-[#F6F8FC] dark:bg-[#03051B]">
                  {(['left', 'center', 'right'] as const).map((align) => (
                    <button
                      key={align}
                      type="button"
                      onClick={() => setImgAlign(align)}
                      className={`px-2.5 py-1 rounded-md text-[11px] capitalize font-medium ${
                        imgAlign === align
                          ? 'bg-[#176BFF] text-white'
                          : 'text-[#4A5578] dark:text-[#AEB8D4]'
                      }`}
                    >
                      {align}
                    </button>
                  ))}
                </div>
              </div>

              {imgError && <p className="text-[11px] text-rose-400">{imgError}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setActivePopover(null)}
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-3 py-1.5 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={uploadingImg}
                  onClick={insertImage}
                  className="rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-50 px-3.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap"
                >
                  {editor.isActive('image') ? 'Update Image' : 'Insert Image'}
                </button>
              </div>
            </div>
          )}

          {activePopover === 'table' && !compact && (
            <div className="absolute right-2.5 top-full mt-1.5 z-30 w-60 rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-3 shadow-xl space-y-1.5 text-xs">
              <div className="flex items-center justify-between pb-1 border-b border-[#DCE3F2] dark:border-[#1A2550]">
                <span className="font-semibold">Table Actions</span>
                <button
                  type="button"
                  onClick={() => setActivePopover(null)}
                  className="p-0.5 rounded text-[#4A5578] hover:text-[#070B24] dark:text-[#AEB8D4]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                    .run();
                  setActivePopover(null);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[#EEF2FA] dark:hover:bg-[#10183A] font-medium text-[#176BFF] dark:text-[#00D4FF]"
              >
                + Insert 3×3 Table
              </button>
              {editor.isActive('table') && (
                <>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().addRowBefore().run()}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[#EEF2FA] dark:hover:bg-[#10183A]"
                  >
                    Add Row Above
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().addRowAfter().run()}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[#EEF2FA] dark:hover:bg-[#10183A]"
                  >
                    Add Row Below
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().deleteRow().run()}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[#EEF2FA] dark:hover:bg-[#10183A]"
                  >
                    Delete Row
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().addColumnBefore().run()}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[#EEF2FA] dark:hover:bg-[#10183A]"
                  >
                    Add Column Before
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().addColumnAfter().run()}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[#EEF2FA] dark:hover:bg-[#10183A]"
                  >
                    Add Column After
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().deleteColumn().run()}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[#EEF2FA] dark:hover:bg-[#10183A]"
                  >
                    Delete Column
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      editor.chain().focus().deleteTable().run();
                      setActivePopover(null);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-rose-500/10 text-rose-500 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Table
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Rich-Text Editing Canvas */}
        <div
          className="nf-tiptap-editor cursor-text"
          onClick={() => {
            if (!editor.isFocused) editor.chain().focus().run();
          }}
        >
          <EditorContent editor={editor} />
        </div>

        {/* Footer Telemetry & Shortcuts */}
        <div className="relative border-t border-[#DCE3F2] dark:border-[#1A2550] bg-white/60 dark:bg-[#080D2B]/70 rounded-b-xl px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#4A5578] dark:text-[#AEB8D4]">
          <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
            <span>{wordCount} words</span>
            <span>{charCount} chars</span>
            {!compact && <span>~{readingMinutes} min read</span>}
          </div>

          <div className="flex items-center gap-3">
            {saveStatus === 'saving' && (
              <span className="text-[#176BFF] dark:text-[#00D4FF] font-medium">Saving...</span>
            )}
            {saveStatus === 'local-draft' && (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                Draft saved locally
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Saved</span>
            )}
            {saveStatus === 'dirty' && (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                Unsaved changes
              </span>
            )}

            <button
              type="button"
              onClick={() => openPopover('shortcuts')}
              className="inline-flex items-center gap-1 hover:text-[#070B24] dark:hover:text-white transition-colors"
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Shortcuts</span>
            </button>
          </div>

          {activePopover === 'shortcuts' && (
            <div className="absolute right-2 bottom-full mb-1.5 z-30 w-64 rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-3.5 shadow-xl text-xs space-y-1.5">
              <div className="flex items-center justify-between pb-1 border-b border-[#DCE3F2] dark:border-[#1A2550]">
                <span className="font-semibold">Editor Shortcuts</span>
                <button
                  type="button"
                  onClick={() => setActivePopover(null)}
                  className="p-0.5 rounded text-[#4A5578] hover:text-[#070B24] dark:text-[#AEB8D4]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex justify-between"><span>Bold</span><kbd className="font-mono">Ctrl/⌘ + B</kbd></div>
              <div className="flex justify-between"><span>Italic</span><kbd className="font-mono">Ctrl/⌘ + I</kbd></div>
              <div className="flex justify-between"><span>Underline</span><kbd className="font-mono">Ctrl/⌘ + U</kbd></div>
              <div className="flex justify-between"><span>Undo</span><kbd className="font-mono">Ctrl/⌘ + Z</kbd></div>
              <div className="flex justify-between"><span>Redo</span><kbd className="font-mono">Ctrl/⌘ + Shift + Z</kbd></div>
              <div className="flex justify-between"><span>Heading 2</span><kbd className="font-mono">## + Space</kbd></div>
              <div className="flex justify-between"><span>Bullet list</span><kbd className="font-mono">- + Space</kbd></div>
              <div className="flex justify-between"><span>Blockquote</span><kbd className="font-mono">&gt; + Space</kbd></div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" aria-live="polite" className="text-xs font-medium text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}
