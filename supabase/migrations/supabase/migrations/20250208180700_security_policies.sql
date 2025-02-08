-- Enable RLS for both tables
alter table companies enable row level security;
alter table reviews enable row level security;

-- Companies policies
create policy "Companies are viewable by everyone"
on companies for select
using (true);

create policy "Companies are insertable by authenticated users"
on companies for insert
with check (auth.role() = 'authenticated');

create policy "Companies are updatable by authenticated users"
on companies for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

-- Reviews policies
create policy "Reviews are viewable by everyone"
on reviews for select
using (true);

create policy "Reviews are insertable by authenticated users"
on reviews for insert
with check (
    auth.role() = 'authenticated' 
    and auth.uid() = user_id
);

create policy "Reviews are updatable by their authors"
on reviews for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Reviews are deletable by their authors"
on reviews for delete
using (auth.uid() = user_id);

-- Function to update company rating
create or replace function update_company_rating()
returns trigger as $$
declare
    avg_rating numeric;
    review_cnt integer;
begin
    -- Calculate new average rating and review count
    select 
        round(avg(rating)::numeric, 1),
        count(*)
    into 
        avg_rating,
        review_cnt
    from reviews
    where company_id = coalesce(new.company_id, old.company_id);

    -- Update company
    update companies
    set 
        rating = avg_rating,
        review_count = review_cnt,
        updated_at = now()
    where id = coalesce(new.company_id, old.company_id);

    return coalesce(new, old);
end;
$$ language plpgsql;

-- Create triggers for rating updates
create trigger update_company_rating_on_insert
    after insert on reviews
    for each row
    execute function update_company_rating();

create trigger update_company_rating_on_update
    after update of rating on reviews
    for each row
    execute function update_company_rating();

create trigger update_company_rating_on_delete
    after delete on reviews
    for each row
    execute function update_company_rating();