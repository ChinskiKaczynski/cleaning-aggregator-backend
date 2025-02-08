-- Create spatial index for companies
create index if not exists companies_geom_idx 
on companies using gist (geom);

-- Create trigger function to update geom column from coordinates
create or replace function update_company_geom()
returns trigger as $$
begin
    new.geom := st_setsrid(st_makepoint(
        (new.coordinates->>'lng')::float,
        (new.coordinates->>'lat')::float
    ), 4326);
    new.updated_at := now();
    return new;
end;
$$ language plpgsql;

-- Create trigger for automatic geom updates
drop trigger if exists update_company_geom on companies;
create trigger update_company_geom
before insert or update on companies
for each row
execute function update_company_geom();

-- Create function to find companies within radius
create or replace function find_companies_in_radius(
    lat double precision,
    lng double precision,
    radius_km double precision,
    results_limit integer default 20
)
returns table (
    id uuid,
    name text,
    description text,
    address text,
    coordinates jsonb,
    services text[],
    prices jsonb,
    contact jsonb,
    rating numeric,
    review_count integer,
    created_at timestamptz,
    updated_at timestamptz,
    distance_km double precision
) as $$
begin
    return query
    select 
        c.id,
        c.name,
        c.description,
        c.address,
        c.coordinates,
        c.services,
        c.prices,
        c.contact,
        c.rating,
        c.review_count,
        c.created_at,
        c.updated_at,
        st_distance(
            c.geom::geography,
            st_setsrid(st_makepoint(lng, lat), 4326)::geography
        ) / 1000 as distance_km
    from companies c
    where st_dwithin(
        c.geom::geography,
        st_setsrid(st_makepoint(lng, lat), 4326)::geography,
        radius_km * 1000  -- konwersja km na metry
    )
    order by distance_km
    limit results_limit;
end;
$$ language plpgsql;

-- Function to refresh the spatial index
create or replace function refresh_spatial_index()
returns void as $$
begin
    -- Refresh the spatial index
    reindex index companies_geom_idx;
end;
$$ language plpgsql;