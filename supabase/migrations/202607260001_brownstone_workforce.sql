-- Brownstone Careers Workforce Platform v9.0
-- Run in the Supabase SQL Editor or through the Supabase CLI.

create extension if not exists pgcrypto;

do $$ begin
  create type public.workforce_role as enum ('super_admin','recruiter','reviewer','support','auditor');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.candidate_status as enum ('applicant','approved','invited','onboarding','correction_required','completed','active','suspended','rejected');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.task_status as enum ('assigned','in_progress','submitted','approved','correction_required','completed','waived');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  account_type text not null check (account_type in ('candidate','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admins (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.workforce_role not null default 'reviewer',
  status text not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  reference text unique not null,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone text,
  city text,
  state_province text,
  country text,
  work_authorization text,
  sponsorship_required text,
  role text not null,
  status public.candidate_status not null default 'applicant',
  recruitment_stage text not null default 'application_received',
  onboarding_progress integer not null default 0 check (onboarding_progress between 0 and 100),
  assigned_admin_id uuid references public.admins(id),
  session_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  code_hash text not null unique,
  code_hint text not null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  activated_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.admins(id)
);

create table if not exists public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  category text not null default 'general',
  role_scope text[] not null default array['*'],
  requires_submission boolean not null default true,
  requires_signature boolean not null default false,
  requires_admin_review boolean not null default true,
  form_schema jsonb not null default '{}'::jsonb,
  instructions text,
  sort_order integer not null default 100,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidate_tasks (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  task_id uuid not null references public.onboarding_tasks(id),
  status public.task_status not null default 'assigned',
  assigned_at timestamptz not null default now(),
  due_at timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.admins(id),
  admin_feedback text,
  signature_name text,
  signature_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(candidate_id, task_id)
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  candidate_task_id uuid not null references public.candidate_tasks(id) on delete cascade,
  submission_type text not null default 'form',
  response jsonb not null default '{}'::jsonb,
  status text not null default 'submitted',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.admins(id),
  reviewer_feedback text
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  category text not null,
  storage_path text not null unique,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  status text not null default 'submitted',
  retention_policy text not null default 'verification-only',
  delete_after timestamptz,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.admins(id)
);

create table if not exists public.sensitive_identity_records (
  candidate_id uuid primary key references public.candidates(id) on delete cascade,
  legal_name text not null,
  encrypted_payload text not null,
  encryption_version text not null default 'v1',
  ssn_last4 text,
  work_authorization_status text,
  verification_status text not null default 'submitted',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.admins(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null,
  actor_id text,
  candidate_id uuid references public.candidates(id) on delete set null,
  event_type text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  country_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  status text not null default 'open',
  priority text not null default 'normal',
  sentiment text not null default 'neutral',
  topic text,
  assigned_admin_id uuid references public.admins(id),
  escalated_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_type text not null,
  sender_id text,
  message text not null,
  intent text,
  sentiment text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.candidate_notifications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null default 'general',
  status text not null default 'unread',
  action_url text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  admin_id uuid not null references public.admins(id),
  note text not null,
  visibility text not null default 'internal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references public.candidates(id) on delete set null,
  provider_message_id text,
  channel text not null,
  template_name text not null,
  recipient text not null,
  subject text not null,
  status text not null default 'queued',
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  email_message_id uuid references public.email_messages(id) on delete cascade,
  provider_event_id text unique,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table if not exists public.training_modules (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  sort_order integer not null default 100,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_progress (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  status text not null default 'not_started',
  score numeric,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(candidate_id, module_id)
);

create table if not exists public.orientation_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  meeting_url text,
  status text not null default 'scheduled',
  created_by uuid references public.admins(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orientation_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.orientation_events(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  status text not null default 'invited',
  confirmed_at timestamptz,
  attended_at timestamptz,
  notes text,
  unique(event_id, candidate_id)
);

alter table public.profiles enable row level security;
alter table public.admins enable row level security;
alter table public.candidates enable row level security;
alter table public.invitations enable row level security;
alter table public.onboarding_tasks enable row level security;
alter table public.candidate_tasks enable row level security;
alter table public.submissions enable row level security;
alter table public.documents enable row level security;
alter table public.sensitive_identity_records enable row level security;
alter table public.audit_events enable row level security;
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
alter table public.candidate_notifications enable row level security;
alter table public.admin_notes enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_events enable row level security;
alter table public.training_modules enable row level security;
alter table public.training_progress enable row level security;
alter table public.orientation_events enable row level security;
alter table public.orientation_attendance enable row level security;

create or replace function public.current_candidate_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.candidates where auth_user_id = auth.uid() limit 1
$$;

create or replace function public.current_admin_role()
returns public.workforce_role language sql stable security definer set search_path = public as $$
  select role from public.admins where id = auth.uid() and status = 'active' limit 1
$$;

drop policy if exists "candidate reads own profile" on public.candidates;
drop policy if exists "candidate reads active task catalog" on public.onboarding_tasks;
drop policy if exists "candidate reads own tasks" on public.candidate_tasks;
drop policy if exists "candidate reads own submissions" on public.submissions;
drop policy if exists "candidate creates own submissions" on public.submissions;
drop policy if exists "candidate reads own documents" on public.documents;
drop policy if exists "candidate reads own conversations" on public.support_conversations;
drop policy if exists "candidate creates own conversations" on public.support_conversations;
drop policy if exists "candidate reads own messages" on public.support_messages;
drop policy if exists "candidate creates own messages" on public.support_messages;

create policy "candidate reads own profile" on public.candidates for select to authenticated using (auth_user_id = auth.uid());
create policy "candidate reads active task catalog" on public.onboarding_tasks for select to authenticated using (status = 'active');
create policy "candidate reads own tasks" on public.candidate_tasks for select to authenticated using (candidate_id = public.current_candidate_id());
create policy "candidate reads own submissions" on public.submissions for select to authenticated using (candidate_id = public.current_candidate_id());
create policy "candidate creates own submissions" on public.submissions for insert to authenticated with check (
  candidate_id = public.current_candidate_id()
  and exists (
    select 1 from public.candidate_tasks ct
    where ct.id = candidate_task_id and ct.candidate_id = public.current_candidate_id()
  )
);
create policy "candidate reads own documents" on public.documents for select to authenticated using (candidate_id = public.current_candidate_id());
create policy "candidate reads own conversations" on public.support_conversations for select to authenticated using (candidate_id = public.current_candidate_id());
create policy "candidate creates own conversations" on public.support_conversations for insert to authenticated with check (candidate_id = public.current_candidate_id());
create policy "candidate reads own messages" on public.support_messages for select to authenticated using (conversation_id in (select id from public.support_conversations where candidate_id = public.current_candidate_id()));
create policy "candidate creates own messages" on public.support_messages for insert to authenticated with check (conversation_id in (select id from public.support_conversations where candidate_id = public.current_candidate_id()));

drop policy if exists "candidate reads own profile record" on public.profiles;
drop policy if exists "candidate reads own notifications" on public.candidate_notifications;
drop policy if exists "candidate reads active training catalog" on public.training_modules;
drop policy if exists "candidate reads own training progress" on public.training_progress;
drop policy if exists "candidate reads assigned orientation" on public.orientation_events;
drop policy if exists "candidate reads own orientation attendance" on public.orientation_attendance;

create policy "candidate reads own profile record" on public.profiles for select to authenticated using (id = auth.uid());
create policy "candidate reads own notifications" on public.candidate_notifications for select to authenticated using (candidate_id = public.current_candidate_id());
create policy "candidate reads active training catalog" on public.training_modules for select to authenticated using (status = 'active');
create policy "candidate reads own training progress" on public.training_progress for select to authenticated using (candidate_id = public.current_candidate_id());
create policy "candidate reads assigned orientation" on public.orientation_events for select to authenticated using (id in (select event_id from public.orientation_attendance where candidate_id = public.current_candidate_id()));
create policy "candidate reads own orientation attendance" on public.orientation_attendance for select to authenticated using (candidate_id = public.current_candidate_id());

-- Admin access is normally performed by trusted Cloudflare Functions using the Supabase secret key.
-- Do not expose the Supabase secret/service-role key in browser code.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workforce-private-documents','workforce-private-documents',false,8388608,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "candidate uploads to own private folder" on storage.objects;
drop policy if exists "candidate reads own private files" on storage.objects;

create policy "candidate uploads to own private folder" on storage.objects for insert to authenticated
with check (bucket_id = 'workforce-private-documents' and (storage.foldername(name))[1] = public.current_candidate_id()::text);
create policy "candidate reads own private files" on storage.objects for select to authenticated
using (bucket_id = 'workforce-private-documents' and (storage.foldername(name))[1] = public.current_candidate_id()::text);
