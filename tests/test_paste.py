from clip_history import paste


def test_fallback_copy_only_when_ydotool_missing(monkeypatch):
    calls = {"copy": None, "notify": None, "popen": []}
    monkeypatch.setattr(paste, "copy", lambda c: calls.__setitem__("copy", c))
    monkeypatch.setattr(
        paste.shutil, "which",
        lambda name: None if name == "ydotool" else "/usr/bin/" + name,
    )
    monkeypatch.setattr(paste, "_notify", lambda m: calls.__setitem__("notify", m))
    monkeypatch.setattr(paste.subprocess, "Popen",
                        lambda *a, **k: calls["popen"].append(a))
    paste.paste("hi", delay=0)
    assert calls["copy"] == "hi"
    assert calls["notify"] is not None
    assert calls["popen"] == []  # ydotool nunca disparado


def test_invokes_ydotool_detached_when_available(monkeypatch):
    recorded = {}
    monkeypatch.setattr(paste, "copy", lambda c: recorded.__setitem__("copy", c))
    monkeypatch.setattr(paste.shutil, "which", lambda name: "/usr/bin/" + name)

    def fake_popen(args, **kwargs):
        recorded["args"] = args
        recorded["kwargs"] = kwargs

    monkeypatch.setattr(paste.subprocess, "Popen", fake_popen)
    paste.paste("hi", delay=0.25)
    assert recorded["copy"] == "hi"
    # dispara destacado, via shell, com a sintaxe do ydotool 0.1.x
    assert recorded["args"][0] == "sh"
    assert recorded["args"][1] == "-c"
    shell_cmd = recorded["args"][2]
    assert "ydotool key ctrl+v" in shell_cmd
    assert "sleep 0.25" in shell_cmd
    assert "notify-send" in shell_cmd  # fallback embutido
    assert recorded["kwargs"].get("start_new_session") is True


def test_copy_failure_notifies(monkeypatch):
    import subprocess
    notified = {}
    popen_calls = []

    def boom(c):
        raise subprocess.CalledProcessError(1, ["wl-copy"])

    monkeypatch.setattr(paste, "copy", boom)
    monkeypatch.setattr(paste.shutil, "which", lambda name: "/usr/bin/" + name)
    monkeypatch.setattr(paste, "_notify", lambda m: notified.__setitem__("m", m))
    monkeypatch.setattr(paste.subprocess, "Popen",
                        lambda *a, **k: popen_calls.append(a))
    paste.paste("hi", delay=0)
    assert notified.get("m") is not None
    assert popen_calls == []  # ydotool nunca disparado
