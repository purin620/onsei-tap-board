"""釣果記事の本文から、魚種・匹数(または豊漁/普通/不漁)・サイズなどをClaude APIで読み取る(Phase 5)。

- 対象は `posts.extracted_at` が NULL で、まだ `extracted` に行が無い記事
  (Phase 1で手入力したサンプルは対象外になる)。
- 1つの記事に複数日分(例: 平進丸の「9/15と9/14」)が書かれている場合は、
  日ごとに分けて `extracted.catch_date` に入れる。
- 釣果が書かれていない記事(休船のお知らせ等)も `extracted_at` を記録し、
  次回から再処理しない。

実行には環境変数 ANTHROPIC_API_KEY(または `ant auth login` のプロファイル)が必要。
API呼び出しは記事1件につき1回で、料金が発生する。
"""

import json
import re
import sqlite3
from datetime import datetime
from pathlib import Path

from init_db import DB_PATH, init_db

MODEL = "claude-opus-5-5"
EFFORT = "medium"
MAX_TOKENS = 16000

LEVELS = ("豊漁", "普通", "不漁")
COUNT_BASES = ("合計", "トップ", "1人あたり")
CONFIDENCES = ("high", "medium", "low")

SYSTEM_PROMPT = """\
あなたは岩手県宮古湾の遊漁船が発信する釣果報告を、分析用のデータに整理する担当です。
報告文は船長が書いた自由文で、絵文字や口語、複数日分のまとめ書きを含みます。

報告文から、魚種ごとの釣果を読み取ってください。
- species: 魚種名を標準的なカタカナで書く。イカ類(スルメイカ・ヤリイカ等)はすべて「イカ」にまとめ、
  元の名前は note に残す。宮古湾でよく釣れるのはヒラメ、イカ、ソイ、アイナメ、カレイ、マダラ、サバ等。
- catch_date: その釣果を釣った日。本文に「9/15」のような日付があれば、投稿日を手がかりに年を補って
  YYYY-MM-DD で書く。本文に日付が無ければ null(投稿日と同じ日とみなす)。
- count_or_level: 匹数が書かれていれば数字だけ(例 "5")。範囲(例「3〜8枚」)なら上限の数字。
  匹数が無く「好調」「爆釣」「渋い」のような表現だけなら 豊漁/普通/不漁 のいずれか。判断できなければ null。
- count_basis: 匹数が船全体の合計なら「合計」、竿頭(トップ)の数なら「トップ」、1人あたりなら「1人あたり」。
  匹数が無い場合や基準が読み取れない場合は null。
- size_cm: サイズが書かれていれば、その魚種で最大のサイズを cm の数値で。無ければ null。
- note: 仕掛け・エサ・釣り方・ポイントなど、分析に役立ちそうな補足を短く。無ければ null。
- confidence: 読み取りの確かさ。high(はっきり書いてある)/medium(推測を含む)/low(かなり曖昧)。

釣果に関係しない内容(予約案内、休船のお知らせ、エギの販売など)は無視してください。
釣果が一つも書かれていなければ catches は空の配列にしてください。
書かれていない数字を作らないでください。"""

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "catches": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "species": {"type": "string"},
                    "catch_date": {"type": ["string", "null"]},
                    "count_or_level": {"type": ["string", "null"]},
                    "count_basis": {"type": ["string", "null"]},
                    "size_cm": {"type": ["number", "null"]},
                    "note": {"type": ["string", "null"]},
                    "confidence": {"type": "string", "enum": list(CONFIDENCES)},
                },
                "required": ["species", "catch_date", "count_or_level", "count_basis",
                             "size_cm", "note", "confidence"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["catches"],
    "additionalProperties": False,
}


class ExtractionError(RuntimeError):
    pass


def build_user_message(post: dict) -> str:
    return (
        f"船名: {post['boat_name']}\n"
        f"投稿日: {post['date']}\n"
        f"タイトル: {post.get('title') or ''}\n"
        f"本文:\n{post['body_raw']}"
    )


def _normalize_count(value) -> str | None:
    if value is None:
        return None
    value = str(value).strip()
    if value in LEVELS:
        return value
    digits = re.findall(r"\d+(?:\.\d+)?", value.translate(str.maketrans("０１２３４５６７８９", "0123456789")))
    return digits[-1] if digits else None


def _normalize_date(value) -> str | None:
    if not value:
        return None
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError:
        return None


def normalize_catches(data: dict, post_date: str) -> list[dict]:
    """APIの出力を検証・整形して extracted に入れる形にする。"""
    rows = []
    for c in data.get("catches", []):
        species = (c.get("species") or "").strip()
        if not species:
            continue
        catch_date = _normalize_date(c.get("catch_date"))
        if catch_date == post_date:
            catch_date = None
        size = c.get("size_cm")
        confidence = c.get("confidence") if c.get("confidence") in CONFIDENCES else "low"
        rows.append({
            "species": species,
            "catch_date": catch_date,
            "count_or_level": _normalize_count(c.get("count_or_level")),
            "count_basis": c.get("count_basis") if c.get("count_basis") in COUNT_BASES else None,
            "size_cm": float(size) if isinstance(size, (int, float)) else None,
            "tackle_note": c.get("note") or None,
            "ai_confidence": confidence,
        })
    return rows


def call_claude(client, post: dict) -> dict:
    """記事1件をClaude APIに渡し、OUTPUT_SCHEMAに沿ったdictを返す。"""
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_user_message(post)}],
        output_config={"effort": EFFORT, "format": {"type": "json_schema", "schema": OUTPUT_SCHEMA}},
        # 安全フィルタで断られた場合に、推奨の別モデルで自動的にやり直す
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    if response.stop_reason == "refusal":
        raise ExtractionError(f"post {post['id']}: refused ({response.stop_details})")
    if response.stop_reason == "max_tokens":
        raise ExtractionError(f"post {post['id']}: output truncated (max_tokens)")
    text = next((b.text for b in response.content if b.type == "text"), None)
    if text is None:
        raise ExtractionError(f"post {post['id']}: no text block in response")
    return json.loads(text)


def load_pending_posts(conn: sqlite3.Connection, limit: int | None = None) -> list[dict]:
    sql = """
        SELECT posts.id, boats.name, posts.date, posts.title, posts.body_raw
        FROM posts
        JOIN boats ON boats.id = posts.boat_id
        WHERE posts.extracted_at IS NULL
          AND posts.body_raw IS NOT NULL AND TRIM(posts.body_raw) != ''
          AND NOT EXISTS (SELECT 1 FROM extracted WHERE extracted.post_id = posts.id)
        ORDER BY posts.date, posts.id
    """
    if limit is not None:
        sql += f" LIMIT {int(limit)}"
    return [
        {"id": r[0], "boat_name": r[1], "date": r[2], "title": r[3], "body_raw": r[4]}
        for r in conn.execute(sql)
    ]


def save_extraction(conn: sqlite3.Connection, post_id: int, rows: list[dict]) -> None:
    for r in rows:
        conn.execute(
            "INSERT INTO extracted "
            "(post_id, species, catch_date, count_or_level, count_basis, size_cm, tackle_note, ai_confidence) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (post_id, r["species"], r["catch_date"], r["count_or_level"], r["count_basis"],
             r["size_cm"], r["tackle_note"], r["ai_confidence"]),
        )
    conn.execute(
        "UPDATE posts SET extracted_at = ? WHERE id = ?",
        (datetime.now().isoformat(timespec="seconds"), post_id),
    )


def run(limit: int | None = None, dry_run: bool = False, db_path: Path = DB_PATH,
        client=None, extract_fn=call_claude) -> dict:
    """未処理の記事を順に抽出してDBへ保存する。

    clientとextract_fnは差し替え可能(オフラインテストでAPIを呼ばずに検証するため)。
    1件ずつcommitするので、途中でエラーになってもそこまでの結果は残る。
    """
    init_db(db_path)
    if client is None and extract_fn is call_claude:
        import anthropic
        client = anthropic.Anthropic()

    conn = sqlite3.connect(db_path)
    summary = {"processed": 0, "catches": 0, "failed": []}
    try:
        for post in load_pending_posts(conn, limit):
            try:
                rows = normalize_catches(extract_fn(client, post), post["date"])
            except (ExtractionError, json.JSONDecodeError) as e:
                summary["failed"].append({"post_id": post["id"], "error": str(e)})
                continue
            if dry_run:
                print(json.dumps({"post": post["id"], "date": post["date"], "catches": rows},
                                 ensure_ascii=False, indent=2))
            else:
                save_extraction(conn, post["id"], rows)
                conn.commit()
            summary["processed"] += 1
            summary["catches"] += len(rows)
    finally:
        conn.close()
    return summary


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="釣果記事をClaude APIで構造化してextractedへ保存する")
    parser.add_argument("--limit", type=int, default=None, help="処理する記事の最大件数(お試し用)")
    parser.add_argument("--dry-run", action="store_true", help="DBに保存せず結果を表示するだけ")
    args = parser.parse_args()

    result = run(limit=args.limit, dry_run=args.dry_run)
    print(json.dumps(result, ensure_ascii=False, indent=2))
