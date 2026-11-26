(() => {
    "use strict";

    const el = id => document.getElementById(id);
    const secao = el("section-chat");

    if (!secao) return;

    const BASE = "/api/chat";

    let conversa = null;
    let mensagens = [];
    let socket = null;
    let timer = null;
    let enviando = false;
    let atualizando = false;
    let versao = 0;
    let pendente = null;
    let pagina = 1;
    let carregandoInicial = false;
    let carregandoAnteriores = false;
    let carregandoConversas = false;
    let sessaoAtual = token();
    let ultimaLeitura = new Map();
    let conversasCarregadas = new Map();
    let mensagensPendentes = new Map();
    let geracaoSessao = 0;
    let paginaSuspensa = false;

    function token() {
        return localStorage.getItem("easyintern_token")
            || localStorage.getItem("ag_token");
    }

    function visivel() {
        return secao.classList.contains("active")
            && secao.getClientRects().length > 0
            && document.visibilityState === "visible";
    }

    function aviso(texto = "") {
        el("chat-aviso").textContent = texto;
    }

    async function api(caminho, metodo = "GET", dados = null) {
        const credencial = token();
        const geracao = geracaoSessao;

        if (!credencial) {
            throw new Error("Sessão indisponível.");
        }

        const opcoes = {
            method: metodo,
            cache: "no-store",
            headers: {
                Authorization: `Bearer ${credencial}`,
                "Content-Type": "application/json"
            }
        };

        if (dados !== null) {
            opcoes.body = JSON.stringify(dados);
        }

        const resposta = await fetch(BASE + caminho, opcoes);

        if (!resposta.ok) {
            if (resposta.status === 401) {
                throw new Error("Sessão expirada. Faça login novamente.");
            }

            const corpo = await resposta.json().catch(() => ({}));

            throw new Error(
                typeof corpo.detail === "string"
                    ? corpo.detail
                    : `Operação indisponível (${resposta.status}).`
            );
        }

        const resultado = await resposta.json();

        if (credencial !== token() || geracao !== geracaoSessao) {
            throw new Error("Sessao alterada.");
        }

        return resultado;
    }

    function podeEnviar() {
        return conversa
            && conversa.status === "Aberto"
            && !conversa.expirado
            && conversa.status_candidatura !== "Reprovado";
    }

    function atualizarControles() {
        el("chat-conteudo").disabled = !podeEnviar() || enviando;
        el("chat-enviar").disabled = !podeEnviar() || enviando;
        el("chat-bloquear").disabled = !podeEnviar();
        el("chat-encerrar").disabled =
            !conversa || conversa.status === "Encerrado";
    }

    function atualizarCabecalho() {
        if (!conversa) return;

        el("chat-nome").textContent =
            conversa.participante_nome || "Conversa";

        el("chat-status").textContent = conversa.expirado
            ? "Conversa expirada"
            : conversa.status;

        atualizarControles();
    }

    function renderizarConversas(items, anexar = false) {
        const lista = el("chat-conversas");

        if (!anexar) lista.replaceChildren();

        if (!items.length && !anexar) {
            lista.textContent = "Nenhuma conversa iniciada.";
        }

        for (const item of items) {
            const botao = document.createElement("button");
            const nome = document.createElement("strong");
            const vaga = document.createElement("small");
            const detalhes = document.createElement("small");

            botao.type = "button";
            botao.className = "ei-chat-conversa";

            botao.setAttribute(
                "aria-pressed",
                String(conversa?.id_chat === item.id_chat)
            );

            nome.textContent = item.participante_nome || "Participante";
            vaga.textContent = item.vaga_titulo || "";

            detalhes.textContent =
                `${item.status} · ${item.nao_lidas || 0} não lidas`;

            botao.append(nome, vaga, detalhes);

            botao.addEventListener("click", () => {
                abrirConversa(item).catch(e => aviso(e.message));
            });

            lista.append(botao);
        }
    }

    async function carregarConversas(proxima = false) {
        if (carregandoConversas) return;

        carregandoConversas = true;
        const geracao = geracaoSessao;
        const botao = el("chat-mais-conversas");
        botao.disabled = true;

        try {
            const alvo = proxima ? pagina + 1 : 1;

            const dados = await api(
                `/conversas?pagina=${alvo}&limite=20`
            );

            if (geracao !== geracaoSessao) return;

            if (!proxima && pagina === 1) {
                conversasCarregadas.clear();
            }

            for (const item of dados.items) {
                conversasCarregadas.set(item.id_chat, item);
            }

            if (proxima) pagina = alvo;

            if (conversa) {
                const atual = dados.items.find(
                    item => item.id_chat === conversa.id_chat
                );

                if (atual) {
                    conversa = atual;
                    atualizarCabecalho();
                }
            }

            renderizarConversas([...conversasCarregadas.values()]);

            if (proxima || pagina === 1) {
                botao.hidden = !dados.tem_proxima;
            }

        } finally {
            carregandoConversas = false;
            botao.disabled = false;
        }
    }

    function unirMensagens(anteriores, novas) {
        const unicas = new Map();

        for (const item of [...anteriores, ...novas]) {
            unicas.set(Number(item.id_mensagem), item);
        }

        return [...unicas.values()].sort(
            (a, b) => Number(a.id_mensagem) - Number(b.id_mensagem)
        );
    }

    function renderizarMensagens(rolar = true) {
        const painel = el("chat-mensagens");

        painel.replaceChildren();

        if (!mensagens.length) {
            painel.textContent = "Nenhuma mensagem nesta conversa.";
            return;
        }

        for (const mensagem of mensagens) {
            const bloco = document.createElement("div");
            const texto = document.createElement("div");
            const horario = document.createElement("time");

            bloco.className = "ei-chat-mensagem"
                + (mensagem.minha ? " minha" : "");

            texto.textContent = mensagem.conteudo || "";

            const data = new Date(mensagem.enviada_em);

            horario.textContent = Number.isNaN(data.getTime())
                ? ""
                : data.toLocaleString("pt-BR");

            bloco.append(texto, horario);
            painel.append(bloco);
        }

        if (rolar) {
            painel.scrollTop = painel.scrollHeight;
        }
    }

    async function registrarLeitura(id, ultimo) {
        if (!ultimo || !visivel() || conversa?.id_chat !== id) return;

        if (Number(ultimo) <= (ultimaLeitura.get(id) || 0)) return;

        const anterior = ultimaLeitura.get(id) || 0;
        ultimaLeitura.set(id, Number(ultimo));

        try {
            await api(
                `/conversas/${id}/leitura?ate_id=${ultimo}`,
                "PATCH"
            );
        } catch (erro) {
            if (ultimaLeitura.get(id) === Number(ultimo)) {
                ultimaLeitura.set(id, anterior);
            }
            throw erro;
        }
    }

    async function abrirConversa(item) {
        const atual = ++versao;

        conversa = item;
        mensagens = [];
        carregandoInicial = true;
        pendente = mensagensPendentes.get(item.id_chat) || null;

        el("chat-conteudo").value = pendente?.conteudo || "";
        el("chat-mais-mensagens").hidden = true;

        atualizarCabecalho();
        renderizarMensagens();
        aviso();

        try {
            const dados = await api(
                `/conversas/${item.id_chat}/mensagens?limite=50`
            );

            if (atual !== versao) return;

            mensagens = unirMensagens([], dados.items);

            renderizarMensagens();

            el("chat-mais-mensagens").hidden = !dados.tem_mais;

            await registrarLeitura(item.id_chat, dados.ultimo_id);

            if (atual === versao) await carregarConversas();

        } finally {
            if (atual === versao) carregandoInicial = false;
        }
    }

    async function atualizarMensagens() {
        if (!conversa || !visivel() || atualizando || carregandoInicial) return;

        atualizando = true;

        const id = conversa.id_chat;
        const atual = versao;

        try {
            let temMais = true;
            let alterou = false;

            while (temMais) {
                const ultimo = mensagens.at(-1)?.id_mensagem || 0;

                const dados = await api(
                    `/conversas/${id}/mensagens?depois_de=${ultimo}&limite=100`
                );

                if (atual !== versao) return;

                if (dados.items.length) {
                    mensagens = unirMensagens(mensagens, dados.items);
                    alterou = true;
                }

                temMais = dados.tem_mais && dados.items.length > 0;
            }

            if (alterou) renderizarMensagens();

            if (mensagens.length) {
                await registrarLeitura(
                    id,
                    mensagens.at(-1).id_mensagem
                );
            }

        } finally {
            atualizando = false;
        }
    }

    async function carregarAnteriores() {
        if (!conversa || !mensagens.length || carregandoAnteriores || carregandoInicial) return;

        carregandoAnteriores = true;
        el("chat-mais-mensagens").disabled = true;

        try {

        const atual = versao;
        const id = conversa.id_chat;
        const primeiro = mensagens[0].id_mensagem;

        const dados = await api(
            `/conversas/${id}/mensagens?antes_de=${primeiro}&limite=50`
        );

        if (atual !== versao) return;

        const painel = el("chat-mensagens");
        const alturaAnterior = painel.scrollHeight;
        const posicaoAnterior = painel.scrollTop;

        mensagens = unirMensagens(dados.items, mensagens);

        renderizarMensagens(false);

        painel.scrollTop = posicaoAnterior
            + painel.scrollHeight - alturaAnterior;

        el("chat-mais-mensagens").hidden = !dados.tem_mais;
        } finally {
            carregandoAnteriores = false;
            el("chat-mais-mensagens").disabled = false;
        }
    }

    el("chat-form").addEventListener("submit", async evento => {
        evento.preventDefault();

        if (!podeEnviar() || enviando) return;

        const conteudo = el("chat-conteudo").value.trim();

        if (!conteudo) return;

        const id = conversa.id_chat;
        const atual = versao;

        if (
            !pendente
            || pendente.id !== id
            || pendente.conteudo !== conteudo
        ) {
            pendente = {
                id,
                conteudo,
                uuid_cliente: crypto.randomUUID()
            };
        }

        mensagensPendentes.set(id, pendente);

        enviando = true;
        atualizarControles();

        try {
            await api(`/conversas/${id}/mensagens`, "POST", {
                conteudo: pendente.conteudo,
                uuid_cliente: pendente.uuid_cliente
            });

            mensagensPendentes.delete(id);

            if (atual === versao) {
                el("chat-conteudo").value = "";
                pendente = null;

                await atualizarMensagens();
                aviso();
            }

            await carregarConversas();

        } catch (erro) {
            aviso(erro.message);

        } finally {
            enviando = false;
            atualizarControles();
        }
    });

    async function alterarStatus(status) {
        if (!conversa) return;

        if (!window.confirm(
            `Deseja realmente ${status === "bloqueado" ? "bloquear" : "encerrar"} esta conversa?`
        )) return;

        const id = conversa.id_chat;

        const dados = await api(
            `/conversas/${id}/status`,
            "PATCH",
            { status }
        );

        if (conversa?.id_chat === id) {
            conversa.status = dados.status;
            atualizarCabecalho();
        }

        await carregarConversas();
    }

    async function sincronizar() {
        verificarSessao();

        if (!token() || paginaSuspensa) return;

        try {
            if (visivel()) {
                await atualizarMensagens();
                await carregarConversas();
            }

        } catch (erro) {
            aviso(erro.message);
        }
    }


    function atualizarBadge(quantidade) {
        const badge = el("badge-chat");
        const menu = el("btn-menu-toggle");

        const total = Math.max(0, Number(quantidade) || 0);
        const texto = total >= 100 ? "100+" : String(total);

        badge.textContent = texto;
        badge.hidden = total === 0;

        badge.setAttribute(
            "aria-label",
            `${texto} mensagens nao lidas`
        );

        if (menu) {
            let indicador = el("chat-menu-indicador");

            if (!indicador) {
                indicador = document.createElement("span");
                indicador.id = "chat-menu-indicador";
                indicador.hidden = true;

                menu.append(indicador);
            }

            indicador.textContent = texto;
            indicador.hidden = total === 0;

            indicador.setAttribute(
                "aria-label",
                `${texto} mensagens nao lidas`
            );
        }
    }

    let consultandoNotificacoes = false;

    async function atualizarNotificacoes() {
        verificarSessao();

        if (!token() || consultandoNotificacoes || paginaSuspensa) return;

        consultandoNotificacoes = true;
        const sessao = token();

        try {
            const dados = await api(
                "/notificacoes?apenas_nao_lidas=true&limite=100"
            );

            if (token() === sessao && Array.isArray(dados)) {
                atualizarBadge(dados.length);
            }

        } catch {
            // Preserva o ultimo contador em caso de falha.
        } finally {
            consultandoNotificacoes = false;
        }
    }

    function encerrarSocket() {
        clearTimeout(timer);
        timer = null;

        if (socket) {
            const anterior = socket;
            socket = null;
            anterior.onclose = null;
            anterior.onmessage = null;
            anterior.onopen = null;
            anterior.close();
        }
    }

    function verificarSessao() {
        const atual = token();

        if (atual === sessaoAtual) return;

        sessaoAtual = atual;
        geracaoSessao++;
        versao++;

        encerrarSocket();

        conversa = null;
        mensagens = [];
        pendente = null;
        pagina = 1;
        carregandoInicial = false;

        mensagensPendentes.clear();
        conversasCarregadas.clear();
        ultimaLeitura.clear();

        el("chat-conversas").replaceChildren();
        el("chat-mensagens").replaceChildren();
        el("chat-conteudo").value = "";
        el("chat-nome").textContent = "Conversa";
        el("chat-status").textContent = "";
        el("chat-mais-conversas").hidden = true;
        el("chat-mais-mensagens").hidden = true;

        atualizarBadge(0);
        atualizarControles();
        aviso();

        if (atual && !paginaSuspensa) conectar();
    }

    function conectar() {
        if (!token() || socket || paginaSuspensa) return;

        const credencial = token();

        const protocolo = location.protocol === "https:"
            ? "wss:" : "ws:";

        socket = new WebSocket(
            `${protocolo}//${location.host}${BASE}/ws`
        );

        const conexao = socket;

        socket.onopen = () => {
            if (socket !== conexao || token() !== credencial) return;
            conexao.send(JSON.stringify({ token: credencial }));
        };

        socket.onmessage = evento => {
            if (socket !== conexao || token() !== credencial) return;

            let dados;

            try {
                dados = JSON.parse(evento.data);
            } catch {
                return;
            }

            if (dados.evento === "CONECTADO") {
                el("chat-conexao").textContent = "Conectado";
            }

            if (dados.evento === "ATUALIZAR_CHAT") {
                atualizarBadge(dados.notificacoes.length);

                sincronizar();
            }
        };

        socket.onclose = evento => {
            if (socket !== conexao) return;
            socket = null;

            el("chat-conexao").textContent = "Desconectado";

            if (token() && !paginaSuspensa && evento.code !== 1008) {
                timer = setTimeout(conectar, 5000);
            }
        };
    }

    window.EasyInternChat = {
        async iniciar(idCandidatura) {
            try {
                const dados = await api("/conversas", "POST", {
                    id_candidatura: Number(idCandidatura)
                });

                el("nav-chat").click();

                let item = null;
                let numeroPagina = 1;
                let temProxima = true;

                while (!item && temProxima) {
                    const lista = await api(
                        `/conversas?pagina=${numeroPagina}&limite=100`
                    );

                    item = lista.items.find(
                        c => c.id_chat === dados.id_chat
                    );

                    temProxima = Boolean(lista.tem_proxima)
                        && lista.items.length > 0;

                    numeroPagina++;
                }

                if (!item) {
                    throw new Error("Conversa não localizada na lista.");
                }

                await abrirConversa(item);

            } catch (erro) {
                window.alert(erro.message);
            }
        }
    };


    document.addEventListener("click", evento => {
        const botao = evento.target.closest(
            "[data-candidatura-chat]"
        );

        if (!botao) return;

        const id = Number(botao.dataset.candidaturaChat);

        if (!Number.isSafeInteger(id) || id <= 0) {
            window.alert("Candidatura invalida.");
            return;
        }

        window.EasyInternChat.iniciar(id);
    });

    el("nav-chat").addEventListener("click", () => {
        carregarConversas().catch(e => aviso(e.message));
        conectar();
    });

    el("chat-atualizar").addEventListener("click", sincronizar);

    el("chat-mais-conversas").addEventListener("click", () => {
        carregarConversas(true).catch(e => aviso(e.message));
    });

    el("chat-mais-mensagens").addEventListener("click", () => {
        carregarAnteriores().catch(e => aviso(e.message));
    });

    el("chat-bloquear").addEventListener("click", () => {
        alterarStatus("bloqueado").catch(e => aviso(e.message));
    });

    el("chat-encerrar").addEventListener("click", () => {
        alterarStatus("encerrado").catch(e => aviso(e.message));
    });

    document.addEventListener("visibilitychange", sincronizar);

    window.addEventListener("pagehide", () => {
        paginaSuspensa = true;
        encerrarSocket();
    });

    window.addEventListener("pageshow", () => {
        paginaSuspensa = false;
        verificarSessao();
        conectar();
        atualizarNotificacoes();
        sincronizar();
    });

    window.addEventListener("storage", verificarSessao);

    conectar();

    atualizarNotificacoes();

    setInterval(atualizarNotificacoes, 5000);

    setInterval(() => {
        if (!token()) {
            clearTimeout(timer);

            if (socket) socket.close();

            conversa = null;
            mensagens = [];
            pendente = null;
            versao++;

            el("chat-conversas").replaceChildren();
            el("chat-mensagens").replaceChildren();
            el("chat-conteudo").value = "";
            atualizarBadge(0);

            atualizarControles();

            return;
        }

        sincronizar();
    }, 15000);

})();
