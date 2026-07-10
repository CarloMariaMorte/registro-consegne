alter table briefings add column published boolean not null default true;

create or replace function enforce_master_only_briefings()
returns trigger as $$
begin
  if (new.text is distinct from old.text or new.points is distinct from old.points or new.hidden is distinct from old.hidden or new.published is distinct from old.published) then
    if not exists (select 1 from profiles where id = auth.uid() and is_master = true) then
      raise exception 'Solo un master puo modificare testo, pubblicazione o nascondere un riepilogo';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create or replace function enforce_master_only_briefings_insert()
returns trigger as $$
begin
  if (new.published is false) then
    if not exists (select 1 from profiles where id = auth.uid() and is_master = true) then
      raise exception 'Solo un master puo creare una bozza non pubblicata';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_briefings_insert_master_check
before insert on briefings
for each row execute function enforce_master_only_briefings_insert();
