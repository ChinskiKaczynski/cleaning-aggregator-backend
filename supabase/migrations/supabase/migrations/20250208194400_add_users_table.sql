-- Włącz rozszerzenie dla UUID
create extension if not exists "uuid-ossp";

-- Tabela użytkowników
create table users (
  id uuid default uuid_generate_v4() primary key,
  email varchar(255) not null unique,
  full_name varchar(100) not null,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Automatyczna aktualizacja updated_at
create trigger set_updated_at
  before update on users
  for each row
  execute procedure public.set_updated_at();

-- Dodaj kolumnę user_id do tabeli reviews
alter table reviews 
add column user_id uuid references users(id) on delete set null;

-- Usuń kolumnę author_name z reviews (będzie brana z users)
alter table reviews 
drop column author_name;

-- Zabezpieczenia RLS dla users
alter table users enable row level security;

-- Polityki bezpieczeństwa dla users
create policy "Użytkownicy mogą widzieć swoją własną kartę"
  on users for select
  using (auth.uid() = id);

create policy "Użytkownicy mogą aktualizować swoją kartę"
  on users for update
  using (auth.uid() = id);

-- Zaktualizuj polityki dla reviews
drop policy if exists "Reviews can be inserted by anyone" on reviews;

create policy "Reviews can be inserted by authenticated users"
  on reviews for insert
  with check (auth.role() = 'authenticated');

-- Funkcje pomocnicze
create or replace function get_user_review_count(user_id uuid)
returns integer
language plpgsql
as $$
declare
  review_count integer;
begin
  select count(*)
  into review_count
  from reviews
  where reviews.user_id = get_user_review_count.user_id;
  
  return review_count;
end;
$$;