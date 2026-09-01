# ubuntu-clip-history

Histórico de área de transferência estilo `Win+V`, para **Ubuntu / Wayland / GNOME**.

Grava todo texto copiado (`Ctrl+C`) e, ao apertar `Super+V`, abre um picker
onde você escolhe qualquer item anterior para colar.

## Requisitos

- Ubuntu com Wayland + GNOME
- `wl-clipboard`, `python3-gi`, `gir1.2-gtk-4.0`, `gir1.2-adw-1`
- `ydotool` (opcional — auto-paste; sem ele, cai em copy-only)

## Instalação

```bash
sudo apt install wl-clipboard python3-gi gir1.2-gtk-4.0 gir1.2-adw-1 ydotool
python3 -m clip_history setup   # rode a partir da raiz do repositório
```

O `setup` (sem pip) instala um launcher em `~/.local/bin/clip-history`, o
serviço de gravação (systemd --user) e o atalho `Super+V`, e avisa o que faltar.
Serviço e atalho usam o caminho absoluto do launcher, então não dependem do
PATH. Para chamar `clip-history` no terminal, garanta que `~/.local/bin` esteja
no PATH (relogar após criá-lo costuma bastar no Ubuntu).

### Auto-paste (ydotool)

```bash
sudo systemctl enable --now ydotool     # sobe o ydotoold
sudo usermod -aG input "$USER"          # acesso a /dev/uinput (relogar depois)
```

Sem o ydotool funcionando, ao escolher um item ele vai para o clipboard e uma
notificação lembra de apertar `Ctrl+V`.

## Uso

- Copie textos normalmente (`Ctrl+C`).
- `Super+V` abre o histórico. Digite para filtrar, `↑`/`↓` para navegar,
  `Enter` para colar, `Esc` para fechar, `Alt+1..9` para escolha rápida.

## Comandos

| Comando | Função |
|---------|--------|
| `clip-history watch`  | Serviço de gravação (usado pelo systemd) |
| `clip-history record` | Grava um texto vindo do stdin (usado pelo watch) |
| `clip-history show`   | Abre o picker (ligado ao Super+V) |
| `clip-history setup`  | Instala serviço + atalho + checa deps |

## Limites (v1)

Só texto; últimos 100 itens; dedup; ignora textos > 100 KB. Imagens,
favoritos e filtro de senha ficam para versões futuras.
