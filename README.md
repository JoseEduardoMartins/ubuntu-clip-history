# ubuntu-clip-history

Histórico de área de transferência estilo `Win+V`, para **Ubuntu / Wayland / GNOME**.

Uma **extensão do GNOME Shell** que, ao apertar `Super+V`, abre um picker com
tudo que você copiou (`Ctrl+C`) e cola de volta o item escolhido — automaticamente,
como no Windows.

> Visão de arquitetura (módulos, fluxo de dados, testes): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Requisitos

- Ubuntu com Wayland + **GNOME Shell 46, 47 ou 48**
- **GPaste** (`gpaste-2`) — o daemon que guarda o histórico; veja **Como funciona**

## Instalação

```bash
# 1. GPaste (backend do histórico)
sudo apt install gpaste-2 gnome-shell-extension-gpaste
gnome-extensions enable GPaste@gnome-shell-extensions.gnome.org

# 2. a extensão clip-history (a partir da raiz do repositório)
./install.sh
```

O `install.sh` copia a extensão para
`~/.local/share/gnome-shell/extensions/`, compila o schema, libera o `Super+V`
do atalho embutido do GNOME (`toggle-message-tray`, que abre a central de
notificações — o `Super+M` continua abrindo as notificações) e habilita a
extensão.

> **Importante:** no **Wayland**, o GNOME só carrega a extensão nova e o atalho
> `Super+V` no início da sessão. Após o `install.sh`, faça **logout e login**.
> Se o `gnome-extensions enable` disser que a extensão não existe, é o mesmo
> motivo — relogue e rode o comando de novo. O daemon do GPaste sobe sozinho
> via D-Bus quando a extensão conecta.

## Como funciona

No GNOME/Mutter não existe o protocolo `wlr-data-control`, então **ler o
clipboard de fora do compositor exige roubar o foco do teclado** — o núcleo do
Wayland só entrega a seleção ao cliente focado. Um watcher externo que fizesse
polling criaria, a cada leitura, uma surface que puxa o foco e o devolve;
repetido de segundo em segundo, isso faz o app focado **piscar** e fecha menus
de contexto e modais transientes (autofill do navegador, etc.).

Por isso o histórico é alimentado pelo **daemon do GPaste**, que roda *dentro*
do gnome-shell com acesso privilegiado à seleção. A extensão só **escuta** o
sinal D-Bus `Update` do GPaste e lê os itens — puro D-Bus, **sem nunca tocar no
foco**. Ao colar, a extensão pede ao GPaste para recopiar o item (`Select`, que
serve tanto para texto quanto para imagem) e injeta `Ctrl+V` por um **dispositivo
virtual do Clutter**, entregue ao app que tinha o foco antes do popup abrir —
tudo dentro do próprio Shell, **sem ydotool nem wl-clipboard**.

Ser uma extensão (e não um app GTK) é a decisão central: no Wayland só o
processo do Shell pode posicionar `actors` na tela e injetar teclas.

O popup abre **no cursor de texto** do campo focado (mesma âncora do IBus); se
não houver caret disponível, cai no canto inferior direito.

## Uso

- Copie textos **ou imagens** normalmente (`Ctrl+C`).
- `Super+V` abre o histórico. Digite para filtrar, `↑`/`↓` (e `PgUp`/`PgDn`,
  `Ctrl+Home`/`Ctrl+End`) para navegar, `Enter` para colar, `Alt+1..9` para
  escolha rápida. `Esc` limpa a busca se houver texto; com a busca vazia, fecha.
- **Imagens** aparecem como miniatura; escolher recopia a imagem pro clipboard.
- **Fixar/favoritar:** botão `★` na linha, ou `Ctrl+P` no item selecionado.
  Fixados vão para o topo e **não somem pelo limite de 100** (nunca expiram).
  Só texto é fixável — imagens não.
- **Excluir um item:** botão `×` na linha, ou `Ctrl+Delete` no item selecionado
  (o `Delete` sozinho edita o texto da busca).
- **Excluir todos:** botão 🗑 (topo, ao lado da busca), com confirmação.

O atalho `Super+V` é configurável na tela de preferências da extensão
(`gnome-extensions prefs clip-history@joseeduardomartins.com`).

## Testes e CI

A lógica pura da extensão (sem `St`/`Clutter`) vive em módulos isolados —
`pins.js`, `position.js`, `text.js`, `pickerLogic.js` — e é testada com o
interpretador `gjs`. O `gpaste.js` também entra na suíte: ele aceita uma camada
D-Bus **injetada**, então dá pra testar cache/roteamento sem o daemon vivo. Rode
tudo localmente:

```bash
bash extension/test/run.sh
```

O runner cobre `testPins`, `testPosition`, `testText`, `testPickerLogic` (filtro,
navegação circular e mapa de teclas) e `testGpaste` (cache do `getMeta`, poda do
`getHistory`, degradação sem `GetElementKind`, roteamento das mutações). Todos
compartilham o mini-harness `extension/test/assert.js`. Fica **de fora** o
`extension/test/smokeGpasteRead.js`, que lê o histórico do daemon GPaste real e
só funciona numa sessão viva — rode-o à mão quando quiser um smoke do D-Bus:

```bash
gjs -m extension/test/smokeGpasteRead.js
```

O restante (`extension.js`, `picker.js`, `prefs.js`) é acoplado ao GNOME Shell
e não roda fora de uma sessão; o CI valida a sintaxe desses arquivos, mas o
comportamento deles é verificado manualmente (`Super+V`).

**CI** (`.github/workflows/ci.yml`, em push na `main` e em todo PR): roda o
`run.sh`, o **ESLint** (`npm run lint` — pega `no-undef`/`no-unused-vars`), valida
o schema (`glib-compile-schemas --strict`), o `metadata.json` e a sintaxe de todos
os `.js`. As ferramentas Node (ESLint, hooks, release) são só de desenvolvimento;
a extensão em si é GJS puro e não vai com `node_modules` no pacote.

## Commits e versionamento

Os commits seguem **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`…).
O **Husky** instala dois hooks (via `npm install`): `pre-commit` roda ESLint + a
suíte de testes, e `commit-msg` valida a mensagem com `commitlint`. Tipos que
geram release: `feat` → *minor*, `fix`/`perf` → *patch*, `BREAKING CHANGE` →
*major*.

**Release** (`.github/workflows/release.yml`) é automático: a cada push na `main`,
o **semantic-release** analisa os commits, calcula a próxima versão semver, gera o
`CHANGELOG.md`, empacota `extension/` no `clip-history@joseeduardomartins.com.zip`
(schema compilado, sem `test/`) e publica um GitHub Release com o zip anexado.
Como o GNOME exige `version` **inteiro** no `metadata.json`, o release incrementa
esse inteiro em +1 e guarda o semver legível em `version-name`. Não há mais tag
manual — a versão sai dos commits.

## Limites

Texto e imagens; últimos 100 itens (limite do GPaste); dedup. Fixados (só texto)
escapam do limite. O filtro de senha fica para versões futuras.
