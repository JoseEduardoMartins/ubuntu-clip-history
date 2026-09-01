# ubuntu-clip-history — Design (v1)

> **Correção (2026-09-01, descoberta no E2E):** o mecanismo de monitoramento
> mudou. `wl-paste --watch` exige o protocolo wlroots `data-control`, que o
> **GNOME/Mutter não implementa** ("Watch mode requires a compositor that
> supports the wlroots data-control protocol"). O `wl-paste` **one-shot**, porém,
> funciona em background no GNOME. Portanto o watcher passou a fazer **polling**
> (ler o clipboard a cada ~1s via `wl-paste -n -t text` e gravar quando muda),
> em vez de `wl-paste --watch`. Além disso, como o ambiente não tem `pip`, o
> `setup` instala um **launcher** em `~/.local/bin/clip-history` (sem pip), e o
> serviço/atalho usam o caminho absoluto do launcher. As seções 3.1 e 3.5 abaixo
> descrevem o desenho original; o comportamento efetivo é o descrito nesta nota.

**Data:** 2026-09-01
**Repo:** git@github.com:JoseEduardoMartins/ubuntu-clip-history.git
**Ambiente alvo:** Ubuntu, Wayland, GNOME (Mutter)

## 1. Objetivo

Recriar no Linux a experiência do "histórico de área de transferência" do
Windows (`Win+V`): toda vez que o usuário copia um texto (`Ctrl+C`), o item é
gravado num histórico; ao apertar `Super+V`, abre-se uma lista onde ele pode
escolher qualquer item anterior (não só o último) para colar.

Sucesso = o usuário copia várias coisas ao longo do dia, aperta `Super+V`,
escolhe um item antigo por teclado, e ele é colado no app onde estava.

## 2. Decisões tomadas (fechadas)

| Tema | Decisão |
|------|---------|
| Construir | Do zero (não usar GPaste/Pano) |
| Stack | Python + GTK4/Libadwaita |
| Colar | Auto-paste via `ydotool`, com **fallback automático** para copy-only |
| Conteúdo | **Só texto** no v1 (imagens ficam para depois) |
| Retenção | Últimos **100** itens, com **dedup** e **cap de tamanho** (>100 KB ignorado) |
| Privacidade | **Guardar tudo** (sem filtro de senha, sem toggle de pausa no v1) |
| Seleção monitorada | Apenas o **clipboard** (`Ctrl+C`), **não** o primary/seleção de mouse |
| Nome | Repo/projeto `ubuntu-clip-history`; comando CLI `clip-history` |

## 3. Arquitetura

Um único pacote Python (`clip_history`) exposto como um CLI com subcomandos.
Isso mantém uma só base de código, um só ponto de instalação, e componentes
pequenos e testáveis isoladamente.

```
clip-history watch    → serviço que grava o histórico (roda em background)
clip-history record   → recebe 1 texto no stdin e grava (chamado pelo watch)
clip-history show     → abre o picker GTK4 (ligado ao Super+V)
clip-history setup    → instala serviço + atalho + verifica dependências
```

### 3.1. Watcher — gravação (`watch` / `record`)

Não reimplementamos o loop de monitoramento do clipboard. Usamos
`wl-paste --watch` (do pacote `wl-clipboard`), que é o mecanismo canônico no
Wayland: sempre que o conteúdo do clipboard muda, ele executa um comando
passando o novo conteúdo pelo **stdin**.

- `clip-history watch` faz `exec` de:
  `wl-paste --type text --watch clip-history record`
- `clip-history record` lê o stdin, aplica as regras (empty/size/dedup/cap) e
  insere no SQLite.

Roda como **systemd user service** (`clip-history-watch.service`), habilitado
para subir no login do usuário.

**Vantagens:** sem polling próprio; sem conexão de banco de longa duração;
cada gravação é um processo curto e isolado (robusto a falhas). O custo de
spawnar um processo Python por cópia é irrelevante (eventos de cópia são
esporádicos).

**Notas de comportamento:**
- Observamos **apenas** o clipboard (`Ctrl+C`), não o primary selection.
- Se o clipboard não tiver texto (ex.: imagem), o `record` recebe stdin
  vazio e simplesmente ignora.

### 3.2. Storage (`storage.py`)

SQLite em `~/.local/share/clip-history/history.db` (modo WAL). Como cada
`record` é um processo curto, abrimos/fechamos a conexão por operação.

Esquema:

```sql
CREATE TABLE IF NOT EXISTS entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL   -- ISO-8601 UTC
);
CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at DESC);
```

Regras aplicadas no `add(content)`:

1. **Empty:** se `content` for vazio ou só espaços → ignora.
2. **Size cap:** se `len(content.encode('utf-8')) > 100 * 1024` → ignora.
3. **Dedup:** se já existe uma entrada com `content` idêntico → apaga a antiga
   e insere de novo (o item "sobe para o topo", igual ao Windows).
4. **Count cap:** após inserir, mantém só as **100** mais recentes; apaga o
   excedente (as mais antigas).

API pública do módulo (a interface testada):

- `add(content: str) -> None` — aplica as regras acima.
- `list(limit: int | None = None) -> list[Entry]` — mais recente primeiro.
- `get(entry_id: int) -> Entry | None`
- `clear() -> None` — utilitário (usado em testes / comando futuro).

`Entry` = dataclass `{ id, content, created_at }`.

Constantes em `config.py`: `LIMIT = 100`, `MAX_SIZE = 100 * 1024`,
`DB_PATH = ~/.local/share/clip-history/history.db`.

### 3.3. Picker (`picker.py`) — GTK4 + Libadwaita

`clip-history show` abre uma janela pequena, centralizada, sempre no topo, que
toma o foco:

- **Lista** dos itens do mais recente ao mais antigo, cada linha com uma prévia
  de 1–2 linhas (texto multi-linha achatado/truncado para exibição).
- **Campo de busca** no topo, filtragem incremental (case-insensitive,
  substring) sobre o conteúdo.
- **Teclado:**
  - digitar → filtra;
  - `↑`/`↓` → navega;
  - `Enter` → seleciona o item em foco e cola;
  - `Esc` → fecha sem colar;
  - `1`–`9` → seleciona diretamente o N-ésimo item visível.
- Ao selecionar: **fecha a janela primeiro**, depois escreve no clipboard e
  dispara o paste (ver 3.4). Fechar antes é essencial para o foco voltar ao
  app anterior no Mutter.

O picker lê o histórico via `storage.list()`. Ele **não** escreve no banco.

### 3.4. Paste (`paste.py`) — auto com fallback

Fluxo após a seleção:

1. `wl-copy` escreve o conteúdo escolhido no clipboard.
2. Pequeno `sleep` (ex.: ~120 ms) para o Mutter devolver o foco ao app
   anterior depois que o picker fechou.
3. Envia **Ctrl+V** via `ydotool key` (ctrl down, v down, v up, ctrl up
   usando keycodes do Linux input: ctrl=29, v=47).
4. **Fallback:** se o binário `ydotool` não existir, se o `ydotoold` não
   estiver acessível, ou se o comando retornar erro → não falha; apenas
   mantém o conteúdo no clipboard e emite `notify-send`
   *"Copiado — aperte Ctrl+V para colar"*.

A decisão auto-paste vs copy-only é feita em runtime (checagem do ydotool),
então a ferramenta funciona mesmo sem o setup completo do ydotool — só que
sem o passo automático.

### 3.5. Atalho Super+V (`setup.py`)

`clip-history setup` registra um **custom keybinding do GNOME** via
`gsettings`, apontando `<Super>v` → `clip-history show`. `Super+V` está livre
no GNOME por padrão (sem conflito). O setup:

- acrescenta um custom-keybinding ao array
  `org.gnome.settings-daemon.plugins.media-keys custom-keybindings`
  (idempotente — não duplica se já existir);
- instala e habilita o `clip-history-watch.service` (systemd --user);
- verifica dependências (`wl-clipboard`, GTK4/Adw, `ydotool`) e imprime o que
  falta, incluindo os passos de permissão do `ydotool`/`ydotoold`
  (`/dev/uinput`, grupo `input`/regra udev, habilitar o daemon).

## 4. Fluxo de dados (end-to-end)

```
Ctrl+C  →  wl-paste --watch  →  clip-history record  →  storage.add()  →  SQLite
Super+V →  clip-history show →  storage.list()       →  janela GTK4
                          (usuário escolhe item)
                                   ↓
                     wl-copy  →  (delay)  →  ydotool Ctrl+V
                                                 ↳ fallback: notify-send "Ctrl+V"
                              (cola no app anterior)
```

## 5. Tratamento de erros

- **Sem texto no clipboard** (imagem etc.): `record` ignora stdin vazio.
- **DB inexistente/corrompido:** `storage` cria o schema no primeiro uso; erros
  de I/O são logados e o `record` sai sem derrubar o watcher.
- **Watcher morre** (ex.: `wl-paste` cai): systemd reinicia o serviço
  (`Restart=on-failure`).
- **ydotool ausente/falho:** fallback copy-only + notificação (ver 3.4).
- **GTK/Adw ausente:** `show` falha com mensagem clara instruindo o `apt install`.

## 6. Estrutura do projeto

```
ubuntu-clip-history/
  clip_history/
    __init__.py
    cli.py         # parsing de args e dispatch dos subcomandos
    config.py      # caminhos e constantes (LIMIT, MAX_SIZE, DB_PATH)
    storage.py     # SQLite: add/list/get/clear + regras  ← testado (TDD)
    watcher.py     # wrapper do wl-paste --watch (watch) + record(stdin)
    picker.py      # janela GTK4/Adw
    paste.py       # wl-copy + ydotool + fallback + notificação
    setup.py       # systemd user service + gsettings + checagem de deps
  tests/
    test_storage.py
  systemd/
    clip-history-watch.service
  pyproject.toml
  README.md
  docs/superpowers/specs/2026-09-01-ubuntu-clip-history-design.md
```

`pyproject.toml` define o entry point de console `clip-history =
clip_history.cli:main`.

## 7. Estratégia de testes

- **Unit (TDD) — foco no core:**
  - `storage`: empty ignorado; size cap (>100 KB ignorado); dedup (re-copiar
    sobe ao topo e não duplica); count cap (101º insere e remove o mais
    antigo, mantém 100); ordenação (mais recente primeiro); `get`.
  - `record`: stdin → `storage.add` (inclui caso stdin vazio).
  - Usa SQLite em arquivo temporário / `DB_PATH` sobreposto por env var ou
    fixture; sem dependência de GTK, Wayland ou rede.
- **Manual / E2E** (não automatizável de forma confiável): picker GTK,
  atalho `Super+V`, e auto-paste do `ydotool`. Verificação rodando de verdade
  no GNOME do usuário: copiar vários textos → `Super+V` → escolher item antigo
  → confirmar que colou no app anterior; e conferir o caminho de fallback.

## 8. Dependências de sistema (verificadas pelo `setup`)

- `wl-clipboard` — fornece `wl-paste` e `wl-copy`.
- `python3-gi`, `gir1.2-gtk-4.0`, `gir1.2-adw-1` — GTK4/Libadwaita.
- `ydotool` + `ydotoold` — auto-paste (com acesso a `/dev/uinput`).
- Já presentes no ambiente: `python3`, `notify-send`.

## 9. Fora de escopo do v1 (YAGNI — futuro)

- Imagens/rich content e miniaturas.
- Favoritos/pin de itens.
- Filtro de conteúdo sensível (senhas) e toggle de pausa da gravação.
- Sincronização entre máquinas.
- Suporte a X11 (foco é Wayland/GNOME; parte do código já seria portável).
