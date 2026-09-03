# ubuntu-clip-history

Histórico de área de transferência estilo `Win+V`, para **Ubuntu / Wayland / GNOME**.

Grava todo texto copiado (`Ctrl+C`) e, ao apertar `Super+V`, abre um picker
onde você escolhe qualquer item anterior para colar.

## Requisitos

- Ubuntu com Wayland + GNOME
- `gpaste-2` (daemon do histórico) — veja **Como funciona** abaixo
- `wl-clipboard`, `python3-gi`, `gir1.2-gtk-4.0`, `gir1.2-adw-1`
- `ydotool` (opcional — auto-paste; sem ele, cai em copy-only)

## Instalação

```bash
sudo apt install wl-clipboard python3-gi gir1.2-gtk-4.0 gir1.2-adw-1 ydotool \
  gpaste-2 gnome-shell-extension-gpaste
gnome-extensions enable GPaste@gnome-shell-extensions.gnome.org
python3 -m clip_history setup   # rode a partir da raiz do repositório
```

Se o `gnome-extensions enable` disser que a extensão não existe, faça
**logout/login** e rode-o de novo (o GNOME só registra a extensão nova numa
sessão nova). O daemon do GPaste também sobe sozinho via D-Bus quando o
watcher conecta.

## Como funciona

No GNOME/Mutter não existe o protocolo `wlr-data-control`, então **ler o
clipboard de fora do compositor exige roubar o foco do teclado** — o núcleo do
Wayland só entrega a seleção ao cliente focado. Um watcher que fizesse polling
com `wl-paste` criaria, a cada leitura, uma surface que puxa o foco e o devolve;
repetido de segundo em segundo, isso faz o app focado **piscar** e fecha menus
de contexto e modais transientes (autofill do navegador, etc.).

Por isso o histórico é alimentado pelo **daemon do GPaste**, que roda *dentro*
do gnome-shell com acesso privilegiado à seleção. O watcher só **escuta** o
sinal D-Bus `Update` do GPaste e lê o item novo com `GetElementAtIndex` — puro
D-Bus, **sem nunca tocar no foco**. O `wl-copy` (usado ao colar) continua sendo
usado: virar *dono* do clipboard não exige foco, só *ler* exigia.

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
| `clip-history watch`  | Serviço de gravação: escuta o GPaste via D-Bus (systemd) |
| `clip-history record` | Grava um texto vindo do stdin (pipes manuais) |
| `clip-history show`   | Abre o picker (ligado ao Super+V) |
| `clip-history setup`  | Instala serviço + atalho + checa deps |

## Testes e CI

A lógica pura da extensão (sem `St`/`Clutter`) vive em módulos isolados —
`pins.js`, `position.js`, `text.js`, `pickerLogic.js` — e é testada com o
interpretador `gjs`. Rode tudo localmente:

```bash
bash extension/test/run.sh
```

O runner cobre `testPins`, `testPosition`, `testText` e `testPickerLogic`
(filtro, navegação circular e mapa de teclas do picker). Fica **de fora** o
`extension/test/smokeGpasteRead.js`, que lê o histórico do daemon GPaste e só
funciona numa sessão real — rode-o à mão quando quiser um smoke do D-Bus:

```bash
gjs -m extension/test/smokeGpasteRead.js
```

O restante (`extension.js`, `picker.js`, `prefs.js`) é acoplado ao GNOME Shell
e não roda fora de uma sessão; o CI valida a sintaxe desses arquivos, mas o
comportamento deles é verificado manualmente (`Super+V`).

**CI** (`.github/workflows/ci.yml`, em push na `main` e em todo PR): roda o
`run.sh`, valida o schema (`glib-compile-schemas --strict`), o `metadata.json`
e a sintaxe de todos os `.js`.

**Release** (`.github/workflows/release.yml`, ao empurrar uma tag `v*`):
reexecuta as checagens, empacota `extension/` num
`clip-history@joseeduardomartins.com.zip` (com o schema compilado, sem os
testes) e cria um GitHub Release com o zip anexado. Para cortar uma versão:

```bash
git tag v2 && git push origin v2
```

## Limites (v1)

Só texto; últimos 100 itens; dedup; ignora textos > 100 KB. Imagens,
favoritos e filtro de senha ficam para versões futuras.
