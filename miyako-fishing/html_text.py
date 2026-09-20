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


class _ImageExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.image_urls: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag == "img":
            src = dict(attrs).get("src")
            if src:
                self.image_urls.append(src)


def extract_image_urls(html: str) -> list[str]:
    """HTML本文中の全ての<img src>を出現順・重複除去で返す。"""
    parser = _ImageExtractor()
    parser.feed(html)
    seen: set[str] = set()
    unique_urls = []
    for url in parser.image_urls:
        if url not in seen:
            seen.add(url)
            unique_urls.append(url)
    return unique_urls
