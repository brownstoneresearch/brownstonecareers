-- Brownstone Careers v9.2 application-first invitation controls.

alter table public.candidates
  add column if not exists application_source text,
  add column if not exists application_submitted_at timestamptz,
  add column if not exists invited_from_application_at timestamptz;

update public.candidates
set application_source = coalesce(application_source, 'legacy_application'),
    application_submitted_at = coalesce(application_submitted_at, created_at)
where application_submitted_at is null
  and (status = 'applicant' or recruitment_stage = 'application_received');

create index if not exists candidates_application_queue_idx
  on public.candidates (application_submitted_at desc, status, recruitment_stage);

create or replace function public.enforce_application_first_invitation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'invited' and new.application_submitted_at is null then
    raise exception 'candidate invitation requires a submitted application';
  end if;
  return new;
end;
$$;

drop trigger if exists candidates_application_first_invitation on public.candidates;
create trigger candidates_application_first_invitation
before insert or update of status on public.candidates
for each row execute function public.enforce_application_first_invitation();
