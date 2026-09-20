"""「2026年09月15日（火）」のような日本語日付表記からYYYY-MM-DDを取り出す。"""

import re

_DATE_RE = re.compile(r"(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日")


def parse_japanese_date(text: str) -> str | None:
    if not text:
        return None
    match = _DATE_RE.search(text)
    if not match:
        return None
    year, month, day = (int(x) for x in match.groups())
    return f"{year:04d}-{month:02d}-{day:02d}"
