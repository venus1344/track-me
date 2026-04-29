import { useRef, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Attachment {
  id: string;
  filename: string;
  original_name: string;
  size_bytes: number;
  created_at: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getFileType(filename: string): 'image' | 'pdf' | 'video' | 'other' {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video';
  return 'other';
}

function FileTypeBadge({ filename }: { filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'file';
  const colors: Record<string, string> = {
    pdf: '#f87171', doc: '#3b82f6', docx: '#3b82f6',
    xls: '#34d399', xlsx: '#34d399', csv: '#34d399',
    zip: '#f59e0b', rar: '#f59e0b',
    mp4: '#a78bfa', mov: '#a78bfa', webm: '#a78bfa',
  };
  const color = colors[ext] ?? 'var(--text3)';
  return (
    <span
      className="text-xs font-bold px-1.5 py-0.5 rounded uppercase shrink-0"
      style={{ background: `${color}22`, color }}
    >
      {ext}
    </span>
  );
}

// ── Preview modal ──────────────────────────────────────────────────────────────
function PreviewModal({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const src = `/uploads/${attachment.filename}`;
  const type = getFileType(attachment.filename);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border2)',
          maxWidth: '90vw',
          maxHeight: '90vh',
          width: type === 'image' ? 'auto' : '800px',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
            {attachment.original_name}
          </span>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <a
              href={src}
              download={attachment.original_name}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
            >
              Download
            </a>
            <button
              onClick={onClose}
              className="text-lg leading-none"
              style={{ color: 'var(--text3)' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-auto flex-1 flex items-center justify-center p-4">
          {type === 'image' && (
            <img
              src={src}
              alt={attachment.original_name}
              style={{ maxWidth: '80vw', maxHeight: '75vh', objectFit: 'contain', borderRadius: '8px' }}
            />
          )}
          {type === 'pdf' && (
            <iframe
              src={src}
              title={attachment.original_name}
              style={{ width: '760px', height: '75vh', border: 'none', borderRadius: '8px' }}
            />
          )}
          {type === 'video' && (
            <video
              src={src}
              controls
              style={{ maxWidth: '760px', maxHeight: '75vh', borderRadius: '8px' }}
            />
          )}
          {type === 'other' && (
            <div className="text-center py-8 px-6">
              <p className="text-4xl mb-3">📄</p>
              <p className="font-medium mb-1" style={{ color: 'var(--text)' }}>{attachment.original_name}</p>
              <p className="text-sm mb-4" style={{ color: 'var(--text2)' }}>{formatBytes(attachment.size_bytes)}</p>
              <a
                href={src}
                download={attachment.original_name}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                Download
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Thumbnail ──────────────────────────────────────────────────────────────────
function Thumbnail({ attachment }: { attachment: Attachment }) {
  const type = getFileType(attachment.filename);
  const [imgError, setImgError] = useState(false);

  if (type === 'image' && !imgError) {
    return (
      <img
        src={`/uploads/${attachment.filename}`}
        alt=""
        onError={() => setImgError(true)}
        className="rounded shrink-0"
        style={{ width: 36, height: 36, objectFit: 'cover' }}
      />
    );
  }

  const icons: Record<string, string> = { pdf: '📕', video: '🎬', other: '📄' };
  return (
    <span className="text-xl shrink-0 leading-none" style={{ width: 36, textAlign: 'center' }}>
      {icons[type] ?? '📄'}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
interface Props {
  projectId: string;
  taskId?: string;
}

export default function AttachmentsSection({ projectId, taskId }: Props) {
  const qc = useQueryClient();
  const [previewing, setPreviewing] = useState<Attachment | null>(null);

  const queryKey = taskId
    ? ['attachments', projectId, taskId]
    : ['attachments', projectId];

  const url = taskId
    ? `/projects/${projectId}/attachments?taskId=${taskId}`
    : `/projects/${projectId}/attachments`;

  const { data: attachments = [] } = useQuery<Attachment[]>({
    queryKey,
    queryFn: () => api.get(url),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      if (taskId) fd.append('task_id', taskId);
      return api.upload(`/projects/${projectId}/attachments`, fd);
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) =>
      api.delete(`/projects/${projectId}/attachments/${attachmentId}`),
    onSuccess: () => {
      if (previewing) setPreviewing(null);
      invalidate();
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
      e.target.value = '';
    }
  }

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
            Attachments {attachments.length > 0 && `(${attachments.length})`}
          </h3>
          <label
            className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
            style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
          >
            {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
            <input type="file" className="hidden" onChange={handleFileChange} />
          </label>
        </div>

        {attachments.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text3)' }}>No attachments yet</p>
        ) : (
          <div className="flex flex-col gap-2">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{ background: 'var(--surface2)' }}
              >
                {/* Thumbnail — click to preview */}
                <button
                  onClick={() => setPreviewing(a)}
                  className="shrink-0 rounded overflow-hidden hover:opacity-80 transition-opacity"
                  style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Thumbnail attachment={a} />
                </button>

                {/* Name — click to preview */}
                <button
                  onClick={() => setPreviewing(a)}
                  className="flex-1 text-left text-sm truncate hover:underline"
                  style={{ color: 'var(--text)' }}
                >
                  {a.original_name}
                </button>

                <FileTypeBadge filename={a.filename} />

                <span className="text-xs shrink-0" style={{ color: 'var(--text3)' }}>
                  {formatBytes(a.size_bytes)}
                </span>

                <span className="text-xs shrink-0" style={{ color: 'var(--text3)' }}>
                  {formatDate(a.created_at)}
                </span>

                <button
                  onClick={() => deleteMutation.mutate(a.id)}
                  disabled={deleteMutation.isPending}
                  className="text-xs px-1.5 py-0.5 rounded shrink-0"
                  style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {previewing && (
        <PreviewModal attachment={previewing} onClose={() => setPreviewing(null)} />
      )}
    </>
  );
}
