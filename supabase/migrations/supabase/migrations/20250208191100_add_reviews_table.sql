create table reviews (
  id uuid default uuid_generate_v4() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  author_name varchar(100) not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index reviews_company_id_idx on reviews(company_id);
create index reviews_rating_idx on reviews(rating);
create index reviews_created_at_idx on reviews(created_at);

-- Automatycznie aktualizuj updated_at
create trigger set_updated_at
  before update on reviews
  for each row
  execute procedure public.set_updated_at();

-- Zabezpieczenia RLS
alter table reviews enable row level security;

-- Polityki bezpieczeństwa
create policy "Reviews are viewable by everyone"
  on reviews for select
  using (true);

create policy "Reviews can be inserted by anyone"
  on reviews for insert
  with check (true);

create policy "Reviews can be updated by no one"
  on reviews for update
  using (false);

create policy "Reviews can be deleted by no one"
  on reviews for delete
  using (false);

-- Funkcja do obliczania średniej oceny firmy
create or replace function calculate_company_rating(company_id uuid)
returns numeric
language plpgsql
as $$
declare
  avg_rating numeric;
begin
  select coalesce(round(avg(rating)::numeric, 1), 0.0)
  into avg_rating
  from reviews
  where reviews.company_id = calculate_company_rating.company_id;
  
  return avg_rating;
end;
$$;

-- Funkcja zliczająca ilość opinii dla firmy
create or replace function count_company_reviews(company_id uuid)
returns integer
language plpgsql
as $$
declare
  review_count integer;
begin
  select count(*)
  into review_count
  from reviews
  where reviews.company_id = count_company_reviews.company_id;
  
  return review_count;
end;
$$;