-- 宮古湾 遊漁船 釣果集約アプリ DBスキーマ (Phase 1 プロトタイプ)

CREATE TABLE IF NOT EXISTS boats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    instagram_handle TEXT,
    website_url TEXT
);

CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    boat_id INTEGER NOT NULL REFERENCES boats(id),
    date TEXT NOT NULL,              -- YYYY-MM-DD
    title TEXT,
    body_raw TEXT,
    image_url TEXT,
    source TEXT NOT NULL DEFAULT 'site',  -- 'site' or 'instagram'
    source_url TEXT                  -- 元記事のURL(再取得時の重複排除キー)
);

CREATE TABLE IF NOT EXISTS post_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id),
    image_url TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS extracted (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id),
    species TEXT NOT NULL,           -- 'ヒラメ' / 'イカ' / 'その他'
    count_or_level TEXT,             -- 数値(文字列) or '豊漁'/'普通'/'不漁'
    size_cm REAL,
    tackle_note TEXT,
    ai_confidence TEXT
);

CREATE TABLE IF NOT EXISTS conditions (
    date TEXT PRIMARY KEY,           -- YYYY-MM-DD
    tide_type TEXT,                  -- '大潮'/'中潮'/'小潮' 等
    high_tide_time TEXT,
    low_tide_time TEXT,
    water_temp REAL,
    air_temp_max REAL,
    air_temp_min REAL,
    wind_dir TEXT,
    wind_speed REAL
);

CREATE INDEX IF NOT EXISTS idx_posts_boat_date ON posts(boat_id, date);
CREATE INDEX IF NOT EXISTS idx_extracted_post ON extracted(post_id);
CREATE INDEX IF NOT EXISTS idx_post_images_post ON post_images(post_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_unique_source
    ON posts(boat_id, source_url) WHERE source_url IS NOT NULL;
