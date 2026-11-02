-- OTP（邮箱验证码）登录 —— 只加"这个邮箱什么时候被证明过属于这个人"。
--
-- 为什么现在只加这一列：
--   本轮只做邮箱通道。手机号（phone / phone_verified_at）要等短信通道落地时再加，
--   现在建了也没有任何代码写它 —— 空列会被下一个人当成"已经支持手机登录"的证据
--   （CLAUDE.md §4：建字段前先答"它的值从哪来、谁填"）。
--
-- 为什么要记这个时间：
--   验证码登录成功就证明了这个邮箱确实归本人所有。不记下来的话，
--   下次想区分"邮箱已验证"和"注册时随手填的"就无从判断，只能再发一次码。

ALTER TABLE external_user
    ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

COMMENT ON COLUMN external_user.email_verified_at IS
    '第一次通过邮箱验证码证明归属的时间（UTC）；为空 = 从未验证过。';
