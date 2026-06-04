import DOMPurify from 'dompurify';

/**
 * Strips HTML tags and trims whitespace, returning plain text.
 * Used for description previews on cards.
 */
export function stripHtml(html: string | null | undefined, maxLength = 80): string | null {
  if (!html) return null;
  // Sanitize first to prevent XSS via innerHTML
  const sanitized = DOMPurify.sanitize(html);
  const div = document.createElement('div');
  div.innerHTML = sanitized;
  const text = (div.textContent ?? div.innerText ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
}