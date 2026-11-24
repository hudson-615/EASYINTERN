const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const chat = fs.readFileSync('static/js/chat.js', 'utf8');
const dashboard = fs.readFileSync('static/js/dashboard.js', 'utf8');

function extrair(codigo, inicio, fim) {
    const a = codigo.indexOf(inicio);
    const b = codigo.indexOf(fim, a + inicio.length);

    assert.ok(a >= 0 && b > a);

    return codigo.slice(a, b);
}

const contexto = vm.createContext({});

vm.runInContext(
    extrair(
        chat,
        'function unirMensagens(',
        'function renderizarMensagens('
    ),
    contexto
);

vm.runInContext(
    extrair(
        dashboard,
        'function scoreValido(',
        'function matchBadgeHtml('
    ),
    contexto
);

function executar(codigo) {
    return vm.runInContext(codigo, contexto);
}

test('Chat: elimina mensagens duplicadas', () => {
    const total = executar(`
        unirMensagens(
            [{id_mensagem: 1}, {id_mensagem: 2}],
            [{id_mensagem: 2}, {id_mensagem: 3}]
        ).length
    `);

    assert.equal(total, 3);
});

test('Chat: ordena mensagens cronologicamente por ID', () => {
    const ids = executar(`
        unirMensagens(
            [{id_mensagem: 5}, {id_mensagem: 3}],
            [{id_mensagem: 1}]
        ).map(m => m.id_mensagem).join(',')
    `);

    assert.equal(ids, '1,3,5');
});

test('Chat: aceita historico vazio', () => {
    assert.equal(
        executar('unirMensagens([], []).length'),
        0
    );
});

test('Chat: normaliza IDs numericos e textuais', () => {
    assert.equal(
        executar(`
            unirMensagens(
                [{id_mensagem: 1}],
                [{id_mensagem: '1'}]
            ).length
        `),
        1
    );
});

test('Chat: preserva a versao mais recente da mensagem', () => {
    assert.equal(
        executar(`
            unirMensagens(
                [{id_mensagem: 1, conteudo: 'antigo'}],
                [{id_mensagem: 1, conteudo: 'novo'}]
            )[0].conteudo
        `),
        'novo'
    );
});

test('IA: zero por cento e uma nota valida', () => {
    assert.equal(
        executar('scoreValido({score: 0, avaliado: true})'),
        true
    );

    assert.equal(
        executar('scoreTexto({score: 0, avaliado: true})'),
        '0%'
    );
});

test('IA: ausencia de avaliacao nao equivale a zero', () => {
    assert.equal(
        executar('obterScore({score: null})'),
        null
    );

    assert.equal(
        executar('obterScore(null)'),
        null
    );
});

test('IA: avaliacao pendente nao apresenta nota', () => {
    assert.equal(
        executar('obterScore({score: 80, avaliado: false})'),
        null
    );
});

test('IA: compatibilidade de 80 por cento', () => {
    assert.equal(
        executar('scoreTexto({score: 80, avaliado: true})'),
        '80%'
    );
});

test('IA: rejeita pontuacao invalida', () => {
    assert.equal(
        executar("obterScore({score: 'invalido'})"),
        null
    );
});

test('IA: limita pontuacao visual entre zero e cem', () => {
    assert.equal(
        executar('obterScore({score: 150})'),
        100
    );

    assert.equal(
        executar('obterScore({score: -20})'),
        0
    );
});
