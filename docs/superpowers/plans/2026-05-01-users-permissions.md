# Users Module — Collaborators, Roles & Permissions

## Context

Currently only 2 hardcoded users (admin + pa) with no access scoping — all authenticated users see all projects and tasks. We need a multi-user system where admin can manage collaborators, grant project access with task-level granularity, supporting the pattern of multiple teams on one project each working on their assigned sub-parts.

---

## Data Model Changes

### Migration 005 — Expand users + add project_members + task_assignees

**Alter `users` table:**
- Expand role CHECK to `('admin', 'manager', 'member', 'viewer')`
- Add `email TEXT` column (for invites/notifications)
- Add `display_name TEXT` column
- Add `active INTEGER NOT NULL DEFAULT 1` (soft-disable accounts)

**Roles:**
| Role | Capabilities |
|---|---|
| `admin` | Full access to everything. Manage users. Manage settings. |
| `manager` | See all projects assigned to them. Create/edit tasks. Manage team on their projects. |
| `member` | See projects granted to them. See tasks based on access level. Edit assigned tasks. |
| `viewer` | Read-only access to granted projects/tasks. |

**New table: `project_members`** — who has access to which project
```sql
CREATE TABLE IF NOT EXISTS project_members (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_access TEXT NOT NULL DEFAULT 'all' CHECK (task_access IN ('all', 'assigned')),
  granted_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, user_id)
);
```
- `task_access = 'all'` — user sees all tasks in the project
- `task_access = 'assigned'` — user only sees tasks explicitly assigned to them

**New table: `task_assignees`** — who is assigned to which task
```sql
CREATE TABLE IF NOT EXISTS task_assignees (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(task_id, user_id)
);
```

**Indexes:**
```sql
CREATE INDEX idx_project_members_project_id ON project_members(project_id);
CREATE INDEX idx_project_members_user_id ON project_members(user_id);
CREATE INDEX idx_task_assignees_task_id ON task_assignees(task_id);
CREATE INDEX idx_task_assignees_user_id ON task_assignees(user_id);
```

**File:** `server/src/db/migrations/005-add-user-permissions.ts`

---

## Access Control Middleware

**New file: `server/src/middleware/access.ts`**

Helper functions that routes call to check access:

```typescript
// Does user have access to this project? (admin always yes)
function canAccessProject(db, userId, role, projectId): boolean

// Get list of project IDs the user can access
function getAccessibleProjectIds(db, userId, role): string[] | 'all'

// Can user see this task? Checks project_members.task_access + task_assignees
function canAccessTask(db, userId, role, projectId, taskId): boolean

// Can user modify? (viewer = no, others = yes if they have access)
function canModify(role): boolean
```

Admin bypasses all checks. For others, queries check `project_members` and `task_assignees`.

---

## API Changes

### New: User Management Routes (`server/src/routes/users.ts`)

Admin-only (+ managers can view team members on their projects):

| Endpoint | Who | Description |
|---|---|---|
| `GET /api/users` | admin | List all users |
| `POST /api/users` | admin | Create user (username, password, role, email, display_name) |
| `GET /api/users/:id` | admin | Get user details |
| `PUT /api/users/:id` | admin | Update user (role, email, display_name, active) |
| `DELETE /api/users/:id` | admin | Deactivate user (set active=0) |
| `POST /api/users/:id/reset-password` | admin | Set new password |

### New: Project Member Routes (`server/src/routes/project-members.ts`)

Mounted under `/api/projects/:projectId/members`:

| Endpoint | Who | Description |
|---|---|---|
| `GET /` | admin, manager of project | List members of project |
| `POST /` | admin, manager of project | Add member `{userId, taskAccess: 'all'|'assigned'}` |
| `PUT /:memberId` | admin, manager | Update task_access |
| `DELETE /:memberId` | admin, manager | Remove member from project |

### New: Task Assignee Routes (added to existing tasks.ts)

| Endpoint | Who | Description |
|---|---|---|
| `GET /:taskId/assignees` | project members | List assignees |
| `POST /:taskId/assignees` | admin, manager, member with 'all' access | Assign user `{userId}` |
| `DELETE /:taskId/assignees/:userId` | admin, manager | Unassign user |

### Modified: Projects Route (`server/src/routes/projects.ts`)

**GET /** — filter by access:
```sql
-- For non-admin users, add:
AND p.id IN (SELECT pm.project_id FROM project_members pm WHERE pm.user_id = ?)
```
Admin sees all (no filter added).

**GET /:id** — check `canAccessProject()` before returning.

**POST** — auto-add creator as project member. Check `canModify()`.

**PUT, DELETE** — check `canModify()` + access.

### Modified: Tasks Route (`server/src/routes/tasks.ts`)

**GET /** — filter by task access:
- If user's `project_members.task_access = 'all'` → return all tasks
- If `'assigned'` → only tasks where user is in `task_assignees`
- Admin → all tasks

```sql
-- For 'assigned' access:
AND t.id IN (SELECT ta.task_id FROM task_assignees ta WHERE ta.user_id = ?)
```

**GET /:taskId** — check `canAccessTask()`.

**POST** — require project access + `canModify()`.

**PUT, DELETE** — require task access + `canModify()`.

### Modified: Dashboard Route (`server/src/routes/dashboard.ts`)

All queries get project-scoped filtering for non-admin users using the accessible project IDs list.

### Modified: Auth Routes (`server/src/routes/auth.ts`)

**GET /me** — include `email`, `display_name` in response.

**Login** — reject if `active = 0`.

### Modified: Seed (`server/src/db/seed.ts`)

Map existing `pa` role to `manager` in the migration.

---

## Frontend Changes

### New: Users Page (`client/src/pages/Users.tsx`)

Admin-only page for managing collaborators:
- Table: username, display_name, email, role, active status
- Create user modal: username, password, display_name, email, role dropdown
- Edit user: change role, display_name, email, toggle active
- Reset password action

### New: Project Members Panel (in `ProjectDetail.tsx`)

Section in project detail for managing who has access:
- List of current members with their role and task_access setting
- "Add Member" — select user from dropdown, choose access level (all tasks / assigned only)
- Remove member button
- Only visible to admin and project managers

### New: Task Assignees (in task modal within `ProjectDetail.tsx`)

- Show assigned users on each task card as avatars/initials
- In task modal: "Assignees" section with add/remove
- When `task_access = 'assigned'`, members only see their assigned tasks on the board

### Modified: Sidebar (`client/src/components/Sidebar.tsx`)

- Add "Users" nav link (admin-only, like Settings)
- Show current user's display_name instead of just username

### Modified: App.tsx

- Add `/users` route

### Modified: Auth context (`client/src/lib/auth.tsx`)

- User type: add `email`, `display_name` fields

---

## Files to Create (5)

| File | Purpose |
|---|---|
| `server/src/db/migrations/005-add-user-permissions.ts` | Schema: expand users, add project_members + task_assignees |
| `server/src/middleware/access.ts` | Access control helper functions |
| `server/src/routes/users.ts` | User CRUD (admin-only) |
| `server/src/routes/project-members.ts` | Project membership management |
| `client/src/pages/Users.tsx` | User management page |

## Files to Modify (12)

| File | Change |
|---|---|
| `server/src/db/migrations/index.ts` | Register migration 005 |
| `server/src/routes/projects.ts` | Filter by project access, auto-add creator |
| `server/src/routes/tasks.ts` | Filter by task access + assignee endpoints |
| `server/src/routes/dashboard.ts` | Scope stats to accessible projects |
| `server/src/routes/auth.ts` | Return email/display_name, reject inactive |
| `server/src/db/seed.ts` | Update seeded role for pa user |
| `server/src/app.ts` | Mount users + project-members routes |
| `server/src/types.ts` | Add email, display_name to session |
| `client/src/lib/auth.tsx` | Expand User type |
| `client/src/pages/ProjectDetail.tsx` | Add members panel + task assignees |
| `client/src/components/Sidebar.tsx` | Add Users nav link |
| `client/src/App.tsx` | Add /users route |

---

## Implementation Sequence

1. Migration 005 (schema changes)
2. Register migration in index.ts
3. Access control middleware
4. User management routes + mount
5. Project members routes + mount
6. Modify projects route (access filtering)
7. Modify tasks route (access filtering + assignee endpoints)
8. Modify dashboard route (scoped stats)
9. Modify auth (login/me changes, session types)
10. Update seed.ts
11. Frontend: auth type, Users page, App.tsx route, Sidebar link
12. Frontend: ProjectDetail members panel + task assignees
13. Verify all tests pass

---

## Verification

1. **Migration**: Server starts cleanly, `migrate:status` shows 005 applied
2. **User CRUD**: Admin creates a member user → logs in as member → can't see settings or users page
3. **Project access**: Admin grants member access to Project A → member sees only Project A on board
4. **Task access "all"**: Member with `task_access='all'` sees all tasks in Project A
5. **Task access "assigned"**: Change to `'assigned'` → member only sees tasks assigned to them
6. **Viewer role**: Viewer can see but not create/edit/delete
7. **Dashboard scoping**: Member's dashboard only shows stats for accessible projects
8. **Inactive user**: Deactivated user can't log in
9. **Existing tests**: All 45 tests still pass
