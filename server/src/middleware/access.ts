import Database from 'better-sqlite3';

/**
 * Check if a user can access a specific project.
 * Admin always has access. Others need a project_members entry.
 */
export function canAccessProject(
  db: Database.Database,
  userId: string,
  role: string,
  projectId: string
): boolean {
  if (role === 'admin') return true;
  const row = db.prepare(
    'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(projectId, userId);
  return !!row;
}

/**
 * Get project IDs accessible to a user.
 * Returns 'all' for admin (no filtering needed), or an array of IDs.
 */
export function getAccessibleProjectIds(
  db: Database.Database,
  userId: string,
  role: string
): string[] | 'all' {
  if (role === 'admin') return 'all';
  const rows = db.prepare(
    'SELECT project_id FROM project_members WHERE user_id = ?'
  ).all(userId) as { project_id: string }[];
  return rows.map((r) => r.project_id);
}

/**
 * Get the task_access level for a user on a project.
 * Returns 'all', 'assigned', or null if no access.
 */
export function getTaskAccess(
  db: Database.Database,
  userId: string,
  role: string,
  projectId: string
): 'all' | 'assigned' | null {
  if (role === 'admin') return 'all';
  const row = db.prepare(
    'SELECT task_access FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(projectId, userId) as { task_access: string } | undefined;
  return (row?.task_access as 'all' | 'assigned') ?? null;
}

/**
 * Check if a user can access a specific task.
 * Admin always can. 'all' task_access = yes. 'assigned' = only if in task_assignees.
 */
export function canAccessTask(
  db: Database.Database,
  userId: string,
  role: string,
  projectId: string,
  taskId: string
): boolean {
  if (role === 'admin') return true;
  const access = getTaskAccess(db, userId, role, projectId);
  if (!access) return false;
  if (access === 'all') return true;
  // 'assigned' — check task_assignees
  const row = db.prepare(
    'SELECT 1 FROM task_assignees WHERE task_id = ? AND user_id = ?'
  ).get(taskId, userId);
  return !!row;
}

/**
 * Check if a user's role allows modifications (create/edit/delete).
 * Viewers are read-only.
 */
export function canModify(role: string): boolean {
  return role !== 'viewer';
}

/**
 * Check if a user can manage project members (add/remove/update access).
 * Admin can always. Managers can on projects they're members of.
 */
export function canManageMembers(
  db: Database.Database,
  userId: string,
  role: string,
  projectId: string
): boolean {
  if (role === 'admin') return true;
  if (role !== 'manager') return false;
  return canAccessProject(db, userId, role, projectId);
}

/**
 * Build a SQL WHERE clause fragment for project access filtering.
 * Returns { clause, params } to inject into queries.
 */
export function projectAccessFilter(
  db: Database.Database,
  userId: string,
  role: string,
  tableAlias = 'p'
): { clause: string; params: unknown[] } {
  if (role === 'admin') return { clause: '', params: [] };
  return {
    clause: `AND ${tableAlias}.id IN (SELECT pm.project_id FROM project_members pm WHERE pm.user_id = ?)`,
    params: [userId],
  };
}
