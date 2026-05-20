from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import pytest


ENCODING_RE = re.compile(br"^[ \t\f]*#.*?coding[:=][ \t]*([-_.a-zA-Z0-9]+)")
UTF8_BOM = b"\xef\xbb\xbf"


@dataclass(frozen=True)
class EncodingParseResult:
    encoding: str
    line_number: int | None
    has_bom: bool


def _normalize_encoding(name: str) -> str:
    normalized = name.replace("_", "-").lower()
    aliases = {
        "utf8": "utf-8",
        "utf-8": "utf-8",
        "latin-1": "iso-8859-1",
        "latin1": "iso-8859-1",
        "iso-latin-1": "iso-8859-1",
    }
    return aliases.get(normalized, normalized)


def parse_python_source_encoding(data: bytes) -> EncodingParseResult:
    """Parse a Python source encoding declaration using PEP 263 rules."""
    has_bom = data.startswith(UTF8_BOM)
    probe = data[len(UTF8_BOM) :] if has_bom else data
    first_two_lines = probe.splitlines()[:2]

    for index, line in enumerate(first_two_lines, start=1):
        match = ENCODING_RE.match(line)
        if not match:
            continue

        encoding = _normalize_encoding(match.group(1).decode("ascii"))
        if has_bom and encoding != "utf-8":
            raise SyntaxError("UTF-8 BOM conflicts with declared source encoding")
        return EncodingParseResult(
            encoding=encoding,
            line_number=index,
            has_bom=has_bom,
        )

    return EncodingParseResult(
        encoding="utf-8",
        line_number=None,
        has_bom=has_bom,
    )


def validate_python_source(path: Path) -> str:
    data = path.read_bytes()
    parsed = parse_python_source_encoding(data)
    payload = data[len(UTF8_BOM) :] if parsed.has_bom else data
    return payload.decode(parsed.encoding)


def test_defaults_to_utf8_when_no_cookie() -> None:
    result = parse_python_source_encoding("print('Привет')\n".encode("utf-8"))

    assert result == EncodingParseResult(
        encoding="utf-8",
        line_number=None,
        has_bom=False,
    )


def test_reads_cookie_from_first_line() -> None:
    result = parse_python_source_encoding(
        b"# coding: latin-1\nname = 'mathforge'\n"
    )

    assert result.encoding == "iso-8859-1"
    assert result.line_number == 1
    assert result.has_bom is False


def test_reads_cookie_from_second_line_after_shebang() -> None:
    result = parse_python_source_encoding(
        b"#!/usr/bin/env python\n# -*- coding: cp1251 -*-\nprint('ok')\n"
    )

    assert result.encoding == "cp1251"
    assert result.line_number == 2


def test_ignores_cookie_after_second_line() -> None:
    result = parse_python_source_encoding(
        b"#!/usr/bin/env python\n# ordinary comment\n# coding: cp1251\n"
    )

    assert result.encoding == "utf-8"
    assert result.line_number is None


def test_utf8_bom_without_cookie_is_valid_utf8() -> None:
    result = parse_python_source_encoding(UTF8_BOM + "x = 'π'\n".encode("utf-8"))

    assert result.encoding == "utf-8"
    assert result.has_bom is True


def test_utf8_bom_with_utf8_cookie_is_valid() -> None:
    result = parse_python_source_encoding(UTF8_BOM + b"# coding=utf-8\nx = 1\n")

    assert result.encoding == "utf-8"
    assert result.line_number == 1
    assert result.has_bom is True


def test_utf8_bom_conflicting_cookie_raises() -> None:
    with pytest.raises(SyntaxError, match="conflicts"):
        parse_python_source_encoding(UTF8_BOM + b"# coding: cp1251\nx = 1\n")


def test_validate_decodes_declared_cp1251_file(tmp_path: Path) -> None:
    source = "# coding: cp1251\nvalue = 'Привет'\n".encode("cp1251")
    path = tmp_path / "cp1251_source.py"
    path.write_bytes(source)

    assert validate_python_source(path) == "# coding: cp1251\nvalue = 'Привет'\n"


def test_validate_rejects_invalid_utf8_without_cookie(tmp_path: Path) -> None:
    path = tmp_path / "broken_utf8.py"
    path.write_bytes(b"value = '\xff'\n")

    with pytest.raises(UnicodeDecodeError):
        validate_python_source(path)


def test_validate_accepts_utf8_bom_file(tmp_path: Path) -> None:
    path = tmp_path / "bom_source.py"
    path.write_bytes(UTF8_BOM + "value = 'готово'\n".encode("utf-8"))

    assert validate_python_source(path) == "value = 'готово'\n"
