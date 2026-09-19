"""HTML文字列から改行を保ったプレーンテキストを抽出する簡易ユーティリティ。"""

from html.parser import HTMLParser


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._chunks: list[str] = []

    def handle_data(self, data: str) -> None:
        self._chunks.append(data)

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in ("br", "p", "div", "li"):
            self._chunks.append("\n")

    def text(self) -> str:
        return "".join(self._chunks).strip()


def html_to_text(html: str) -> str:
    parser = _TextExtractor()
    parser.feed(html)
    return parser.text()
