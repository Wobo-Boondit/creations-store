-- ============================================
-- Privacy: stop retaining R1A conversation content
-- 2025-06-17
-- ============================================
-- The r1a_conversations table previously stored the full text of every chat
-- request + response. That message content is a data/privacy risk and nothing
-- reads it — the stats endpoint only counts role='user' rows by day. We now log
-- a single content-free marker row per request (see lib/r1a/store.ts logUsage),
-- so usage stats/graphs are preserved while no conversation text is retained.
--
-- This migration purges already-stored content and removes the column.

-- 1. Drop the assistant rows entirely (only role='user' rows feed the stats).
DELETE FROM public.r1a_conversations WHERE role <> 'user';

-- 2. Remove the content column (purges all retained message text in one shot).
ALTER TABLE public.r1a_conversations DROP COLUMN IF EXISTS content;
