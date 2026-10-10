# Branch Manager — React Native Mobile App Spec

## Status: ABANDONED — went with Capacitor PWA wrapper instead
## Original draft: 2026-04-09
## Abandoned (noted): 2026-04-25

The Capacitor approach (web app loaded inside a thin native shell, plus the
background-geolocation plugin) shipped faster and reuses the existing PWA
codebase. The native app loads `peekskilltree.com/branchmanager/` live, so
JS updates ship via the web deploy without an App Store rebuild.

- Sync script: `~/Desktop/Tree/Claude-branch-manager/sync-from-peekskilltree.sh`
- Capacitor config: `~/Desktop/Tree/peekskilltree-deploy/branchmanager/capacitor.config.json`

This RN spec is preserved as historical reference for the path not taken.

---

## (Original spec below — for reference only)

## Overview
Full React Native + TypeScript native app for Branch Manager.
Wraps the same Supabase backend as the web PWA.
Bottom tab navigation on mobile, matching Jobber's mobile layout.

## Tech Stack
- React Native + TypeScript
- React Navigation (stack + bottom tabs)
- React Query (Supabase data)
- Supabase JS client (auth, realtime, storage)
- Mobile-first iPhone layout
- Jobber-style navigation + spacing

## Project Structure

```
/src
  /components - shared UI (StatCard, Badge, FilterChips, SearchBar, EmptyState, Avatar)
  /screens
    /home - DashboardScreen
    /schedule - ScheduleScreen, DayDetailScreen
    /clients - ClientsScreen, ClientDetailScreen
    /requests - RequestsScreen, RequestDetailScreen
    /quotes - QuotesScreen, QuoteDetailScreen, QuoteFormScreen
    /jobs - JobsScreen, JobDetailScreen, VisitsTab
    /invoices - InvoicesScreen, InvoiceDetailScreen, PaymentsTab
    /reports - ReportsOverview, ProfitLoss, Expenses, JobCosting, Budget, WeeklySummary
    /marketing - ReviewsScreen, CampaignsScreen, ReferralsScreen, ReviewToolsScreen, OnlineBookingScreen
    /people - TeamScreen, TimesheetScreen, PayrollScreen, PerformanceScreen, MyPayScreen
    /operations - DispatchScreen, PipelineScreen, RecurringScreen, AutomationsScreen, EquipmentScreen
    /client-hub - ClientPortalScreen, MessagesScreen, SatisfactionScreen, FormsScreen, EmailTemplatesScreen, ReceptionistScreen
    /media - MediaCenterScreen, BeforeAfterScreen
    /tools - AIScreen, CalculatorsScreen, AITreeIDScreen, VideoQuoteScreen, TreeMeasureScreen
    /settings - SettingsScreen (includes Permissions, Custom Fields, Backup, Import)
    /search - SearchScreen
    /notifications - NotificationsScreen
  /navigation - AppNavigator, BottomTabs, MoreStack
  /api - supabase client, auth, sync
  /hooks - useClients, useJobs, useQuotes, useInvoices, useTeam, usePayroll, useSearch
  /models - Client, Request, Quote, Job, Invoice, Payment, Employee, Timesheet
  /utils - formatters, date, money, permissions
```

## Bottom Tab Navigation (5 tabs)
```
Home | Schedule | Notifications | Search | More
```

- **Home** — Dashboard with greeting, monthly goal, workflow cards, money on the table, daily briefing, today's jobs, conversion buttons, action items, receivables
- **Schedule** — Calendar (week/month), job cards per day, inline weather
- **Notifications** — Activity feed (new requests, overdue invoices, stale quotes, job updates)
- **Search** — Global search across clients, jobs, invoices, quotes, requests with category tabs
- **More** — Full menu matching web sidebar structure:
  - Clients, Requests, Quotes, Jobs, Invoices (w/ Payments tab)
  - Reports: Overview, P&L, Expenses, Job Costing, Budget, Weekly Summary, Export
  - Marketing: Reviews, Review Tools, Campaigns, Referrals, Online Booking
  - People: Team, Timesheets, Payroll, Performance, My Pay, Onboarding
  - Team Chat: Team Chat, Tasks & Reminders
  - Operations: Dispatch, Pipeline, Recurring, Automations, Checklists, Equipment
  - Client Hub: Client Portal, Messages, Satisfaction, Forms, Email Templates, Receptionist
  - Media: Media Center, Before/After
  - Tools: AI Assistant, Calculators, AI Tree ID, Video Quote, Tree Measure
  - Settings (includes Permissions, Custom Fields, Backup, Import)

## Key Screens (matching web PWA)

### Core Pipeline
1. **DashboardScreen** — Workflow cards, money on the table, daily briefing, today's jobs, conversion buttons (quote→job, job→invoice), receivables
2. **ScheduleScreen** — Week/month calendar, job cards, inline weather, photo toggle
3. **ClientsScreen** — List with tags, last activity, search, filter chips, Map button
4. **RequestsScreen** — Alert cards, stats bar, table, status badges
5. **QuotesScreen** — Stats row, filter chips, Property Map button, search
6. **QuoteFormScreen** — Full form: service selector, AI tree ID, line items, pricing prompts (DBH×$100, radius×$10, cable×$10/ft), auto-save
7. **JobsScreen** — Stats row, filter chips, batch actions, Jobs/Visits tabs
8. **InvoicesScreen** — Stats row, filter chips, Invoices/Payments tabs, batch invoice from jobs

### Reports (collapsible in More)
9. **ReportsOverview** — Revenue charts, pipeline metrics (renamed from Insights)
10. **ProfitLoss** — P&L statement
11. **Expenses** — Expense tracking
12. **JobCosting** — Per-job profitability
13. **Budget** — Budget planner
14. **WeeklySummary** — Week review

### Team & Payroll
14. **TeamScreen** — Employee roster, roles, contact info
15. **TimesheetScreen** — Week view, employee rows, day cells, approval system
16. **PayrollScreen** — Gusto-style weekly payroll with approval workflow

### Field Tools
17. **DispatchScreen** — MapLibre GPS map, crew locations, route planning
18. **SearchScreen** — Global search with category tabs, recent searches, live results
19. **NotificationsScreen** — Activity feed, actionable items

## Data Models
- Client: id, name, address, phone, email, status, tags, notes, photos
- Request: id, clientId, description, status, source, photos, createdAt
- Quote: id, clientId, lineItems, total, status, expiresAt, signature
- Job: id, clientId, quoteId, lineItems, total, status, scheduledDate, crew, visits
- Invoice: id, clientId, jobId, lineItems, total, balance, status, dueDate
- Payment: id, invoiceId, amount, method, date
- Employee: id, name, phone, email, payRate, role, active
- TimesheetDay: id, employeeId, date, hours[], notes[], photos[], status

## RBAC
8 roles (Super Admin, Owner, Admin, Manager, Payroll Admin, Accountant, HR Manager, Employee)
Multi-role + inheritance, 25 permission keys

## API
All data through Supabase REST API + Realtime subscriptions
- Auth: Supabase Auth (email/password)
- Storage: Supabase Storage (photos, documents)
- Edge Functions: stripe-webhook, request-notify

## Build Priority
1. Navigation (BottomTabs + MoreStack)
2. DashboardScreen + SearchScreen
3. ClientsScreen + RequestsScreen
4. QuotesScreen + QuoteFormScreen
5. JobsScreen + InvoicesScreen (with tabs)
6. ScheduleScreen
7. TimesheetScreen + PayrollScreen
8. NotificationsScreen
9. Reports screens
10. Field tools (Dispatch, AI Tree ID, Calculators)
11. Settings + RBAC
