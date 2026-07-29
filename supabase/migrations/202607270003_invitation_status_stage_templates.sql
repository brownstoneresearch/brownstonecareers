-- Brownstone Careers v9.4 invitation status/stage templates.
-- Supabase parity migration; D1 remains the active runtime until an explicit cutover.

alter table public.candidates
  add column if not exists invitation_status_key text not null default 'invited',
  add column if not exists invitation_stage_key text not null default 'application_received',
  add column if not exists invitation_template_key text,
  add column if not exists last_invitation_id uuid,
  add column if not exists last_invited_at timestamptz;

alter table public.invitations
  add column if not exists template_key text,
  add column if not exists initial_status text,
  add column if not exists initial_stage text,
  add column if not exists email_subject text;

update public.candidates
set invitation_status_key = case
      when status::text in ('invited','approved','onboarding','correction_required','completed','active') then status::text
      else 'invited'
    end,
    invitation_stage_key = case
      when recruitment_stage in ('application_received','pre_screening','assessment','interview','offer','verification','onboarding','orientation','active_worker') then recruitment_stage
      else 'application_received'
    end,
    invitation_template_key = coalesce(invitation_template_key,
      case recruitment_stage
        when 'pre_screening' then 'prescreen-access.'
        when 'assessment' then 'assessment-access.'
        when 'interview' then 'interview-access.'
        when 'offer' then 'offer-access.'
        when 'verification' then 'verification-access.'
        when 'onboarding' then 'onboarding-access.'
        when 'orientation' then 'orientation-access.'
        when 'active_worker' then 'worker-access.'
        else 'secure-application.'
      end || case
        when status::text in ('invited','approved','onboarding','correction_required','completed','active') then status::text
        else 'invited'
      end);

update public.invitations i
set initial_status = coalesce(i.initial_status, c.invitation_status_key, 'invited'),
    initial_stage = coalesce(i.initial_stage, c.invitation_stage_key, 'application_received'),
    template_key = coalesce(i.template_key, c.invitation_template_key, 'secure-application.invited')
from public.candidates c
where c.id = i.candidate_id;

update public.candidates c
set last_invitation_id = coalesce(c.last_invitation_id, latest.id),
    last_invited_at = coalesce(c.last_invited_at, latest.created_at)
from lateral (
  select i.id, i.created_at
  from public.invitations i
  where i.candidate_id = c.id
  order by i.created_at desc
  limit 1
) latest;

create or replace function public.enforce_controlled_candidate_invitation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.invitation_status_key not in ('invited','approved','onboarding','correction_required','completed','active') then
    raise exception 'unsupported invitation status';
  end if;
  if new.invitation_stage_key not in ('application_received','pre_screening','assessment','interview','offer','verification','onboarding','orientation','active_worker') then
    raise exception 'unsupported invitation stage';
  end if;
  if new.status::text in ('invited','approved','onboarding','correction_required','completed','active')
     and new.application_submitted_at is null then
    if new.invitation_origin is distinct from 'admin_manual'
       or new.manual_invite_approved_by is null
       or not exists (select 1 from public.admins a where a.id = new.manual_invite_approved_by and a.status = 'active')
       or new.manual_invite_approved_at is null
       or length(trim(coalesce(new.manual_invite_reason, ''))) < 10 then
      raise exception 'candidate access requires a submitted application or an authenticated administrator override';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists candidates_controlled_invitation on public.candidates;
create trigger candidates_controlled_invitation
before insert or update of status, application_submitted_at, invitation_origin,
  manual_invite_reason, manual_invite_approved_by, manual_invite_approved_at,
  invitation_status_key, invitation_stage_key
on public.candidates
for each row execute function public.enforce_controlled_candidate_invitation();

create index if not exists candidates_invitation_selection_idx
  on public.candidates (invitation_status_key, invitation_stage_key, last_invited_at desc);
create index if not exists invitations_template_idx
  on public.invitations (template_key, initial_status, initial_stage, created_at desc);
