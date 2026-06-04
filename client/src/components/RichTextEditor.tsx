import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import CodeBlock from '@tiptap/extension-code-block';
import Blockquote from '@tiptap/extension-blockquote';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { useEffect } from 'react';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: string;
}

const FONT_COLORS = [
  { label: 'Default', value: 'var(--text)' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Green', value: '#10b981' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Purple', value: '#8b5cf6' },
  { label: 'Pink', value: '#ec4899' },
];

export default function RichTextEditor({
  content,
  onChange,
  placeholder = 'Start typing…',
  readOnly = false,
  minHeight = '120px',
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Underline,
      TextStyle,
      Color,
      CodeBlock,
      Blockquote,
      HorizontalRule,
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'rte-editor',
        style: `outline: none; min-height: ${minHeight}; padding: 0;`,
      },
    },
  });

  // Sync external content changes (e.g. when editing a different task)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div
      className="rte-wrapper rounded-lg"
      style={{
        background: 'var(--surface2)',
        border: '1px solid var(--border2)',
        color: 'var(--text)',
        overflow: 'hidden',
      }}
    >
      {!readOnly && (
        <div
          className="rte-toolbar flex flex-wrap items-center gap-0.5 px-2 py-1.5"
          style={{ borderBottom: '1px solid var(--border2)', background: 'var(--surface3)' }}
        >
          {/* Bold */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`rte-btn ${editor.isActive('bold') ? 'rte-btn-active' : ''}`}
            title="Bold (Ctrl+B)"
          >
            <strong>B</strong>
          </button>

          {/* Italic */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`rte-btn ${editor.isActive('italic') ? 'rte-btn-active' : ''}`}
            title="Italic (Ctrl+I)"
          >
            <em>I</em>
          </button>

          {/* Underline */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`rte-btn ${editor.isActive('underline') ? 'rte-btn-active' : ''}`}
            title="Underline (Ctrl+U)"
          >
            <span style={{ textDecoration: 'underline' }}>U</span>
          </button>

          <span style={{ color: 'var(--border2)', margin: '0 2px' }}>|</span>

          {/* Text color */}
          <div className="relative rte-color-group">
            <button
              type="button"
              className="rte-btn"
              title="Text color"
              style={{ color: editor.getAttributes('textStyle').color || 'var(--text)' }}
            >
              A ▼
            </button>
            <div className="rte-color-dropdown">
              {FONT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => {
                    if (c.value === 'var(--text)') {
                      editor.chain().focus().unsetColor().run();
                    } else {
                      editor.chain().focus().setColor(c.value).run();
                    }
                  }}
                  className="rte-color-option"
                  title={c.label}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: c.value,
                      border: '2px solid var(--border2)',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text2)' }}>{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          <span style={{ color: 'var(--border2)', margin: '0 2px' }}>|</span>

          {/* Bullet list */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`rte-btn ${editor.isActive('bulletList') ? 'rte-btn-active' : ''}`}
            title="Bullet list"
          >
            •≡
          </button>

          {/* Ordered list */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`rte-btn ${editor.isActive('orderedList') ? 'rte-btn-active' : ''}`}
            title="Numbered list"
          >
            1.
          </button>

          <span style={{ color: 'var(--border2)', margin: '0 2px' }}>|</span>

          {/* Blockquote */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`rte-btn ${editor.isActive('blockquote') ? 'rte-btn-active' : ''}`}
            title="Quote"
          >
            ❝
          </button>

          {/* Code block */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={`rte-btn ${editor.isActive('codeBlock') ? 'rte-btn-active' : ''}`}
            title="Code block"
          >
            {'</>'}
          </button>

          {/* Horizontal rule */}
          <button
            type="button"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="rte-btn"
            title="Divider"
          >
            —
          </button>
        </div>
      )}

      <div className="rte-content-area" style={{ padding: readOnly ? '0' : '8px 12px' }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}