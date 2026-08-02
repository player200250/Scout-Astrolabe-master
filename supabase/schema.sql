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

-- ── Storage：image 卡的圖片檔 ────────────────────────────────────────────────
--
-- 為什麼需要這個 bucket：TD-IMG 之後 image 卡的 snapshot 只留 `storedName`，
-- 實體檔在本機 userData/files。只同步 snapshot 的話，另一台裝置拿到的是一個
-- 指向它沒有的檔案的名字 → 破圖，而且沒有任何錯誤訊息可查。
-- 對應程式碼：src/sync/imageSync.ts。
--
-- 物件路徑一律 `<user_id>/<storedName>`。**第一層資料夾就是 RLS 的判斷依據**，
-- 政策靠 `storage.foldername(name)[1]` 取它來比對 auth.uid()。

insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', false)
on conflict (id) do nothing;

-- ⚠️ bucket 設 public = false，讀取一律經過下面的 select 政策（等同 boards 表的規則：
-- anon key 是公開的，安全性全靠 RLS）。imageSync 用 supabase.storage.download()
-- 帶著使用者的 access token 讀，不需要 public URL。

drop policy if exists "card_images_select_own" on storage.objects;
drop policy if exists "card_images_insert_own" on storage.objects;
drop policy if exists "card_images_update_own" on storage.objects;
drop policy if exists "card_images_delete_own" on storage.objects;

create policy "card_images_select_own" on storage.objects
    for select using (
        bucket_id = 'card-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

create policy "card_images_insert_own" on storage.objects
    for insert with check (
        bucket_id = 'card-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

-- update 政策是 upsert 需要的：imageSync 上傳時帶 upsert = true，
-- 物件已存在時走的是 update 而不是 insert，少了這條會是 403。
create policy "card_images_update_own" on storage.objects
    for update using (
        bucket_id = 'card-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    ) with check (
        bucket_id = 'card-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

create policy "card_images_delete_own" on storage.objects
    for delete using (
        bucket_id = 'card-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
