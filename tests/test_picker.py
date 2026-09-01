from clip_history.picker import _preview, _MAX_PREVIEW_CHARS


def test_preview_collapses_whitespace():
    assert _preview("linha1\n\tlinha2   fim") == "linha1 linha2 fim"


def test_preview_keeps_text_without_manual_ellipsis():
    # o corte visual com "…" fica por conta do Pango (por pixel), não do texto
    text = "x" * 100
    assert _preview(text) == text
    assert "…" not in _preview(text)


def test_preview_caps_very_long_text():
    out = _preview("x" * 1000)
    assert len(out) == _MAX_PREVIEW_CHARS
    assert "…" not in out
