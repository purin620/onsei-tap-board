"""extract_catches のオフライン検証。APIは呼ばず、ダミーの抽出結果を差し込んで確認する。"""

import sqlite3
import tempfile
from pathlib import Path

from analyze_trends import load_catch_conditions
from extract_catches import ExtractionError, normalize_catches, run
from init_db import init_db

# 平進丸の「1つの更新に2日分」を想定した本文と、それに対するAIの出力例
HEISHIN_BODY = "9/15 ヒラメ 船中12枚 最大62cm🎣\n9/14 ヒラメ トップ5枚 渋めでした"
HEISHIN_OUTPUT = {"catches": [
    {"species": "ヒラメ", "catch_date": "2026-09-15", "count_or_level": "12", "count_basis": "合計",
     "size_cm": 62, "note": None, "confidence": "high"},
    {"species": "ヒラメ", "catch_date": "2026-09-14", "count_or_level": "トップ5枚", "count_basis": "トップ",
     "size_cm": None, "note": None, "confidence": "high"},
]}


def _build_db():
    db_path = Path(tempfile.mkdtemp()) / "test.db"
    init_db(db_path)
    conn = sqlite3.connect(db_path)
    conn.execute("INSERT INTO boats (name) VALUES ('平進丸')")
    conn.executemany(
        "INSERT INTO posts (boat_id, date, title, body_raw, source) VALUES (1, ?, ?, ?, 'site')",
        [
            ("2026-09-15", "9/15更新", HEISHIN_BODY),
            ("2026-09-16", "お知らせ", "明日は時化のため休船します"),
            ("2026-09-17", "手入力済み", "ヒラメ1枚"),
            ("2026-09-18", "本文なし", ""),
        ],
    )
    # 3件目はPhase 1のように手入力済み(=AI抽出の対象外)
    conn.execute("INSERT INTO extracted (post_id, species, count_or_level, ai_confidence) "
                 "VALUES (3, 'ヒラメ', '1', 'manual')")
    conn.execute("INSERT INTO conditions (date, tide_type) VALUES ('2026-09-14', '中潮')")
    conn.commit()
    conn.close()
    return db_path


def _fake_extract(client, post):
    if post["title"] == "9/15更新":
        return HEISHIN_OUTPUT
    return {"catches": []}


def test_normalize_catches():
    rows = normalize_catches(HEISHIN_OUTPUT, post_date="2026-09-15")
    assert rows[0]["catch_date"] is None          # 投稿日と同じ日はNULL(=posts.date)
    assert rows[1]["catch_date"] == "2026-09-14"
    assert rows[1]["count_or_level"] == "5"       # 「トップ5枚」→数字だけ
    assert rows[0]["size_cm"] == 62.0

    odd = normalize_catches({"catches": [
        {"species": "イカ", "catch_date": "9月14日", "count_or_level": "豊漁", "count_basis": "たくさん",
         "size_cm": "大きい", "note": "", "confidence": "unknown"},
        {"species": " ", "catch_date": None, "count_or_level": None, "count_basis": None,
         "size_cm": None, "note": None, "confidence": "high"},
    ]}, post_date="2026-09-15")
    assert len(odd) == 1                          # 魚種が空の行は捨てる
    assert odd[0]["catch_date"] is None           # 日付形式が不正ならNULL
    assert odd[0]["count_or_level"] == "豊漁"
    assert odd[0]["count_basis"] is None
    assert odd[0]["size_cm"] is None
    assert odd[0]["ai_confidence"] == "low"


def test_run_saves_rows_and_skips_processed():
    db_path = _build_db()
    calls = []

    def tracking_extract(client, post):
        calls.append(post["id"])
        return _fake_extract(client, post)

    summary = run(db_path=db_path, client=object(), extract_fn=tracking_extract)
    assert calls == [1, 2]                        # 手入力済み(3)と本文なし(4)は対象外
    assert summary == {"processed": 2, "catches": 2, "failed": []}

    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        "SELECT post_id, catch_date, count_or_level, count_basis FROM extracted "
        "WHERE ai_confidence != 'manual' ORDER BY id"
    ).fetchall()
    assert rows == [(1, None, "12", "合計"), (1, "2026-09-14", "5", "トップ")]
    stamped = conn.execute("SELECT id FROM posts WHERE extracted_at IS NOT NULL ORDER BY id").fetchall()
    assert stamped == [(1,), (2,)]                # 釣果なしの休船記事も処理済みになる
    conn.close()

    calls.clear()
    run(db_path=db_path, client=object(), extract_fn=tracking_extract)
    assert calls == []                            # 再実行しても二重に抽出しない

    # 9/14の釣果が、投稿日(9/15)ではなく釣った日の自然条件と結び付くこと
    by_date = {r["date"]: r for r in load_catch_conditions("ヒラメ", db_path)}
    assert by_date["2026-09-14"]["tide_type"] == "中潮"


def test_run_records_failures_and_retries_later():
    db_path = _build_db()

    def failing_extract(client, post):
        raise ExtractionError("refused")

    summary = run(db_path=db_path, client=object(), extract_fn=failing_extract)
    assert summary["processed"] == 0
    assert [f["post_id"] for f in summary["failed"]] == [1, 2]

    conn = sqlite3.connect(db_path)
    assert conn.execute("SELECT COUNT(*) FROM posts WHERE extracted_at IS NOT NULL").fetchone()[0] == 0
    conn.close()                                  # 失敗した記事は次回また対象になる


def test_migrate_adds_columns_to_old_db():
    db_path = Path(tempfile.mkdtemp()) / "old.db"
    conn = sqlite3.connect(db_path)
    conn.executescript("""
        CREATE TABLE posts (id INTEGER PRIMARY KEY, boat_id INTEGER, date TEXT, title TEXT,
                            body_raw TEXT, image_url TEXT, source TEXT, source_url TEXT);
        CREATE TABLE extracted (id INTEGER PRIMARY KEY, post_id INTEGER, species TEXT,
                                count_or_level TEXT, size_cm REAL, tackle_note TEXT, ai_confidence TEXT);
    """)
    conn.close()
    init_db(db_path)
    conn = sqlite3.connect(db_path)
    assert "extracted_at" in {r[1] for r in conn.execute("PRAGMA table_info(posts)")}
    assert {"catch_date", "count_basis"} <= {r[1] for r in conn.execute("PRAGMA table_info(extracted)")}
    conn.close()


if __name__ == "__main__":
    test_normalize_catches()
    test_run_saves_rows_and_skips_processed()
    test_run_records_failures_and_retries_later()
    test_migrate_adds_columns_to_old_db()
    print("OK")
