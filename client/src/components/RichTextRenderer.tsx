import DOMPurify from 'dompurify';

interface RichTextRendererProps {
  html: string;
}

/**
 * Safely renders sanitized HTML from the rich text editor.
 * Strips out XSS and limits to allowed tags/attributes from TipTap.
 */
export default function RichTextRenderer({ html }: RichTextRendererProps) {
  if (!html) return null;

  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'blockquote',
      'pre', 'code',
      'hr',
      'span',
    ],
    ALLOWED_ATTR: ['class'],
  });

  return (
    <div
      className="rte-render"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}