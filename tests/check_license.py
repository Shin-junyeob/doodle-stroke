#!/usr/bin/env python3
"""AC-9 라이선스 판정.
- src/vendor/*.js 수 == src/vendor/LICENSE-* 수
- vendor 가 있으면 README.md 에 '## 라이선스' 절
- vendor 가 없으면 src/ 안에 import 문·외부 URL <script src> 가 없음(주석 속 낱말은 보지 않는다)
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
VENDOR = SRC / "vendor"

def strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    return re.sub(r"(?m)(^|[^:\\])//.*$", r"\1", text)

errors = []
js = sorted(VENDOR.glob("*.js")) if VENDOR.is_dir() else []
lic = sorted(VENDOR.glob("LICENSE-*")) if VENDOR.is_dir() else []
if len(js) != len(lic):
    errors.append(f"vendor js {len(js)}개 != LICENSE {len(lic)}개")
if js:
    readme = ROOT / "README.md"
    if not readme.is_file() or not re.search(r"(?m)^## 라이선스\s*$", readme.read_text(encoding="utf-8")):
        errors.append("vendor 가 있는데 README.md 에 '## 라이선스' 절이 없음")
else:
    for f in sorted(SRC.rglob("*")):
        if f.suffix not in (".js", ".html", ".mjs"):
            continue
        text = f.read_text(encoding="utf-8")
        rel = f.relative_to(ROOT)
        if re.search(r"(?m)^\s*import\s|\bimport\s*\(", strip_comments(text)):
            errors.append(f"{rel}: import 사용")
        # 외부 URL 은 HTML 주석만 지운 글에서 본다 — '//cdn' 이 JS 줄 주석으로 지워지지 않게
        if re.search(r"""<script[^>]*\bsrc\s*=\s*["']?(https?:)?//""", re.sub(r"<!--.*?-->", "", text, flags=re.S), flags=re.I):
            errors.append(f"{rel}: 외부 URL <script>")

if errors:
    print("AC-9 실패:\n  " + "\n  ".join(errors))
    sys.exit(1)
print(f"AC-9 통과 (vendor js {len(js)}개)")
