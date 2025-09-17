import pg from 'pg';
const { Pool } = pg;
const url = process.env.DATABASE_URL;
export const pool = new Pool({ connectionString: url, ssl: url && !url.includes('localhost') ? { rejectUnauthorized:false } : false });
export async function withClient(fn){ const c = await pool.connect(); try{ return await fn(c);} finally{ c.release(); } }
export async function migrate(){
  await withClient(async (c)=>{
    await c.query(`
      create table if not exists admin_tables(table_no text primary key, active boolean default true, sort_order integer);
      create table if not exists admin_qr_history(id serial primary key, url text not null, table_no text, created_at timestamptz default now());
      create table if not exists admin_menus(id text primary key, name text not null, price integer not null, active boolean default true, soldout boolean default false, updated_at timestamptz default now());
      create table if not exists admin_daily_codes(code_date date primary key, code text not null, override boolean default false, saved_at timestamptz default now());
      create table if not exists admin_orders(
        id text primary key, order_id text, table_no text, amount integer default 0, status text default '접수',
        created_at timestamptz default now(), cleared boolean default false, payment_key text default '', items jsonb default '[]'::jsonb,
        session_id text, tip_amount integer default 0, discount_amount integer default 0, currency text default 'KRW',
        accepted_at timestamptz, completed_at timestamptz, canceled_at timestamptz, refunded_at timestamptz,
        note_customer text, allergy_flags jsonb default '[]'::jsonb, source_qr text, utm jsonb, device_fingerprint text,
        payment_method text, payment_status text, payment_meta jsonb, receipt_url text, fail_reason text, idempotency_key text, version integer default 1
      );
      create table if not exists admin_order_items(order_id text references admin_orders(id) on delete cascade, menu_id text not null, qty integer not null, menu_name_snapshot text, unit_price_snapshot integer, options jsonb default '[]'::jsonb, line_discount integer default 0, line_note text, primary key(order_id, menu_id));
      create table if not exists admin_order_events(id bigserial primary key, order_id text, event_type text, payload jsonb, created_at timestamptz default now());
      create index if not exists idx_admin_order_events_order on admin_order_events(order_id);
      create table if not exists admin_refunds(id bigserial primary key, order_id text, amount integer default 0, reason text, pg_payload jsonb, created_at timestamptz default now());
      create table if not exists admin_notifications(id bigserial primary key, order_id text, channel text, sent_at timestamptz default now(), meta jsonb);
      create table if not exists table_sessions(session_id text primary key, table_no text not null, opened_at timestamptz default now(), closed_at timestamptz);
      create index if not exists idx_admin_orders_session on admin_orders(session_id);
      create index if not exists idx_admin_orders_table_status on admin_orders(table_no, status);
      create index if not exists idx_admin_orders_created_at on admin_orders(created_at desc);
      create index if not exists idx_admin_orders_payment_status on admin_orders(payment_status);
    `);
  });
}
process.on('SIGTERM', ()=>{ pool.end().then(()=> process.exit(0)); });
