-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists postgis;

-- Create companies table
create table if not exists companies (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    description text,
    address text not null,
    coordinates jsonb not null,
    services text[] not null,
    prices jsonb not null,
    contact jsonb,
    rating numeric(2,1),
    review_count integer default 0,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    geom geometry(Point, 4326)
);

-- Create reviews table
create table if not exists reviews (
    id uuid primary key default uuid_generate_v4(),
    company_id uuid not null references companies(id) on delete cascade,
    user_id uuid not null,
    rating integer not null check (rating between 1 and 5),
    content text,
    verified boolean default false,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Add indexes
create index if not exists companies_name_idx on companies using gin (to_tsvector('polish', name));
create index if not exists companies_services_idx on companies using gin (services);
create index if not exists reviews_company_id_idx on reviews(company_id);
create index if not exists reviews_user_id_idx on reviews(user_id);
create index if not exists reviews_created_at_idx on reviews(created_at);