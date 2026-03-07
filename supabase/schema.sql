-- ============================================
-- Solia Database Schema for Supabase
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================

-- 1. Profiles
create table if not exists profiles (
  wallet text primary key,
  avatar_url text,
  twitter text default '',
  telegram text default '',
  youtube text default '',
  ref_code text unique,
  verified boolean default false,
  verification_code text,
  display_name text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on profiles for select using (true);

create policy "Users can update own profile"
  on profiles for update using (true);

create policy "Users can insert own profile"
  on profiles for insert with check (true);

-- 2. Posts
create table if not exists posts (
  id uuid default gen_random_uuid() primary key,
  author text not null,
  image_url text not null,
  prompt text not null default '',
  category text default 'Main',
  aspect_ratio text default '1:1',
  likes_count int default 0,
  created_at timestamptz default now()
);

alter table posts enable row level security;

create policy "Posts are viewable by everyone"
  on posts for select using (true);

create policy "Anyone can create posts"
  on posts for insert with check (true);

create policy "Authors can update own posts"
  on posts for update using (true);

-- Indexes for posts (critical for performance)
create index if not exists idx_posts_created_at on posts(created_at desc);
create index if not exists idx_posts_category on posts(category);
create index if not exists idx_posts_author on posts(author);
create index if not exists idx_posts_likes_count on posts(likes_count desc);

-- 3. Likes
create table if not exists likes (
  id uuid default gen_random_uuid() primary key,
  user_wallet text not null,
  post_id uuid not null references posts(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_wallet, post_id)
);

alter table likes enable row level security;

create policy "Likes are viewable by everyone"
  on likes for select using (true);

create policy "Anyone can like"
  on likes for insert with check (true);

create policy "Users can unlike"
  on likes for delete using (true);

-- Indexes for likes
create index if not exists idx_likes_user_wallet on likes(user_wallet);
create index if not exists idx_likes_post_id on likes(post_id);

-- 4. Comments
create table if not exists comments (
  id uuid default gen_random_uuid() primary key,
  user_wallet text not null,
  post_id uuid not null references posts(id) on delete cascade,
  text text not null,
  created_at timestamptz default now()
);

alter table comments enable row level security;

create policy "Comments are viewable by everyone"
  on comments for select using (true);

create policy "Anyone can comment"
  on comments for insert with check (true);

-- 5. Purchases
create table if not exists purchases (
  id uuid default gen_random_uuid() primary key,
  buyer_wallet text not null,
  post_id uuid not null references posts(id) on delete cascade,
  tx_signature text default '',
  created_at timestamptz default now(),
  unique(buyer_wallet, post_id)
);

alter table purchases enable row level security;

create policy "Purchases viewable by everyone"
  on purchases for select using (true);

create policy "Anyone can purchase"
  on purchases for insert with check (true);

-- Indexes for purchases
create index if not exists idx_purchases_buyer_wallet on purchases(buyer_wallet);
create index if not exists idx_purchases_post_id on purchases(post_id);

-- 6. Follows
create table if not exists follows (
  id uuid default gen_random_uuid() primary key,
  follower_wallet text not null,
  following_wallet text not null,
  created_at timestamptz default now(),
  unique(follower_wallet, following_wallet)
);

alter table follows enable row level security;

create policy "Follows viewable by everyone"
  on follows for select using (true);

create policy "Anyone can follow"
  on follows for insert with check (true);

create policy "Users can unfollow"
  on follows for delete using (true);

-- 7. Daily likes tracking (bot protection)
create table if not exists daily_likes (
  id uuid default gen_random_uuid() primary key,
  user_wallet text not null,
  date date not null default current_date,
  used_count int default 0,
  bonus_count int default 0,
  unique(user_wallet, date)
);

alter table daily_likes enable row level security;

create policy "Daily likes viewable by everyone"
  on daily_likes for select using (true);

create policy "Anyone can insert daily likes"
  on daily_likes for insert with check (true);

create policy "Anyone can update daily likes"
  on daily_likes for update using (true);

-- Indexes for daily_likes
create index if not exists idx_daily_likes_wallet_date on daily_likes(user_wallet, date);

-- 8. Additional indexes for performance
create index if not exists idx_comments_post_id on comments(post_id);
create index if not exists idx_follows_follower on follows(follower_wallet);
create index if not exists idx_follows_following on follows(following_wallet);
create index if not exists idx_profiles_ref_code on profiles(ref_code);

-- 9. Function to increment/decrement likes_count on posts
create or replace function update_post_likes_count()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update posts set likes_count = likes_count + 1 where id = NEW.post_id;
    return NEW;
  elsif TG_OP = 'DELETE' then
    update posts set likes_count = likes_count - 1 where id = OLD.post_id;
    return OLD;
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trigger_update_likes_count on likes;
create trigger trigger_update_likes_count
  after insert or delete on likes
  for each row execute function update_post_likes_count();

-- 10. Referrals
create table if not exists referrals (
  id uuid default gen_random_uuid() primary key,
  referrer_wallet text not null,
  referred_wallet text not null,
  created_at timestamptz default now(),
  unique(referred_wallet)
);

alter table referrals enable row level security;

create policy "Referrals viewable by everyone"
  on referrals for select using (true);

create policy "Anyone can create referral"
  on referrals for insert with check (true);

create index if not exists idx_referrals_referrer on referrals(referrer_wallet);
create index if not exists idx_referrals_referred on referrals(referred_wallet);

-- 11. Transactions (payment history with referral splits)
create table if not exists transactions (
  id uuid default gen_random_uuid() primary key,
  signature text not null,
  from_wallet text not null,
  type text not null check (type in ('generation', 'purchase')),
  total_amount numeric not null,
  treasury_amount numeric not null default 0,
  creator_wallet text,
  creator_amount numeric,
  referrer_wallet text,
  referrer_amount numeric,
  post_id uuid references posts(id) on delete set null,
  created_at timestamptz default now()
);

alter table transactions enable row level security;

create policy "Transactions viewable by everyone"
  on transactions for select using (true);

create policy "Anyone can insert transactions"
  on transactions for insert with check (true);

create index if not exists idx_transactions_from on transactions(from_wallet);
create index if not exists idx_transactions_creator on transactions(creator_wallet);
create index if not exists idx_transactions_referrer on transactions(referrer_wallet);
create index if not exists idx_transactions_created_at on transactions(created_at desc);

-- 12. Storage policies for images bucket
-- Run this AFTER creating the bucket "images" (Public: ON) in Storage settings
-- First delete any existing policies that might conflict:
drop policy if exists "Public read access" on storage.objects;
drop policy if exists "Allow authenticated uploads" on storage.objects;
drop policy if exists "Give anon users access to JPG images in folder" on storage.objects;
drop policy if exists "Allow uploads" on storage.objects;

-- Allow everyone to read files from images bucket
create policy "Public read images"
  on storage.objects for select
  using (bucket_id = 'images');

-- Allow everyone to upload files to images bucket (app uses anon key)
create policy "Public upload images"
  on storage.objects for insert
  with check (bucket_id = 'images');
