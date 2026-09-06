# [1.4.0](https://github.com/JoseEduardoMartins/ubuntu-clip-history/compare/v1.3.2...v1.4.0) (2026-09-06)


### Features

* **i18n:** internacionaliza a UI com gettext (+ pt_BR) ([7972ec8](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/7972ec852c1584e6ae6e4db6e89f7077984d82f5))
* **picker:** popup acompanha o tema claro/escuro do sistema ([8bd5591](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/8bd5591538cd6553ff4b208eb98d913b7e6ac70c))
* **prefs:** headerbar e botão Cancelar no diálogo de atalho ([c83c3de](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/c83c3de31a383984ffb7f6c650b409badf49cb51))

## [1.3.2](https://github.com/JoseEduardoMartins/ubuntu-clip-history/compare/v1.3.1...v1.3.2) (2026-09-06)


### Bug Fixes

* **pins:** serializa e coalesce as gravações do pins.json ([629f47d](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/629f47d0a5e591c9be27de9f19b090c2164fd7ae))

## [1.3.1](https://github.com/JoseEduardoMartins/ubuntu-clip-history/compare/v1.3.0...v1.3.1) (2026-09-05)


### Performance Improvements

* **pins:** grava pins.json de forma assíncrona ([ebdf754](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/ebdf75423e22ec3b893933b77e87330e50311bd5))

# [1.3.0](https://github.com/JoseEduardoMartins/ubuntu-clip-history/compare/v1.2.0...v1.3.0) (2026-09-05)


### Bug Fixes

* **picker:** oculta itens de senha da busca ([8d74cf8](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/8d74cf839c2b44e02db74d22e06ad34a8ea8aeae))


### Features

* **picker:** distingue GPaste indisponível e rotula botões ([ec9cdbc](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/ec9cdbc349953a490d45009499abd8ba2b431f0f))

# [1.2.0](https://github.com/JoseEduardoMartins/ubuntu-clip-history/compare/v1.1.1...v1.2.0) (2026-09-05)


### Features

* **paste:** cola com Ctrl+Shift+V em terminais ([9573b5f](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/9573b5f884a82aa279f4e9888b1401cef17d7c67))
* **picker:** confirma o "Limpar tudo" em dois passos ([6c5f97f](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/6c5f97f62650d2e27a2597d664c2026bb4e770cc))
* **prefs:** torna o atalho editável na tela de preferências ([10c3134](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/10c31348189d0414fdaf694ee7b991e3af4397e5))

## [1.1.1](https://github.com/JoseEduardoMartins/ubuntu-clip-history/compare/v1.1.0...v1.1.1) (2026-09-05)


### Bug Fixes

* robustez do picker, pinos e preview ([3ff6b6b](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/3ff6b6b0dfa8821359b6983abc715698d97189c9))

# [1.1.0](https://github.com/JoseEduardoMartins/ubuntu-clip-history/compare/v1.0.0...v1.1.0) (2026-09-04)


### Features

* **picker:** mascara itens de senha e faz debounce da busca ([b494a5f](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/b494a5fcf80beca0e1138193aae5c4a10dd173f1)), closes [#2](https://github.com/JoseEduardoMartins/ubuntu-clip-history/issues/2) [#6](https://github.com/JoseEduardoMartins/ubuntu-clip-history/issues/6)

# 1.0.0 (2026-09-04)


### Bug Fixes

* auto-paste via ydotool destacado (foco volta antes do Ctrl+V) ([02ed487](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/02ed487cd67d6a84b75ae4fe8262df5eeadb20de))
* copy-step fallback, add() error logging, drop unused index ([567d617](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/567d617137d553bf96648ffdbae650e11b54fe65))
* fechar picker ao clicar fora e colar com Enter ([67183ed](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/67183ed3206331ae6cee7e190a2ea47c70ff1707))
* keybinding no padrão customN + aviso de relogin ([a69d3a8](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/a69d3a86ef124f3018b2500d6dfbd63463be5f61))
* liberar Super+V do toggle-message-tray do GNOME ([156fdda](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/156fddacca5e0d4ef05825f219aa006de6e5d7cd))
* watcher via GPaste D-Bus (fim do roubo de foco no GNOME) ([0500df2](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/0500df27c7e96148f10224ff422acba4c2974b6b))
* watcher via polling (GNOME não suporta wl-paste --watch) + launcher sem pip ([a98a429](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/a98a42948d4dca8c7839b4265454488f5c846ae5))
* ydotool key usa sintaxe ctrl+v (ydotool 0.1.x do Ubuntu) ([db7e360](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/db7e360df3ea7dde9120bb71b9099f1785a98e26))


### Features

* backend GPaste via D-Bus (histórico, add, delete, empty) ([b2b8ae8](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/b2b8ae8691375a323b7e21a9a96910d7953635ba))
* CLI com dispatch watch/record/show/setup ([a9d15c2](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/a9d15c242492f23807754edbe83b1ef02796c447))
* entrypoint da extensão, metadata e estilos ([485eb01](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/485eb013936314f9b0665a39c0fb60c1b54a3f98))
* excluir item (botão × / tecla Delete) e limpar tudo (com confirmação) ([49956d2](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/49956d253885799f088357d7b96cff08532604d8))
* fixar/favoritar itens (botão ★ / Ctrl+P), imunes ao cap ([cc755be](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/cc755beb38c40ffcc1bc77d20a40a3e7fc39ecbd))
* função pura de posicionamento do popup na tela ([3f1a183](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/3f1a183f8b1a15504a78ecfc1929d2e07e9fccde))
* ícone de pino no lugar da estrela (fixar/favoritar) ([b1513ec](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/b1513ec8afa264d65f1228948f6d7ded3960bc04))
* melhorias da varredura — UX de teclado, lint no CI e robustez ([e7483ed](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/e7483ed3fc8d7bbd13a0c31ae8b61f28c70bdc94))
* paste com wl-copy + ydotool e fallback copy-only ([bd51427](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/bd51427196dff7e3ae48ae420a8b5835ba43b12f))
* picker com tamanho fixo, ellipsis por pixel e fechar ao perder foco ([7eef7b2](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/7eef7b26840d364fd29459ba5907e11112c46f6b))
* picker GTK4 (busca, setas, Enter, Esc, Alt+1..9) ([844e10e](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/844e10eb885528bdb847a3ef9d77b15b3e5bc252))
* **picker:** exige Ctrl+Delete para excluir item ([1137e53](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/1137e53ce661c9f4708362a29edc8c612c591f26))
* pinos duráveis (favoritos) em JSON local ([66bb24e](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/66bb24eaa932ece53cb68ffc8dde91266d150838))
* posiciona o popup no caret do campo focado (spike IBus) ([f2053c0](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/f2053c03890eeaf0f24fd35c86783013d7957fcc))
* scaffold do projeto e config (paths + limites) ([67bc682](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/67bc682cb8cd07842f585891878e0185903a4ba4))
* schema de configurações e tela de preferências ([0fb1ad1](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/0fb1ad1ba903049fcf6921266ffe49139efa8f64))
* setup (systemd user service + atalho Super+V + checagem de deps) ([05f06db](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/05f06db2cbe5d1eee5af2d2f5dbe074bc4ca4d0a))
* setup instala ydotoold.service + guia de auto-paste ([03ce7bf](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/03ce7bfac6670c3bc76479330950d9d7b365327c))
* storage SQLite com dedup, cap de 100 e cap de tamanho ([3128385](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/31283854e3cf8aac401fa4c24e2952442f5b8c1b))
* suporta GNOME Shell 46, 47 e 48 ([939aef1](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/939aef1bea52ee977cfcd3641b7f02ad9775d35f))
* suporta imagens no histórico (miniatura + recópia) ([ca09a7d](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/ca09a7d65ae9862a29d9a8476631e538b4481a1d))
* título "Área de Transferência" e botão de fechar no picker ([d729bff](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/d729bff0d4452add2e0e8f1ce7688fd4b6682e08))
* torna as chamadas D-Bus do GPaste assíncronas ([8125f4a](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/8125f4a10b2a2eb7ae1683c2d75f44799de3bcf1))
* utilitário de preview de texto para os itens da lista ([a899a50](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/a899a50e4c4afd2048ef519db0e2c10ee1b0913c))
* watcher (record via stdin + watch via wl-paste) ([2099a33](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/2099a3389392b258a429253b886c36881de6af6c))


### Performance Improvements

* **picker:** render lazy por linha e navegação sem reconstruir a lista ([fdfd3f2](https://github.com/JoseEduardoMartins/ubuntu-clip-history/commit/fdfd3f2469cca10a58d0ee0c8e6ac13f2b50ef7d))
