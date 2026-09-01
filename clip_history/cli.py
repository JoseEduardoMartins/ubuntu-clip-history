import sys


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    cmd = argv[0] if argv else "show"

    if cmd == "watch":
        from clip_history import watcher
        watcher.watch()
        return 0
    if cmd == "record":
        from clip_history import watcher
        watcher.record()
        return 0
    if cmd == "show":
        from clip_history import picker
        picker.show()
        return 0
    if cmd == "setup":
        from clip_history import setup
        return setup.run()

    sys.stderr.write(f"comando desconhecido: {cmd}\n")
    sys.stderr.write("uso: clip-history [watch|record|show|setup]\n")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
