# Kanboard — Project Tracker Design Spec

**Date:** 2026-04-28
**Status:** Approved

---

## What We're Building

A web-based internal project tracker for a custom systems developer and their Personal Assistant (PA). Projects are grouped by customer. The tool surfaces blockers, drives accountability via notifications, and gives customers a read-only share link to their project board — no login required.

---

## Key Requirements

- 2 internal users: admin (Daniel) + PA
- Customers managed in the system (name, email, phone, notes)
- Each customer can have multiple projects
- Kanban board with 6 stages: Scoping → Quoted → In Progress → Review → Blocked → Done
- Blockers can be attached to a project OR to an individual task
- Notifications via Email (Resend), Slack webhook, and in-app
- Customers get a read-only share link (UUID token, no login)
- Dark/light theme

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React (Vite) + Tailwind CSS |
| Backend | Express.js (TypeScript) |
| Database | SQLite via better-sqlite3 |
| Auth | bcrypt + express-session |
| Email | Resend SDK |
| Slack | Incoming webhook URL |
| File uploads | Multer → local `/uploads/` |

---

## Data Model

```sql
users (id, username, password_hash, role)
customers (id, name, email, phone, notes, color, created_at)
projects (id, customer_id, title, description, stage, due_date, share_token, archived, created_at, updated_at)
tasks (id, project_id, title, description, stage, sort_order, created_at)
  -- task.stage: todo | inprogress | blocked | done
blockers (id, project_id, task_id[nullable], description, resolved, created_at, resolved_at)
attachments (id, project_id, filename, original_name, size_bytes, created_at)
activity (id, project_id, task_id, user_id, type, payload, created_at)
notifications (id, user_id[nullable], project_id, type, message, read, created_at)
```

`blockers.task_id` is nullable: NULL means project-level blocker; populated means task-level blocker.

`tasks.stage` gives each task its own kanban position within a project.

---

## Pages

### Dashboard (`/`)
- Stats: active projects, blocked count, due this week, completed this month
- Active blockers table with "Follow Up" CTA
- Projects due in 7 days
- Recent activity feed (last 20 events)

### Board (`/board`)
- Left sidebar: logo, nav (Dashboard / Board / Customers / Notifications), customer list with color dots + project counts, theme toggle
- Top bar: breadcrumb, Board/List tabs, "+ New Project"
- Blocker alert strip when active blockers exist
- 6 kanban columns — each card shows: project ID, title, customer chip, task progress ring, due date, blocker indicator
- Click card → navigates to Project Detail page (`/projects/:id`)

### Project Detail Page (`/projects/:id`)
- Header: project title, customer strip (name, email, phone, Notes link), stage selector, due date, share link, action buttons (Notify PA | Follow Up | Edit | Add Blocker | Archive)
- Project-level blockers section (add / resolve)
- **Task Kanban board** — 4 columns: To Do → In Progress → Blocked → Done
  - Each task card: task ID, title, active blocker indicator
  - Click task card → opens Task Modal overlay
  - "+ Add task" button per column
- File attachments section (upload + list + download)
- Activity log

### Task Modal (Jira-style overlay)
- Task ID, title, stage chip (moveable)
- Meta: project, customer, created date
- Description (editable)
- Task-level blockers (add / resolve)
- Activity/comments log
- "Mark Done" / stage selector button

### Customers (`/customers`)
- Customer list: name, email, phone, project count, active blockers
- Customer detail: notes + project list
- Add new customer form

### Notifications (`/notifications`)
- All notifications, filterable by type
- Mark read / mark all read
- In-app badge in sidebar (unread count)

### Share View (`/share/:token`) — public, no auth
- Read-only board for a single customer's projects
- Shows: project name, stage, task progress, due date
- No blocker details, no internal notes

---

## Notification Triggers

| Event | Channels | Recipients |
|---|---|---|
| Project → Blocked | Email + Slack + in-app | Both users |
| Blocker added (project or task) | Email + Slack + in-app | Both users |
| Blocker unresolved 3+ days | Slack + in-app (daily) | Both users |
| Project past due date | Email + in-app (daily digest) | Both users |
| Project → Done | Slack + in-app | Both users |
| "Follow Up" / "Notify PA" button | Email + in-app | PA only |

Daily overdue scan: `node-cron` job at 08:00.

---

## Design Reference

Visual style inspired by [kaneo.app](https://kaneo.app/): clean, minimal, dark/light themes, rounded cards, left sidebar navigation.
