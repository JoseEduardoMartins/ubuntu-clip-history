from clip_history import paste


def test_fallback_copy_only_when_ydotool_missing(monkeypatch):
    calls = {"copy": None, "notify": None, "run": []}
    monkeypatch.setattr(paste, "copy", lambda c: calls.__setitem__("copy", c))
    monkeypatch.setattr(
        paste.shutil, "which",
        lambda name: None if name == "ydotool" else "/usr/bin/" + name,
    )
    monkeypatch.setattr(paste, "_notify", lambda m: calls.__setitem__("notify", m))
    monkeypatch.setattr(paste.subprocess, "run",
                        lambda *a, **k: calls["run"].append(a))
    paste.paste("hi", delay=0)
    assert calls["copy"] == "hi"
    assert calls["notify"] is not None
    assert calls["run"] == []  # ydotool nunca chamado


def test_invokes_ydotool_when_available(monkeypatch):
    recorded = {}
    monkeypatch.setattr(paste, "copy", lambda c: recorded.__setitem__("copy", c))
    monkeypatch.setattr(paste.shutil, "which", lambda name: "/usr/bin/" + name)
    monkeypatch.setattr(paste.time, "sleep", lambda s: None)

    def fake_run(args, **k):
        recorded["run_args"] = args

    monkeypatch.setattr(paste.subprocess, "run", fake_run)
    paste.paste("hi", delay=0)
    assert recorded["copy"] == "hi"
    assert recorded["run_args"][0] == "ydotool"
    assert recorded["run_args"][1] == "key"


def test_ydotool_failure_falls_back(monkeypatch):
    import subprocess
    notified = {}
    monkeypatch.setattr(paste, "copy", lambda c: None)
    monkeypatch.setattr(paste.shutil, "which", lambda name: "/usr/bin/" + name)
    monkeypatch.setattr(paste.time, "sleep", lambda s: None)
    monkeypatch.setattr(paste, "_notify", lambda m: notified.__setitem__("m", m))

    def boom(args, **k):
        raise subprocess.CalledProcessError(1, args)

    monkeypatch.setattr(paste.subprocess, "run", boom)
    paste.paste("hi", delay=0)
    assert notified.get("m") is not None
