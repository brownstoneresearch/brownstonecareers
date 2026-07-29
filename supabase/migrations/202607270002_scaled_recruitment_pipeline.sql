-- Brownstone Careers v9.3 scaled recruitment pipeline.
-- Adds administrator-controlled manual invitations, stage rankings and alerts,
-- and human-reviewed AI-assisted pre-screening structures.

alter table public.candidates
  add column if not exists invitation_origin text,
  add column if not exists manual_invite_reason text,
  add column if not exists manual_invite_approved_by uuid references public.admins(id),
  add column if not exists manual_invite_approved_at timestamptz,
  add column if not exists pipeline_score numeric(5,1) not null default 0,
  add column if not exists pipeline_rank integer,
  add column if not exists prescreening_score numeric(5,1);

update public.candidates
set invitation_origin = case
      when application_submitted_at is not null then 'application'
      when status in ('invited','onboarding','completed','active') then 'admin_manual'
      else invitation_origin
    end,
    manual_invite_reason = case
      when application_submitted_at is null and status in ('invited','onboarding','completed','active')
        then coalesce(manual_invite_reason, 'Legacy administrator invitation retained during the v9.3 controlled migration.')
      else manual_invite_reason
    end,
    manual_invite_approved_by = case
      when application_submitted_at is null and status in ('invited','onboarding','completed','active')
        then coalesce(manual_invite_approved_by, assigned_admin_id)
      else manual_invite_approved_by
    end,
    manual_invite_approved_at = case
      when application_submitted_at is null and status in ('invited','onboarding','completed','active')
        then coalesce(manual_invite_approved_at, invited_from_application_at, updated_at, created_at)
      else manual_invite_approved_at
    end;

create or replace function public.enforce_controlled_candidate_invitation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'invited' and new.application_submitted_at is null then
    if new.invitation_origin is distinct from 'admin_manual'
       or new.manual_invite_approved_by is null
       or not exists (select 1 from public.admins a where a.id = new.manual_invite_approved_by and a.status = 'active')
       or new.manual_invite_approved_at is null
       or length(trim(coalesce(new.manual_invite_reason, ''))) < 10 then
      raise exception 'manual candidate invitation requires an administrator override, timestamp, and reason';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists candidates_application_first_invitation on public.candidates;
drop trigger if exists candidates_controlled_invitation on public.candidates;
create trigger candidates_controlled_invitation
before insert or update of status, application_submitted_at, invitation_origin,
  manual_invite_reason, manual_invite_approved_by, manual_invite_approved_at
on public.candidates
for each row execute function public.enforce_controlled_candidate_invitation();

create index if not exists candidates_pipeline_rank_idx
  on public.candidates (pipeline_rank, pipeline_score desc);
create index if not exists candidates_invitation_origin_idx
  on public.candidates (invitation_origin, manual_invite_approved_at desc);

create table if not exists public.candidate_stage_progress (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  stage_key text not null,
  status text not null default 'pending',
  completion_percent numeric(5,1) not null default 0 check (completion_percent between 0 and 100),
  score numeric(5,1) check (score is null or score between 0 and 100),
  source text not null default 'system',
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references public.admins(id),
  updated_at timestamptz not null default now(),
  unique(candidate_id, stage_key)
);

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.admins(id) on delete cascade,
  candidate_id uuid references public.candidates(id) on delete cascade,
  notification_type text not null default 'general',
  stage_key text,
  tone_key text not null default 'general',
  title text not null,
  message text not null,
  action_url text,
  status text not null default 'unread',
  unique_key text unique,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.prescreen_question_sets (
  id text primary key,
  title text not null,
  description text,
  role_scope text not null default '*',
  instructions text,
  pass_score numeric(5,1) not null default 70 check (pass_score between 0 and 100),
  status text not null default 'draft',
  version integer not null default 1,
  created_by uuid references public.admins(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prescreen_questions (
  id text primary key,
  question_set_id text not null references public.prescreen_question_sets(id) on delete cascade,
  prompt text not null,
  question_type text not null default 'textarea',
  options jsonb not null default '[]'::jsonb,
  required boolean not null default true,
  max_points numeric(7,2) not null default 10,
  rubric text not null,
  ai_guidance text,
  sort_order integer not null default 100,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidate_prescreens (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  question_set_id text not null references public.prescreen_question_sets(id),
  status text not null default 'assigned',
  assigned_by uuid references public.admins(id),
  due_at timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  ai_scored_at timestamptz,
  ai_model text,
  ai_score numeric(5,1),
  ai_summary text,
  ai_risk_flags jsonb not null default '[]'::jsonb,
  admin_score numeric(5,1),
  final_score numeric(5,1),
  result_status text not null default 'pending',
  admin_feedback text,
  reviewed_by uuid references public.admins(id),
  reviewed_at timestamptz,
  result_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prescreen_answers (
  id uuid primary key default gen_random_uuid(),
  candidate_prescreen_id uuid not null references public.candidate_prescreens(id) on delete cascade,
  question_id text not null references public.prescreen_questions(id),
  answer_text text,
  answer jsonb not null default '{}'::jsonb,
  ai_score numeric(7,2),
  ai_feedback text,
  admin_score numeric(7,2),
  admin_feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(candidate_prescreen_id, question_id)
);

create index if not exists candidate_stage_progress_candidate_idx
  on public.candidate_stage_progress (candidate_id, stage_key, status);
create index if not exists admin_notifications_queue_idx
  on public.admin_notifications (admin_id, status, created_at desc);
create index if not exists candidate_prescreens_review_idx
  on public.candidate_prescreens (status, submitted_at desc);
create index if not exists candidate_prescreens_candidate_idx
  on public.candidate_prescreens (candidate_id, created_at desc);
create index if not exists prescreen_questions_set_idx
  on public.prescreen_questions (question_set_id, status, sort_order);

alter table public.candidate_stage_progress enable row level security;
alter table public.admin_notifications enable row level security;
alter table public.prescreen_question_sets enable row level security;
alter table public.prescreen_questions enable row level security;
alter table public.candidate_prescreens enable row level security;
alter table public.prescreen_answers enable row level security;

drop policy if exists "candidate reads own stage progress" on public.candidate_stage_progress;
drop policy if exists "candidate reads published pre-screen sets" on public.prescreen_question_sets;
drop policy if exists "candidate reads assigned pre-screen questions" on public.prescreen_questions;
drop policy if exists "candidate reads own pre-screen assignments" on public.candidate_prescreens;
drop policy if exists "candidate reads own pre-screen answers" on public.prescreen_answers;

create policy "candidate reads own stage progress"
on public.candidate_stage_progress for select to authenticated
using (candidate_id = public.current_candidate_id());

create policy "candidate reads published pre-screen sets"
on public.prescreen_question_sets for select to authenticated
using (status = 'published' and id in (
  select question_set_id from public.candidate_prescreens
  where candidate_id = public.current_candidate_id()
));

create policy "candidate reads assigned pre-screen questions"
on public.prescreen_questions for select to authenticated
using (status = 'active' and question_set_id in (
  select question_set_id from public.candidate_prescreens
  where candidate_id = public.current_candidate_id()
));

create policy "candidate reads own pre-screen assignments"
on public.candidate_prescreens for select to authenticated
using (candidate_id = public.current_candidate_id());

create policy "candidate reads own pre-screen answers"
on public.prescreen_answers for select to authenticated
using (candidate_prescreen_id in (
  select id from public.candidate_prescreens
  where candidate_id = public.current_candidate_id()
));

-- Candidate writes and all administrator actions remain server-side through trusted
-- Cloudflare Functions. AI output is advisory; a human administrator records final_score,
-- result_status and candidate-facing feedback before release.

insert into public.prescreen_question_sets
(id, title, description, role_scope, instructions, pass_score, status, version)
values
('brownstone-standard-prescreen-v1',
 'Brownstone Careers Standard Pre-Screening',
 'Administrator-managed job-related pre-screening for remote Brownstone Careers pathways.',
 '*',
 'Answer each question clearly and truthfully. Do not include government ID numbers, banking details, passwords, medical information, or protected personal information.',
 70, 'published', 1)
on conflict (id) do nothing;

insert into public.prescreen_questions
(id, question_set_id, prompt, question_type, required, max_points, rubric, ai_guidance, sort_order, status)
values
('psq-role-fit','brownstone-standard-prescreen-v1','Briefly introduce yourself and explain why your selected Brownstone Careers role fits your experience and goals.','textarea',true,10,'Award points for a clear introduction, direct connection to the selected role, relevant experience, and realistic goals.','Focus only on job-related evidence and clarity. Do not infer protected characteristics.',10,'active'),
('psq-relevant-experience','brownstone-standard-prescreen-v1','Describe your most relevant work experience, responsibilities, and one measurable or concrete achievement.','textarea',true,15,'Award points for relevant responsibilities, specific examples, credible outcomes, and ownership of work.','Do not reward employer prestige; score demonstrated competencies.',20,'active'),
('psq-organization','brownstone-standard-prescreen-v1','How do you organize multiple priorities and complete tasks accurately while working remotely with limited supervision?','textarea',true,15,'Award points for a repeatable system, prioritization, deadlines, communication, quality checks, and accountability.','Prefer concrete methods over vague claims.',30,'active'),
('psq-technology','brownstone-standard-prescreen-v1','Which workplace tools or technologies can you use confidently, and how have you used them to complete work?','textarea',true,10,'Award points for relevant tools, practical use cases, adaptability, and willingness to learn.','Do not require a specific brand unless the role requires it.',40,'active'),
('psq-accuracy-confidentiality','brownstone-standard-prescreen-v1','Describe how you would protect confidential information and prevent errors when handling records, customer details, or financial data.','textarea',true,15,'Award points for least-access principles, verification, secure channels, device practices, escalation, and correction procedures.','Flag only job-related security concerns. Do not request sensitive data.',50,'active'),
('psq-scenario','brownstone-standard-prescreen-v1','A time-sensitive task contains unclear instructions and the assigned manager is temporarily unavailable. What would you do?','textarea',true,15,'Award points for clarifying available evidence, documenting assumptions, prioritizing low-risk work, communicating, and avoiding unauthorized decisions.','Score judgment, communication, and risk awareness.',60,'active'),
('psq-availability','brownstone-standard-prescreen-v1','State your realistic weekly availability, time zone, and how you will communicate schedule changes or missed deadlines.','textarea',true,10,'Award points for specific, realistic availability and proactive communication practices.','Do not consider family status or personal circumstances; score only stated work availability and communication.',70,'active'),
('psq-growth','brownstone-standard-prescreen-v1','What professional skill would you like to develop over the next year, and what steps are you already taking?','textarea',true,10,'Award points for a relevant growth target, self-awareness, concrete steps, and a realistic learning plan.','Score evidence of learning behavior rather than personality style.',80,'active')
on conflict (id) do nothing;
