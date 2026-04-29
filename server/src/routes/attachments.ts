import { Router } from 'express';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '../../../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuid() + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

export function attachmentRoutes(db: Database.Database): Router {
  const router = Router({ mergeParams: true });

  // GET / — list attachments for project (optional ?taskId= to filter by task)
  router.get('/', (req, res) => {
    const { projectId } = req.params as Record<string, string>;
    const { taskId } = req.query as { taskId?: string };
    const rows = taskId
      ? db.prepare('SELECT * FROM attachments WHERE project_id = ? AND task_id = ? ORDER BY created_at DESC').all(projectId, taskId)
      : db.prepare('SELECT * FROM attachments WHERE project_id = ? AND task_id IS NULL ORDER BY created_at DESC').all(projectId);
    res.json(rows);
  });

  // POST / — upload a file (optional task_id form field for task-level attachments)
  router.post('/', upload.single('file'), (req, res) => {
    const { projectId } = req.params as Record<string, string>;
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const projectExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
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

  // DELETE /:attachmentId — delete attachment record + file
  router.delete('/:attachmentId', (req, res) => {
    const { projectId, attachmentId } = req.params as Record<string, string>;
    const row = db.prepare(
      'SELECT * FROM attachments WHERE id = ? AND project_id = ?'
    ).get(attachmentId, projectId) as { id: string; filename: string } | undefined;

    if (!row) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

    db.prepare('DELETE FROM attachments WHERE id = ?').run(attachmentId);

    const filePath = path.join(uploadsDir, row.filename);
    fs.unlink(filePath, () => {}); // best-effort

    res.json({ success: true });
  });

  return router;
}
