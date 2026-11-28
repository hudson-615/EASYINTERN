
(() => {
    const recrutadores = document.getElementById('em-recruiters');
    const rede = document.getElementById('em-network');

    const painelRecrutadores =
        document.getElementById('em-recruiter-panel');

    const painelRede =
        document.getElementById('em-network-panel');

    if (!recrutadores || !rede ||
        !painelRecrutadores || !painelRede) return;

    function alternar(social) {
        recrutadores.classList.toggle('active', !social);
        rede.classList.toggle('active', social);

        recrutadores.setAttribute(
            'aria-pressed', String(!social)
        );

        rede.setAttribute(
            'aria-pressed', String(social)
        );

        painelRecrutadores.hidden = social;
        painelRede.hidden = !social;
    }

    recrutadores.onclick = () => alternar(false);
    rede.onclick = () => alternar(true);

    alternar(false);
})();


// EI2-MESSAGES-NAVIGATION

(() => {
    const secao = document.getElementById('section-chat');
    if (!secao) return;

    let estavaAtiva = false;

    function atualizar() {
        const ativa = secao.classList.contains('active');

        if (ativa && !estavaAtiva) {
            requestAnimationFrame(() => {
                window.scrollTo(0, 0);

                for (
                    let el = secao.parentElement;
                    el;
                    el = el.parentElement
                ) {
                    el.scrollTop = 0;
                }
            });
        }

        estavaAtiva = ativa;
    }

    new MutationObserver(atualizar).observe(secao, {
        attributes: true,
        attributeFilter: ['class']
    });

    atualizar();
})();



// EI2-CHAT-OFFICIAL

(() => {
    const secao = document.getElementById('section-chat');
    if (!secao) return;

    const buscar = document.getElementById('ec-search-conversations');
    const lista = document.getElementById('chat-conversas');
    const mensagens = document.getElementById('chat-mensagens');

    const chat = document.getElementById('ec-tab-chat');
    const notificacoes = document.getElementById('ec-tab-notifications');
    const painelNotificacoes = document.getElementById('ec-notifications');

    const recrutadores = document.getElementById('em-recruiters');
    const rede = document.getElementById('em-network');
    const painelRecrutadores = document.getElementById('em-recruiter-panel');
    const painelRede = document.getElementById('em-network-panel');

    if (!buscar || !lista || !mensagens || !chat ||
        !notificacoes || !painelNotificacoes || !recrutadores ||
        !rede || !painelRecrutadores || !painelRede) return;

    const tipos = secao.querySelector('.em-tabs');

    function alternarNotificacoes(ativo) {
        chat.classList.toggle('active', !ativo);
        notificacoes.classList.toggle('active', ativo);

        chat.setAttribute('aria-pressed', String(!ativo));
        notificacoes.setAttribute('aria-pressed', String(ativo));

        tipos.hidden = ativo;
        painelNotificacoes.hidden = !ativo;

        if (ativo) {
            painelRecrutadores.hidden = true;
            painelRede.hidden = true;
        } else {
            if (rede.getAttribute('aria-pressed') === 'true') {
                rede.click();
            } else {
                recrutadores.click();
            }
        }
    }

    chat.addEventListener('click', () => alternarNotificacoes(false));
    notificacoes.addEventListener('click', () => alternarNotificacoes(true));

    function normalizar(texto) {
        return texto.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    const feedback = document.createElement('p');
    feedback.id = 'ec-search-feedback';
    feedback.setAttribute('role', 'status');
    feedback.textContent = 'Nenhuma conversa encontrada.';
    feedback.hidden = true;
    lista.after(feedback);

    function filtrar() {
        const termo = normalizar(buscar.value.trim());
        const botoes = [...lista.querySelectorAll('.ei-chat-conversa')];

        let encontrados = 0;

        botoes.forEach(botao => {
            const nome = botao.querySelector('strong')?.textContent || '';

            const iniciais = nome.trim().split(/\s+/)
                .slice(0, 2)
                .map(p => p.charAt(0))
                .join('')
                .toUpperCase();

            botao.dataset.ecInitials = iniciais || '?';

            const visivel = normalizar(botao.textContent).includes(termo);

            botao.hidden = !visivel;

            if (visivel) encontrados++;
        });

        feedback.hidden = !termo || !botoes.length || encontrados > 0;
    }

    buscar.addEventListener('input', filtrar);

    function estadoVazio(elemento, icone, titulo, descricao) {
        const bloco = document.createElement('div');
        bloco.className = 'ec-empty';

        const simbolo = document.createElement('i');
        simbolo.className = 'bi ' + icone;
        simbolo.setAttribute('aria-hidden', 'true');

        const texto = document.createElement('strong');
        texto.textContent = titulo;

        const detalhes = document.createElement('p');
        detalhes.textContent = descricao;

        bloco.append(simbolo, texto, detalhes);
        elemento.replaceChildren(bloco);
    }

    function atualizarLista() {
        if (lista.textContent.trim() === 'Nenhuma conversa iniciada.') {
            estadoVazio(
                lista,
                'bi-chat-left-text',
                'Nenhuma conversa',
                'Suas conversas com recrutadores aparecer\u00e3o aqui.'
            );
        }

        filtrar();
    }

    function atualizarMensagens() {
        const texto = mensagens.textContent.trim();

        if (texto === 'Nenhuma conversa selecionada.') {
            estadoVazio(
                mensagens,
                'bi-chat-dots',
                'Selecione uma conversa',
                'Acompanhe seus processos seletivos e converse com recrutadores.'
            );
        } else if (texto === 'Nenhuma mensagem nesta conversa.') {
            estadoVazio(
                mensagens,
                'bi-chat-dots',
                'Nenhuma mensagem',
                'As mensagens desta conversa aparecer\u00e3o aqui.'
            );
        }
    }

    new MutationObserver(atualizarLista).observe(lista, {
        childList: true,
        subtree: true,
        characterData: true
    });

    new MutationObserver(atualizarMensagens).observe(mensagens, {
        childList: true,
        subtree: true,
        characterData: true
    });

    const enviar = document.getElementById('chat-enviar');

    if (enviar) {
        enviar.setAttribute('aria-label', 'Enviar mensagem');
        enviar.title = 'Enviar mensagem';
    }

    atualizarLista();
    atualizarMensagens();
    alternarNotificacoes(false);
})();



// EI2-CHAT-ENTER-SEND
(() => {
    const campo = document.getElementById('chat-conteudo');
    const enviar = document.getElementById('chat-enviar');

    if (!campo || !enviar) return;

    campo.addEventListener('keydown', event => {
        if (
            event.key !== 'Enter' ||
            event.shiftKey ||
            event.isComposing
        ) return;

        event.preventDefault();

        if (
            event.repeat ||
            campo.disabled ||
            enviar.disabled ||
            !campo.value.trim()
        ) return;

        enviar.click();
    });
})();
