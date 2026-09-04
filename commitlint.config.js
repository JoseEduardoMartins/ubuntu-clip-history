// Valida as mensagens de commit contra o padrão Conventional Commits.
// Usado pelo hook commit-msg (Husky). Os tipos que geram release estão
// definidos no .releaserc.json (feat -> minor, fix/perf -> patch).
export default {
    extends: ['@commitlint/config-conventional'],
};
