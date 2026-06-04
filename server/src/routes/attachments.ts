import { Router } from 'express';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { canAccessProject, canModify } from '../middleware/access.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '../../../uploads');
const allowedUploadTypes = new Map<string, Set<string>>([
  ['.jpg', new Set(['image/jpeg'])],
  ['.jpeg', new Set(['image/jpeg'])],
  ['.png', new Set(['image/png'])],
  ['.gif', new Set(['image/gif'])],
  ['.webp', new Set(['image/webp'])],
  ['.bmp', new Set(['image/bmp'])],
  ['.pdf', new Set(['application/pdf'])],
  ['.mp4', new Set(['video/mp4'])],
  ['.webm', new Set(['video/webm'])],
  ['.mov', new Set(['video/quicktime'])],
  ['.avi', new Set(['video/x-msvideo', 'video/avi'])],
]);
const inlineUploadExtensions = new Set(allowedUploadTypes.keys());

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function normalizeExtension(filename: string) {
  return path.extname(filename).toLowerCase();
}

function isAllowedUpload(file: { originalname: string; mimetype: string }) {
  const extension = normalizeExtension(file.originalname);
  const allowedMimeTypes = allowedUploadTypes.get(extension);
  if (!allowedMimeTypes) {
    return false;
  }

  return allowedMimeTypes.has(file.mimetype.toLowerCase());
}

function buildContentDisposition(mode: 'inline' | 'attachment', originalName: string) {
  const safeFileName = path.basename(originalName).replace(/[\r\n"]/g, '_');
  return `${mode}; filename="${safeFileName}"`;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uuid() + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    if (!isAllowedUpload(file)) {
      cb(new Error('Unsupported file type'));
      return;
    }

    cb(null, true);
  },
});

interface AttachmentRow {
  id: string;
  filename: string;
  original_name: string;
}

export function attachmentRoutes(db: Database.Database): Router {
  const router = Router({ mergeParams: true });

  // GET / — list attachments for project (optional ?taskId= to filter by task)
  router.get('/', (req, res) => {
    const { projectId } = req.params as Record<string, string>;
    const { taskId } = req.query as { taskId?: string };

    if (!canAccessProject(db, String(req.session.userId), req.session.role ?? '', projectId)) {
      res.status(403).json({ error: 'Not authorized to access this project' });
      return;
    }

    const rows = taskId
      ? db.prepare('SELECT * FROM attachments WHERE project_id = ? AND task_id = ? AND deleted_at IS NULL ORDER BY created_at DESC').all(projectId, taskId)
      : db.prepare('SELECT * FROM attachments WHERE project_id = ? AND task_id IS NULL AND deleted_at IS NULL ORDER BY created_at DESC').all(projectId);
    res.json(rows);
  });

  // POST / — upload a file (optional task_id form field for task-level attachments)
  router.post('/', (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({ error: 'File exceeds 50 MB limit' });
          return;
        }
        if (err instanceof Error && err.message === 'Unsupported file type') {
          res.status(400).json({ error: 'Unsupported file type' });
          return;
        }
        res.status(400).json({ error: 'Upload failed' });
        return;
      }

      const { projectId } = req.params as Record<string, string>;
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      if (!canAccessProject(db, String(req.session.userId), req.session.role ?? '', projectId)) {
        fs.unlink(req.file.path, () => {});
        res.status(403).json({ error: 'Not authorized to access this project' });
        return;
      }

      if (!canModify(req.session.role ?? '')) {
        fs.unlink(req.file.path, () => {});
        res.status(403).json({ error: 'Viewers cannot upload attachments' });
        return;
      }

      const projectExists = db.prepare('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL').get(projectId);
      if (!projectExists) {
        fs.unlink(req.file.path, () => {});
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const taskId: string | null = (req.body as { task_id?: string }).task_id ?? null;
      if (taskId) {
        const taskExists = db.prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ?').get(taskId, projectId);
        if (!taskExists) {
          fs.unlink(req.file.path, () => {});
          res.status(400).json({ error: 'Task not found in this project' });
          return;
        }
      }

      const id = uuid();
      db.prepare(`
        INSERT INTO attachments (id, project_id, task_id, filename, original_name, size_bytes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, projectId, taskId, req.file.filename, req.file.originalname, req.file.size);

      const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
      res.status(201).json(row);
    });
  });

  // GET /:attachmentId/file — stream attachment to authorized project viewers
  router.get('/:attachmentId/file', (req, res) => {
    const { projectId, attachmentId } = req.params as Record<string, string>;

    if (!canAccessProject(db, String(req.session.userId), req.session.role ?? '', projectId)) {
      res.status(403).json({ error: 'Not authorized to access this project' });
      return;
    }

    const attachment = db.prepare(
      'SELECT id, filename, original_name FROM attachments WHERE id = ? AND project_id = ? AND deleted_at IS NULL'
    ).get(attachmentId, projectId) as AttachmentRow | undefined;

    if (!attachment) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

    const filePath = path.join(uploadsDir, attachment.filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Attachment file not found' });
      return;
    }

    const extension = normalizeExtension(attachment.filename);
    const disposition = inlineUploadExtensions.has(extension) ? 'inline' : 'attachment';

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', buildContentDisposition(disposition, attachment.original_name));

    if (allowedUploadTypes.has(extension)) {
      res.type(extension.slice(1));
    } else {
      res.type('application/octet-stream');
    }

    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Could not read attachment' });
      }
    });
  });

  // DELETE /:attachmentId — soft-delete attachment record + file
  router.delete('/:attachmentId', (req, res) => {
    const { projectId, attachmentId } = req.params as Record<string, string>;

    if (!canAccessProject(db, String(req.session.userId), req.session.role ?? '', projectId)) {
      res.status(403).json({ error: 'Not authorized to access this project' });
      return;
    }

    if (!canModify(req.session.role ?? '')) {
      res.status(403).json({ error: 'Viewers cannot delete attachments' });
      return;
    }

    const row = db.prepare(
      'SELECT * FROM attachments WHERE id = ? AND project_id = ? AND deleted_at IS NULL'
    ).get(attachmentId, projectId) as { id: string; filename: string } | undefined;

    if (!row) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

    db.prepare("UPDATE attachments SET deleted_at = datetime('now') WHERE id = ?").run(attachmentId);

    const filePath = path.join(uploadsDir, row.filename);
    fs.unlink(filePath, () => {}); // best-effort

    res.json({ success: true });
  });

  return router;
}
