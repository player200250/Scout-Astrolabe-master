-- Scout Astrolabe — Supabase schema（S0(b) 同步骨幹）
--
-- 用法：Supabase Dashboard → SQL Editor → 貼上整份 → Run。可重複執行（都有 if not exists / drop if exists）。
--
-- 設計要點：
-- 1. 雲端只是**同步層**，本機 IndexedDB 仍是 ground truth（ADR 0005/0006）。
-- 2. 同步單位＝整個 BoardRecord（含 tldraw snapshot），對應 src/db.ts 的介面。
-- 3. 衝突策略＝整板 last-write-wins，比較 updated_at（**沿用本機的 epoch 毫秒**，
--    所以型別是 bigint 而非 timestamptz——兩邊比大小才不會有時區/精度問題）。
-- 4. 單帳號 + RLS：每列綁 user_id，政策限定只能存取自己的列。
--    anon key 是設計上可公開的（會被打包進 App），**安全性完全靠 RLS**，所以下面的政策不能省。

create table if not exists public.boards (
    -- 本機 BoardRecord.id（例：board_1784994416400_prog1）
    id              text        not null,
    user_id         uuid        not null references auth.users (id) on delete cascade,

    name            text        not null,
    -- tldraw snapshot：整包 JSON 直接存。null 代表空白板（本機允許）
    snapshot        jsonb,
    -- 縮圖 data URL（可能偏大；初版照存，日後可改 Supabase Storage）
    thumbnail       text,

    -- ⚠️ epoch 毫秒（Date.now()），不是 timestamptz。LWW 比較就靠這欄
    updated_at      bigint      not null,

    parent_id       text,
    is_home         boolean,
    is_journal      boolean,
    is_inbox        boolean,
    status          text,
    last_visited_at bigint,
    sort_order      double precision,
    -- 軟刪除時間（epoch 毫秒）。刪除也要同步，否則另一端會把它復活
    deleted_at      bigint,
    folder_id       text,
    is_folder       boolean,

    -- 伺服器端寫入時間，純供人工排查用，不參與同步判斷
    synced_at       timestamptz not null default now(),

    primary key (user_id, id)
);

-- 拉取「遠端有哪些較新的板」時的主要查詢路徑
create index if not exists boards_user_updated_idx
    on public.boards (user_id, updated_at desc);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- 沒有這段的話，任何拿到 anon key 的人都能讀寫整張表。
alter table public.boards enable row level security;

drop policy if exists "boards_select_own" on public.boards;
drop policy if exists "boards_insert_own" on public.boards;
drop policy if exists "boards_update_own" on public.boards;
drop policy if exists "boards_delete_own" on public.boards;

create policy "boards_select_own" on public.boards
    for select using (auth.uid() = user_id);

create policy "boards_insert_own" on public.boards
    for insert with check (auth.uid() = user_id);

create policy "boards_update_own" on public.boards
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "boards_delete_own" on public.boards
    for delete using (auth.uid() = user_id);

-- 每次 upsert 自動更新 synced_at（僅排查用）
create or replace function public.boards_touch_synced_at()
returns trigger language plpgsql as $$
begin
    new.synced_at := now();
    return new;
end;
$$;

drop trigger if exists boards_touch_synced_at_trg on public.boards;
create trigger boards_touch_synced_at_trg
    before insert or update on public.boards
    for each row execute function public.boards_touch_synced_at();
