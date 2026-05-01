-- Run once in Supabase SQL Editor to create the site_ratings table.
-- SQLAlchemy's create_all will also create it on next Railway deploy,
-- but running this manually gives you the table immediately.

CREATE TABLE IF NOT EXISTS site_ratings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    score       INTEGER NOT NULL,
    feedback    VARCHAR(500),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT  ck_site_rating_score CHECK (score >= 1 AND score <= 5),
    CONSTRAINT  uq_site_rating_user  UNIQUE (user_id)
);

-- Optional: index for fast stats queries
CREATE INDEX IF NOT EXISTS idx_site_ratings_score ON site_ratings (score);
