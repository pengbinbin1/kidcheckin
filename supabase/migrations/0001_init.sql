-- ============================================================
-- 兴趣班签到 (KidCheckin) — 初始数据库结构 v1
--
-- 用法：Supabase Dashboard → SQL Editor → 新建查询 → 粘贴本文件全部内容 → Run
-- 本脚本可重复执行（幂等）。
-- ============================================================

-- ---------- 扩展 ----------
create extension if not exists pgcrypto;
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------- 表结构 ----------

-- 家庭（多人共享的锚点）
create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,     -- 6 位邀请码
  ics_token   text not null unique,     -- 日历订阅令牌
  timezone    text not null default 'Asia/Shanghai',
  created_at  timestamptz not null default now()
);

-- 家庭成员（= 登录账号在家庭中的角色）
create table if not exists public.family_members (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('admin', 'member')),
  nickname   text not null default '',
  joined_at  timestamptz not null default now(),
  unique (user_id, family_id)
);
create index if not exists idx_family_members_family on public.family_members(family_id);
create index if not exists idx_family_members_user on public.family_members(user_id);

-- 孩子
create table if not exists public.students (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  name         text not null,
  avatar_emoji text not null default '🧒',
  birth_date   date,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists idx_students_family on public.students(family_id);

-- 兴趣班课程（每周固定时段）
create table if not exists public.courses (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families(id) on delete cascade,
  student_id       uuid not null references public.students(id) on delete cascade,
  name             text not null,                        -- 课程名（钢琴课）
  institution      text,                                  -- 机构
  location         text,                                  -- 上课地点
  weekdays         int[] not null check (cardinality(weekdays) >= 1),  -- ISO: 1=周一…7=周日
  start_time       time not null,
  end_time         time not null,
  start_date       date not null,                         -- 开始日期（可填过去日期补录历史）
  end_date         date,                                  -- 结束日期（null = 持续）
  total_sessions   int,                                   -- 课时包总节数（null = 不按课时包）
  reminder_minutes int not null default 30,               -- 课前提醒提前分钟数
  status           text not null default 'active' check (status in ('active', 'paused', 'finished')),
  color            text not null default '#4f7cff',
  created_at       timestamptz not null default now()
);
create index if not exists idx_courses_family on public.courses(family_id);
create index if not exists idx_courses_student on public.courses(student_id);

-- 课次（由课程规则物化生成；签到/补签/调课/停课都操作这张表）
create table if not exists public.sessions (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references public.courses(id) on delete cascade,
  date             date not null,
  start_time       time not null,
  end_time         time not null,
  status           text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  note             text,                        -- 备注（调课去向等）
  reminder_sent_at timestamptz,
  origin           text not null default 'schedule' check (origin in ('schedule', 'manual')),
  created_at       timestamptz not null default now(),
  unique (course_id, date)
);
create index if not exists idx_sessions_course on public.sessions(course_id);
create index if not exists idx_sessions_date on public.sessions(date);

-- 签到记录（每节课最多一条；补签 = method='retroactive'）
create table if not exists public.attendance_records (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  status      text not null check (status in ('present', 'absent', 'leave')),
  check_in_at timestamptz,
  method      text not null default 'manual' check (method in ('manual', 'retroactive')),
  operated_by uuid references auth.users(id) on delete set null,
  reason      text,
  created_at  timestamptz not null default now(),
  unique (session_id)
);
create index if not exists idx_attendance_session on public.attendance_records(session_id);

-- 推送订阅（每设备一行；提醒推送到家庭全员）
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  family_id  uuid not null references public.families(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_family on public.push_subscriptions(family_id);

-- ---------- 辅助函数（RLS 用，需在表创建之后定义） ----------
create or replace function public.current_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from public.family_members where user_id = auth.uid()
$$;

create or replace function public.is_admin_of(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.family_members m
    where m.family_id = p_family_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  )
$$;

-- ---------- RLS（行级安全） ----------
-- 所有数据按 family_id 隔离，只有该家庭成员可读写

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.students enable row level security;
alter table public.courses enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.push_subscriptions enable row level security;

-- families
drop policy if exists fam_select on public.families;
create policy fam_select on public.families for select
  using (id = public.current_family_id());

drop policy if exists fam_update on public.families;
create policy fam_update on public.families for update
  using (id = public.current_family_id() and public.is_admin_of(id));

-- family_members
drop policy if exists fm_select on public.family_members;
create policy fm_select on public.family_members for select
  using (family_id = public.current_family_id());

-- students
drop policy if exists stu_select on public.students;
create policy stu_select on public.students for select
  using (family_id = public.current_family_id());

drop policy if exists stu_insert on public.students;
create policy stu_insert on public.students for insert
  with check (family_id = public.current_family_id() and public.is_admin_of(family_id));

drop policy if exists stu_update on public.students;
create policy stu_update on public.students for update
  using (family_id = public.current_family_id() and public.is_admin_of(family_id));

drop policy if exists stu_delete on public.students;
create policy stu_delete on public.students for delete
  using (family_id = public.current_family_id() and public.is_admin_of(family_id));

-- courses
drop policy if exists crs_select on public.courses;
create policy crs_select on public.courses for select
  using (family_id = public.current_family_id());

drop policy if exists crs_insert on public.courses;
create policy crs_insert on public.courses for insert
  with check (family_id = public.current_family_id() and public.is_admin_of(family_id));

drop policy if exists crs_update on public.courses;
create policy crs_update on public.courses for update
  using (family_id = public.current_family_id() and public.is_admin_of(family_id));

drop policy if exists crs_delete on public.courses;
create policy crs_delete on public.courses for delete
  using (family_id = public.current_family_id() and public.is_admin_of(family_id));

-- sessions
drop policy if exists ses_select on public.sessions;
create policy ses_select on public.sessions for select
  using (
    exists (
      select 1 from public.courses c
      where c.id = sessions.course_id
        and c.family_id = public.current_family_id()
    )
  );

drop policy if exists ses_insert on public.sessions;
create policy ses_insert on public.sessions for insert
  with check (
    exists (
      select 1 from public.courses c
      join public.family_members m on m.family_id = c.family_id and m.user_id = auth.uid()
      where c.id = course_id
        and m.role = 'admin'
    )
  );

drop policy if exists ses_update on public.sessions;
create policy ses_update on public.sessions for update
  using (
    exists (
      select 1 from public.courses c
      join public.family_members m on m.family_id = c.family_id and m.user_id = auth.uid()
      where c.id = sessions.course_id
        and m.role = 'admin'
    )
  );

drop policy if exists ses_delete on public.sessions;
create policy ses_delete on public.sessions for delete
  using (
    exists (
      select 1 from public.courses c
      join public.family_members m on m.family_id = c.family_id and m.user_id = auth.uid()
      where c.id = sessions.course_id
        and m.role = 'admin'
    )
  );

-- attendance_records（只能通过 RPC mark_attendance 写入）
drop policy if exists att_select on public.attendance_records;
create policy att_select on public.attendance_records for select
  using (
    exists (
      select 1 from public.sessions s
      join public.courses c on c.id = s.course_id
      where s.id = attendance_records.session_id
        and c.family_id = public.current_family_id()
    )
  );

-- push_subscriptions
drop policy if exists push_select on public.push_subscriptions;
create policy push_select on public.push_subscriptions for select
  using (family_id = public.current_family_id());

drop policy if exists push_insert on public.push_subscriptions;
create policy push_insert on public.push_subscriptions for insert
  with check (
    family_id = public.current_family_id()
    and user_id = auth.uid()
  );

drop policy if exists push_delete on public.push_subscriptions;
create policy push_delete on public.push_subscriptions for delete
  using (family_id = public.current_family_id());

-- ---------- RPC：家庭管理 ----------

-- 创建家庭（创建者自动成为 admin）
create or replace function public.create_family(p_name text, p_nickname text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_code text;
  v_token text;
begin
  -- 一个用户只能属于一个家庭
  if exists (select 1 from family_members where user_id = auth.uid()) then
    raise exception '你已属于一个家庭';
  end if;

  -- 生成唯一邀请码
  loop
    v_code := upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from families where invite_code = v_code);
  end loop;

  -- 生成唯一日历令牌
  loop
    v_token := replace(gen_random_uuid()::text, '-', '');
    exit when not exists (select 1 from families where ics_token = v_token);
  end loop;

  insert into families (name, invite_code, ics_token)
  values (p_name, v_code, v_token)
  returning id into v_family_id;

  insert into family_members (family_id, user_id, role, nickname)
  values (v_family_id, auth.uid(), 'admin', p_nickname);

  return v_family_id;
end;
$$;

-- 加入家庭
create or replace function public.join_family(p_invite_code text, p_nickname text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
begin
  if exists (select 1 from family_members where user_id = auth.uid()) then
    raise exception '你已属于一个家庭';
  end if;

  select id into v_family_id from families where invite_code = p_invite_code;
  if v_family_id is null then
    raise exception '邀请码无效';
  end if;

  insert into family_members (family_id, user_id, role, nickname)
  values (v_family_id, auth.uid(), 'member', p_nickname);

  return v_family_id;
end;
$$;

-- 修改自己的昵称
create or replace function public.update_own_nickname(p_nickname text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update family_members
  set nickname = p_nickname
  where user_id = auth.uid();
end;
$$;

-- 设置成员角色（admin only，保留至少一位管理员）
create or replace function public.set_member_role(p_member_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_current_role text;
begin
  select family_id, role into v_family_id, v_current_role
  from family_members where id = p_member_id;
  if v_family_id is null then
    raise exception '成员不存在';
  end if;

  if not public.is_admin_of(v_family_id) then
    raise exception '仅家庭管理员可调整角色';
  end if;

  if v_current_role = 'admin' and p_role = 'member' then
    -- 不能降级最后一位管理员
    if (select count(*) from family_members where family_id = v_family_id and role = 'admin') <= 1 then
      raise exception '家庭至少需要保留一位管理员';
    end if;
  end if;

  update family_members set role = p_role where id = p_member_id;
end;
$$;

-- 移除成员（admin only，不能移除自己）
create or replace function public.remove_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_target_user uuid;
begin
  select family_id, user_id into v_family_id, v_target_user
  from family_members where id = p_member_id;
  if v_family_id is null then
    raise exception '成员不存在';
  end if;

  if not public.is_admin_of(v_family_id) then
    raise exception '仅家庭管理员可移除成员';
  end if;

  if v_target_user = auth.uid() then
    raise exception '不能移除自己，请使用「退出家庭」';
  end if;

  delete from family_members where id = p_member_id;
end;
$$;

-- 退出家庭（如果是最后一位成员则删除家庭）
create or replace function public.leave_family()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member record;
begin
  select * into v_member from family_members where user_id = auth.uid();
  if v_member.id is null then
    return;
  end if;

  delete from family_members where id = v_member.id;

  -- 如果没有剩余成员，删除家庭（级联清理所有数据）
  if not exists (select 1 from family_members where family_id = v_member.family_id) then
    delete from families where id = v_member.family_id;
  end if;
end;
$$;

-- ---------- RPC：课次管理 ----------

-- 生成未来课次（从课程 start_date 到 today+42，匹配 weekdays）
create or replace function public.generate_sessions(p_course_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with target as (
    select c.id, c.start_date, c.start_time, c.end_time, c.weekdays
    from public.courses c
    where c.status = 'active'
      and (p_course_id is null or c.id = p_course_id)
  ),
  dates as (
    select
      t.id as course_id,
      d::date as sess_date,
      t.start_time,
      t.end_time
    from target t
    cross join generate_series(
      t.start_date,
      case
        when current_date + 42 < t.start_date then t.start_date
        else current_date + 42
      end,
      interval '1 day'
    ) d
    where array_position(t.weekdays, extract(isodow from d)::int) is not null
  )
  insert into public.sessions (course_id, date, start_time, end_time, origin)
  select course_id, sess_date, start_time, end_time, 'schedule'
  from dates
  on conflict (course_id, date) do nothing;

  get diagnostics v_count = ROW_COUNT;
  return v_count;
end;
$$;

-- 编辑课程后同步未来课次：删除无记录的未来课次 → 重新生成
create or replace function public.sync_course_sessions(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 权限校验：调用者须为该课程所属家庭的 admin
  if not exists (
    select 1 from public.courses c
    join public.family_members m on m.family_id = c.family_id and m.user_id = auth.uid()
    where c.id = p_course_id
      and m.role = 'admin'
  ) then
    raise exception '仅家庭管理员可同步课程课次';
  end if;

  -- 删除未来的、无签到记录的课次
  delete from public.sessions s
  where s.course_id = p_course_id
    and s.date >= current_date
    and not exists (
      select 1 from public.attendance_records ar
      where ar.session_id = s.id
    );

  -- 重新生成
  perform public.generate_sessions(p_course_id);
end;
$$;

-- 调课：原课次标记 cancelled + 备注，在目标日期新建 manual 课次
create or replace function public.reschedule_session(
  p_session_id uuid,
  p_new_date date,
  p_new_start time,
  p_new_end time
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then
    raise exception '课次不存在';
  end if;

  -- 权限：admin
  if not exists (
    select 1 from public.courses c
    join public.family_members m on m.family_id = c.family_id and m.user_id = auth.uid()
    where c.id = v_session.course_id
      and m.role = 'admin'
  ) then
    raise exception '仅家庭管理员可调课';
  end if;

  -- 清除原签到记录（调课后重新签到）
  delete from public.attendance_records where session_id = p_session_id;

  -- 原课次标记取消
  update public.sessions
  set status = 'cancelled',
      note = format('调课至 %s %s', to_char(p_new_date, 'MM/DD'), to_char(p_new_start, 'HH24:MI'))
  where id = p_session_id;

  -- 新建调课课次
  insert into public.sessions (course_id, date, start_time, end_time, origin, note)
  values (
    v_session.course_id,
    p_new_date,
    p_new_start,
    p_new_end,
    'manual',
    '调课课次'
  );
end;
$$;

-- ---------- RPC：签到记录 ----------

-- 签到 / 补签 / 标记缺勤 / 标记请假
-- 规则：
--   1. method='manual' + status='present'：现场签到，须在签到窗口内（开始前2小时 ~ 开始后6小时）
--   2. method='retroactive'：补签，仅 admin 可操作
--   3. 缺勤/请假：任何成员任何时间可标记
create or replace function public.mark_attendance(
  p_session_id uuid,
  p_status text,
  p_method text default 'manual',
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
  v_family_id uuid;
  v_is_admin boolean;
  v_start timestamptz;
  v_family_tz text;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then
    raise exception '课次不存在';
  end if;

  if v_session.status = 'cancelled' then
    raise exception '该课次已取消，无法记录出勤';
  end if;

  select c.family_id, f.timezone into v_family_id, v_family_tz
  from public.courses c
  join public.families f on f.id = c.family_id
  where c.id = v_session.course_id;

  select public.is_admin_of(v_family_id) into v_is_admin;

  -- 现场签到：校验时间窗口
  if p_method = 'manual' and p_status = 'present' then
    v_start := (v_session.date + v_session.start_time) at time zone v_family_tz;
    if now() < v_start - interval '2 hours' or now() > v_start + interval '6 hours' then
      raise exception '已超出可签到时间范围，请使用补签（需家长权限）';
    end if;
  end if;

  -- 补签：仅 admin
  if p_method = 'retroactive' and not v_is_admin then
    raise exception '补签仅家长（管理员）可操作';
  end if;

  insert into public.attendance_records (
    session_id, student_id, status, check_in_at, method, operated_by, reason
  )
  values (
    p_session_id,
    (select student_id from public.courses where id = v_session.course_id),
    p_status,
    case
      when p_status = 'present' and p_method = 'manual' then now()
      when p_status = 'present' and p_method = 'retroactive' then
        (v_session.date + v_session.start_time) at time zone v_family_tz
      else null
    end,
    p_method,
    auth.uid(),
    left(nullif(trim(coalesce(p_reason, '')), ''), 200)
  )
  on conflict (session_id) do update set
    status = excluded.status,
    check_in_at = excluded.check_in_at,
    method = excluded.method,
    reason = excluded.reason;
end;
$$;

-- 清除签到记录（admin 或记录创建者）
create or replace function public.clear_attendance(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.attendance_records%rowtype;
  v_family_id uuid;
begin
  select ar.* into v_record
  from public.attendance_records ar
  where ar.session_id = p_session_id;

  if v_record.id is null then
    return;
  end if;

  -- 找到该课次所属的家庭
  select c.family_id into v_family_id
  from public.sessions s
  join public.courses c on c.id = s.course_id
  where s.id = p_session_id;

  -- admin 或记录创建者可删除
  if not public.is_admin_of(v_family_id) and v_record.operated_by != auth.uid() then
    raise exception '仅记录创建者或家庭管理员可删除';
  end if;

  delete from public.attendance_records where id = v_record.id;
end;
$$;

-- ---------- RPC 权限 ----------
revoke all on function public.create_family(text, text) from public, anon;
revoke all on function public.join_family(text, text) from public, anon;
revoke all on function public.update_own_nickname(text) from public, anon;
revoke all on function public.set_member_role(uuid, text) from public, anon;
revoke all on function public.remove_member(uuid) from public, anon;
revoke all on function public.leave_family() from public, anon;
revoke all on function public.generate_sessions(uuid) from public, anon;
revoke all on function public.sync_course_sessions(uuid) from public, anon;
revoke all on function public.reschedule_session(uuid, date, time, time) from public, anon;
revoke all on function public.mark_attendance(uuid, text, text, text) from public, anon;
revoke all on function public.clear_attendance(uuid) from public, anon;

grant execute on function public.create_family(text, text) to authenticated;
grant execute on function public.join_family(text, text) to authenticated;
grant execute on function public.update_own_nickname(text) to authenticated;
grant execute on function public.set_member_role(uuid, text) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
grant execute on function public.leave_family() to authenticated;
grant execute on function public.generate_sessions(uuid) to authenticated;
grant execute on function public.sync_course_sessions(uuid) to authenticated;
grant execute on function public.reschedule_session(uuid, date, time, time) to authenticated;
grant execute on function public.mark_attendance(uuid, text, text, text) to authenticated;
grant execute on function public.clear_attendance(uuid) to authenticated;

-- ---------- Realtime 订阅 ----------
do $$
begin
  alter table public.sessions replica identity full;
  alter table public.attendance_records replica identity full;
exception when others then null;
end $$;

-- 将表加入 supabase_realtime publication
do $$
begin
  alter publication supabase_realtime add table public.sessions;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.attendance_records;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.courses;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.students;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.family_members;
exception when duplicate_object then null;
end $$;

-- ---------- Edge Function 辅助 RPC ----------

-- 找出「未来 reminder_minutes 内开始、未发过提醒」的课次
-- 供 Edge Function check-reminders 调用
create or replace function public.find_due_reminders()
returns table (
  session_id       uuid,
  family_id        uuid,
  course_name      text,
  student_name     text,
  sess_date        date,
  start_time       time,
  end_time         time,
  location         text,
  reminder_minutes int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    c.family_id,
    c.name,
    st.name,
    s.date,
    s.start_time,
    s.end_time,
    coalesce(c.location, c.institution),
    c.reminder_minutes
  from public.sessions s
  join public.courses c on c.id = s.course_id
  join public.students st on st.id = c.student_id
  where s.status = 'scheduled'
    and s.reminder_sent_at is null
    and s.date >= current_date
    and s.date <= current_date + 3
    and (s.date + s.start_time) at time zone 'Asia/Shanghai'
        between now() - interval '5 minutes' and now() + interval '48 hours'
$$;

-- 获取某家庭的日历课次（供 Edge Function calendar-ics 调用）
create or replace function public.get_family_calendar(
  p_family_id uuid,
  p_from date,
  p_to date
)
returns table (
  session_id       uuid,
  course_name      text,
  student_name     text,
  sess_date        date,
  start_time       time,
  end_time         time,
  status           text,
  note             text,
  location         text,
  institution      text,
  reminder_minutes int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    c.name,
    st.name,
    s.date,
    s.start_time,
    s.end_time,
    s.status,
    s.note,
    c.location,
    c.institution,
    c.reminder_minutes
  from public.sessions s
  join public.courses c on c.id = s.course_id
  join public.students st on st.id = c.student_id
  where c.family_id = p_family_id
    and s.date between p_from and p_to
  order by s.date, s.start_time
$$;

grant execute on function public.find_due_reminders() to service_role;
grant execute on function public.get_family_calendar(uuid, date, date) to service_role;

-- ---------- 定时任务 ----------
-- 1) 每天凌晨 3:05 生成未来 6 周的课次
do $block$
begin
  if exists (select 1 from cron.job where jobname = 'kidcheckin-generate-sessions') then
    perform cron.unschedule('kidcheckin-generate-sessions');
  end if;
  perform cron.schedule('kidcheckin-generate-sessions', '5 3 * * *', $job$ select public.generate_sessions(); $job$);
exception when others then
  raise notice '定时任务创建失败: %', sqlerrm;
end $block$;

-- 2) 每 5 分钟检查课前提醒（通过 Edge Function 发送推送）
--    需要项目 URL 和 service_role key，见部署指南 docs/部署指南.md
--    示例：
--    select cron.schedule(
--      'kidcheckin-check-reminders',
--      '*/5 * * * *',
--      $$
--      select net.http_post(
--        url := 'https://YOUR_PROJECT.supabase.co/functions/v1/check-reminders',
--        headers := jsonb_build_object(
--          'Content-Type', 'application/json',
--          'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
--        )
--      );
--      $$
--    );
