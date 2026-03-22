-- ── SIGNAL SCAN DATABASE SCHEMA ─────────────────────────────
-- Run this first in Supabase SQL Editor

-- Settings
create table if not exists settings (
  id          uuid primary key default gen_random_uuid(),
  wallet      numeric default 5000,
  risk_percent numeric default 2,
  max_open_trades int default 3,
  telegram_enabled boolean default false,
  timezone    text default 'Asia/Dubai',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- All trades (signal log + trade log combined)
create table if not exists trades (
  id              uuid primary key default gen_random_uuid(),
  coin            text not null,
  signal          text not null,
  entry_type      text default 'BREAKOUT',
  regime          text default 'ranging',
  entry_price     numeric,
  ideal_entry     numeric,
  stop_loss       numeric,
  tp1             numeric,
  tp2             numeric,
  tp3             numeric,
  confidence      int,
  overall_score   int,
  layer_scores    jsonb,
  rsi_at_entry    numeric,
  volume_ratio    numeric,
  adx             numeric,
  position_size   numeric,
  risk_amount     numeric,
  gst_hour        int,
  outcome         text default 'OPEN',
  exit_price      numeric,
  pnl             numeric,
  hold_days       int,
  tp1_hit         boolean default false,
  tp2_hit         boolean default false,
  tp3_hit         boolean default false,
  sl_hit          boolean default false,
  notes           text,
  open_trade_ref  uuid,
  strategy_version int default 1,
  opened_at       timestamptz default now(),
  closed_at       timestamptz
);

-- Open trades (active positions)
create table if not exists open_trades (
  id              uuid primary key default gen_random_uuid(),
  coin            text not null,
  signal          text,
  entry_type      text,
  regime          text,
  entry_price     numeric,
  ideal_entry     numeric,
  stop_loss       numeric,
  sl_current_level numeric,
  tp1             numeric,
  tp2             numeric,
  tp3             numeric,
  confidence      int,
  position_size   numeric,
  risk_amount     numeric,
  gst_hour        int,
  current_price   numeric,
  unrealised_pnl  numeric default 0,
  hours_open      numeric default 0,
  sl_moved        boolean default false,
  tp1_hit         boolean default false,
  tp2_hit         boolean default false,
  tp3_hit         boolean default false,
  opened_at       timestamptz default now()
);

-- Signal log (every scan result logged for forward test)
create table if not exists signal_log (
  id              uuid primary key default gen_random_uuid(),
  coin            text not null,
  signal_type     text not null,
  entry_price     numeric,
  ideal_entry     numeric,
  stop_loss       numeric,
  tp1             numeric,
  tp2             numeric,
  tp3             numeric,
  confidence      int,
  entry_type      text,
  regime          text,
  rsi_at_entry    numeric,
  volume_ratio    numeric,
  adx             numeric,
  gst_hour        int,
  layer_scores    jsonb,
  strategy_version int default 1,
  outcome         text,
  exit_price      numeric,
  pnl             numeric,
  hold_days       int,
  signal_time     timestamptz default now(),
  closed_at       timestamptz
);

-- Coin profiles (per-coin learned parameters)
create table if not exists coin_profiles (
  id                  uuid primary key default gen_random_uuid(),
  coin                text unique not null,
  trades              int default 0,
  wins                int default 0,
  win_rate            int default 0,
  avg_win_pct         numeric,
  avg_loss_pct        numeric,
  learned_rsi_ceil    int default 68,
  learned_rsi_floor   int default 50,
  learned_sl_pct      numeric default 5.0,
  learned_vol_min     numeric default 1.8,
  best_entry          text default 'FVG',
  best_hour           int,
  fvg_win_rate        int,
  pullback_win_rate   int,
  breakout_win_rate   int,
  notes               text,
  updated_at          timestamptz default now()
);

-- Strategy params (version history)
create table if not exists strategy_params (
  id          uuid primary key default gen_random_uuid(),
  version     int not null,
  rsi_ceil    int,
  rsi_floor   int,
  sl_pct      numeric,
  vol_min     numeric,
  adx_min     int,
  min_conf    int,
  changes     jsonb,
  source      text default 'learned',
  created_at  timestamptz default now()
);

-- Ghost trades (WAIT signals tracked for what-if engine)
create table if not exists ghost_trades (
  id                  uuid primary key default gen_random_uuid(),
  coin                text not null,
  date                text,
  theoretical_entry   numeric,
  move_48h            numeric,
  would_have_won      boolean,
  blocking_rule       text,
  created_at          timestamptz default now()
);

-- Scan history
create table if not exists scan_history (
  id              uuid primary key default gen_random_uuid(),
  coins           text[],
  signals_found   int default 0,
  regime          text,
  scan_time       timestamptz,
  duration        int,
  created_at      timestamptz default now()
);

-- Price logs
create table if not exists price_logs (
  id          uuid primary key default gen_random_uuid(),
  coin        text not null,
  price       numeric not null,
  signal_id   uuid,
  logged_at   timestamptz default now()
);

-- Forward test config
create table if not exists forward_test_config (
  id          uuid primary key default gen_random_uuid(),
  start_date  timestamptz default now(),
  target_days int default 60,
  created_at  timestamptz default now()
);

-- Enable RLS (Row Level Security) - open access for personal use
alter table settings          enable row level security;
alter table trades            enable row level security;
alter table open_trades       enable row level security;
alter table signal_log        enable row level security;
alter table coin_profiles     enable row level security;
alter table strategy_params   enable row level security;
alter table ghost_trades      enable row level security;
alter table scan_history      enable row level security;
alter table price_logs        enable row level security;
alter table forward_test_config enable row level security;

-- Allow all operations (single user app)
create policy "allow all" on settings          for all using (true) with check (true);
create policy "allow all" on trades            for all using (true) with check (true);
create policy "allow all" on open_trades       for all using (true) with check (true);
create policy "allow all" on signal_log        for all using (true) with check (true);
create policy "allow all" on coin_profiles     for all using (true) with check (true);
create policy "allow all" on strategy_params   for all using (true) with check (true);
create policy "allow all" on ghost_trades      for all using (true) with check (true);
create policy "allow all" on scan_history      for all using (true) with check (true);
create policy "allow all" on price_logs        for all using (true) with check (true);
create policy "allow all" on forward_test_config for all using (true) with check (true);
