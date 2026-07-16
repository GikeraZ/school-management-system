create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_roles (user_id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.email,
    (case
      when new.email like '%+admin@%' then 'head_teacher'
      else 'teacher'
    end)::public.user_role
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;
