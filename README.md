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
Ele também libera o `Super+V` do atalho embutido do GNOME (`toggle-message-tray`,
que abre a central de notificações) — o `Super+M` continua abrindo as notificações.

> **Importante:** após o `setup`, faça **logout e login** de novo. O
> `gsd-media-keys` do GNOME só captura atalhos custom no início da sessão, então
> o `Super+V` só passa a abrir o picker depois de relogar.
Serviço e atalho usam o caminho absoluto do launcher, então não dependem do
PATH. Para chamar `clip-history` no terminal, garanta que `~/.local/bin` esteja
no PATH (relogar após criá-lo costuma bastar no Ubuntu).

### Auto-paste (opcional)

Sem isto, escolher um item copia para o clipboard e uma notificação lembra de
apertar `Ctrl+V`. Com isto, o item é **colado automaticamente** (estilo Win+V).

O Ubuntu empacota o **ydotool 0.1.8** (sem daemon embutido e com sintaxe de
teclas por nome, `ctrl+v`). O auto-paste precisa do daemon `ydotoold` e de
acesso ao `/dev/uinput`:

```bash
# 1. daemon do ydotool (pacote separado)
sudo apt install ydotoold

# 2. libere o /dev/uinput para o grupo 'input' (o node é estático → static_node)
echo 'KERNEL=="uinput", GROUP="input", MODE="0660", OPTIONS+="static_node=uinput"' \
  | sudo tee /etc/udev/rules.d/99-uinput.rules
sudo udevadm control --reload-rules && sudo udevadm trigger

# 3. entre no grupo 'input' (e faça LOGOUT/LOGIN depois)
sudo usermod -aG input "$USER"
```

Depois de relogar, rode `clip-history setup` de novo. Ele instala o serviço de
usuário `ydotoold.service` (que sobe o daemon via `sg input`, com socket em
`/tmp/.ydotool_socket`). O `paste` dispara o `Ctrl+V` num processo destacado,
para que o picker feche e o foco volte ao app anterior antes da colagem.

## Uso

- Copie textos normalmente (`Ctrl+C`).
- `Super+V` abre o histórico. Digite para filtrar, `↑`/`↓` para navegar,
  `Enter` para colar, `Esc` para fechar, `Alt+1..9` para escolha rápida.
- **Fixar/favoritar:** botão `★` na linha, ou `Ctrl+P` no item selecionado.
  Fixados vão para o topo e **não somem pelo limite de 100** (nunca expiram).
- **Excluir um item:** botão `×` na linha, ou tecla `Delete` no item selecionado.
- **Excluir todos:** botão 🗑 (topo, ao lado da busca), com confirmação.

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
