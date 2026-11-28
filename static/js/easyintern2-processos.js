
(() => {
    const section = document.getElementById('section-processos');
    const nav = document.getElementById('nav-processos');
    const select = document.getElementById('ps-vaga');
    const lista = document.getElementById('ps-lista');
    const rankingSelect = document.getElementById('select-vaga-cands');
    const modal = document.getElementById('modal-candidato');

    if (!section || !nav || !select || !lista || !rankingSelect) return;

    let candidatos = [];
    let filtro = 'todos';
    let requestId = 0;
    let gerenciando = false;
    let carregado = false;

    const criar = (tag, classe, texto) => {
        const el = document.createElement(tag);
        el.className = classe || '';
        if (texto !== undefined) el.textContent = texto;
        return el;
    };

    function mensagem(texto, icone = 'bi-diagram-3') {
        const caixa = criar('div','ps-empty');
        caixa.append(
            criar('i','bi ' + icone),
            criar('p','',texto)
        );
        lista.replaceChildren(caixa);
    }

    function sincronizarVagas() {
        const anterior = select.value;
        select.replaceChildren(
            ...[...rankingSelect.options].map(o => o.cloneNode(true))
        );

        if ([...select.options].some(o => o.value === anterior)) {
            select.value = anterior;
        }
    }

    function atualizarIndicadores() {
        const contagem = status =>
            candidatos.filter(c => c.status === status).length;

        const valores = {
            'ps-pendentes': contagem('pendente'),
            'ps-analise': contagem('em_analise'),
            'ps-entrevistas': contagem('entrevista'),
            'ps-finalizados': contagem('aprovado') + contagem('reprovado')
        };

        Object.entries(valores).forEach(([id,valor]) => {
            document.getElementById(id).textContent =
                carregado ? valor : '\u2014';
        });
    }



    // EI2-KANBAN-DRAG-DROP

    let arrastando = null;
    let movendo = false;

    const statusRotulos = {
        pendente: 'Pendente',
        em_analise: 'Em an\u00e1lise',
        entrevista: 'Entrevista',
        aprovado: 'Aprovado',
        reprovado: 'Reprovado'
    };


    // EI2-KANBAN-TRANSICOES

    const transicoesPermitidas = {
        pendente: ['em_analise','reprovado'],
        em_analise: ['entrevista','reprovado'],
        entrevista: ['aprovado','reprovado'],
        aprovado: [],
        reprovado: []
    };

    function podeMover(origem,destino) {
        return (transicoesPermitidas[origem] || [])
            .includes(destino);
    }

    let confirmando = false;

    function confirmarMovimento(c,destino) {
        return new Promise(resolve => {
            const dialogo = criar('dialog','ps-confirm');
            dialogo.setAttribute(
                'aria-labelledby','ps-confirm-title'
            );

            const icone = criar('div','ps-confirm-icon');
            icone.innerHTML = '<i class="bi bi-arrow-left-right"></i>';

            const titulo = criar(
                'h3','','Confirmar altera\u00e7\u00e3o'
            );
            titulo.id = 'ps-confirm-title';

            const descricao = criar(
                'p','',
                'Alterar a candidatura de ' + c.nome + '?'
            );

            const fluxo = criar('div','ps-confirm-flow');

            const origem = criar(
                'span','',statusRotulos[c.status]
            );

            const seta = criar('i','bi bi-arrow-right');

            const chegada = criar(
                'strong','',statusRotulos[destino]
            );

            chegada.dataset.status = destino;
            fluxo.append(origem,seta,chegada);

            const aviso = criar(
                'p','ps-confirm-note',
                ['aprovado','reprovado'].includes(destino)
                    ? 'Esta etapa finaliza a candidatura e n\u00e3o pode ser revertida.'
                    : 'A situa\u00e7\u00e3o da candidatura ser\u00e1 atualizada.'
            );

            const botoes = criar('div','ps-confirm-actions');

            const cancelar = criar(
                'button','ps-confirm-cancel','Cancelar'
            );
            cancelar.type = 'button';
            cancelar.autofocus = true;

            const confirmar = criar(
                'button','ps-confirm-submit','Confirmar'
            );
            confirmar.type = 'button';
            confirmar.dataset.status = destino;

            cancelar.addEventListener('click',() => {
                dialogo.close('cancelar');
            });

            confirmar.addEventListener('click',() => {
                dialogo.close('confirmar');
            });

            dialogo.addEventListener('close',() => {
                const resposta =
                    dialogo.returnValue === 'confirmar';

                dialogo.remove();
                resolve(resposta);
            },{once:true});

            botoes.append(cancelar,confirmar);

            dialogo.append(
                icone,titulo,descricao,fluxo,aviso,botoes
            );

            document.body.append(dialogo);
            dialogo.showModal();
        });
    }


    function limparArraste() {
        arrastando = null;

        lista.querySelectorAll(
            '.ps-dragging,.ps-drop-target,.ps-drop-allowed,.ps-drop-blocked'
        ).forEach(el => {
            el.classList.remove(
                'ps-dragging','ps-drop-target','ps-drop-allowed','ps-drop-blocked'
            );
        });
    }

    async function moverCandidato(c, destino) {
        if (movendo || confirmando || !c || !c.candidatura_id) return;

        if (
            !Object.hasOwn(statusRotulos,destino) ||
            destino === c.status
        ) return;

        const vagaOriginal = select.value;


        if (!podeMover(c.status,destino)) return;

        confirmando = true;
        let confirmado = false;

        try {
            confirmado = await confirmarMovimento(c,destino);
        } finally {
            confirmando = false;
        }

        if (!confirmado || select.value !== vagaOriginal) return;

        movendo = true;
        lista.setAttribute('aria-busy','true');

        const controles = [
            select,
            document.getElementById('ps-atualizar'),
            ...lista.querySelectorAll('button')
        ].filter(Boolean);

        const estados = controles.map(el => [el,el.disabled]);

        controles.forEach(el => el.disabled = true);

        try {
            await apiFetch(
                API.update_status(c.candidatura_id),
                {status: destino},
                'PATCH'
            );

            showToast(
                'Status atualizado com sucesso!',
                'success'
            );

            if (select.value === vagaOriginal) {
                await carregar();
            }

        } catch (erro) {
            showToast(
                erro.message || 'Nao foi possivel alterar o status.',
                'error'
            );

            if (select.value === vagaOriginal) {
                await carregar();
            }

        } finally {
            movendo = false;

            estados.forEach(([el,estado]) => {
                el.disabled = estado;
            });

            lista.removeAttribute('aria-busy');
            limparArraste();
        }
    }

    function ativarArraste(card,c) {
        if (!c.candidatura_id) return;


        const destinos = transicoesPermitidas[c.status] || [];

        if (!destinos.length) {
            card.draggable = false;

            if (['aprovado','reprovado'].includes(c.status)) {
                card.classList.add('ps-finalizado');

                card.append(criar(
                    'small','ps-finalizado-note',
                    'Candidatura finalizada'
                ));
            }

            return;
        }

        card.draggable = true;


        card.addEventListener('dragstart',e => {
            if (
                movendo || confirmando ||
                filtro !== 'todos' ||
                !e.dataTransfer
            ) {
                e.preventDefault();
                return;
            }

            arrastando = {
                candidato: c,
                vaga: select.value
            };

            e.dataTransfer.effectAllowed = 'move';

            e.dataTransfer.setData(
                'text/plain',
                String(c.candidatura_id)
            );


            card.classList.add('ps-dragging');

            lista.querySelectorAll('.ps-kanban-column')
                .forEach(coluna => {
                    const permitido = podeMover(
                        c.status,coluna.dataset.status
                    );

                    coluna.classList.toggle(
                        'ps-drop-allowed',permitido
                    );

                    coluna.classList.toggle(
                        'ps-drop-blocked',!permitido
                    );
                });

        });

        card.addEventListener('dragend',limparArraste);
    }

    function ativarDestino(coluna,status) {
        if (!Object.hasOwn(statusRotulos,status)) return;

        function destinoValido() {
            return (
                arrastando &&
                !movendo &&
                arrastando.vaga === select.value &&
                podeMover(arrastando.candidato.status,status)
            );
        }

        coluna.addEventListener('dragover',e => {
            if (!destinoValido()) return;

            e.preventDefault();

            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }

            coluna.classList.add('ps-drop-target');
        });

        coluna.addEventListener('dragleave',e => {
            if (!coluna.contains(e.relatedTarget)) {
                coluna.classList.remove('ps-drop-target');
            }
        });

        coluna.addEventListener('drop',e => {
            e.preventDefault();

            if (!destinoValido()) {
                limparArraste();
                return;
            }

            const candidato = arrastando.candidato;

            limparArraste();
            moverCandidato(candidato,status);
        });
    }

    function renderizar() {
        if (!carregado) return;

        lista.replaceChildren();

        const board = criar('div','ps-kanban');

        const etapas = [
            ['pendente','Pendentes'],
            ['em_analise','Em an\u00e1lise'],
            ['entrevista','Entrevistas'],
            ['aprovado','Aprovados'],
            ['reprovado','Reprovados']
        ];

        const outros = candidatos.filter(c =>
            !etapas.some(e => e[0] === c.status)
        );

        if (outros.length) {
            etapas.push(['__outros','Outras situa\u00e7\u00f5es']);
        }

        const colunas = filtro === 'todos'
            ? etapas
            : etapas.filter(e => e[0] === filtro);

        board.classList.toggle(
            'ps-kanban-filtered',
            filtro !== 'todos'
        );

        colunas.forEach(([status,rotulo]) => {
            const grupo = status === '__outros'
                ? outros
                : candidatos.filter(c => c.status === status);

            const coluna = criar('section','ps-kanban-column');
            coluna.dataset.status = status;

            const header = criar('div','ps-kanban-header');
            const indicador = criar('span','ps-kanban-dot');
            const titulo = criar('h4','',rotulo);
            const total = criar('span','ps-kanban-count',grupo.length);

            header.append(indicador,titulo,total);

            const corpo = criar('div','ps-kanban-content');

            if (!grupo.length) {
                corpo.append(criar(
                    'div',
                    'ps-kanban-empty',
                    'Nenhuma candidatura'
                ));
            }

            grupo.forEach(c => {
                const card = criar('article','ps-kanban-card');

                const nome = String(c.nome || 'Candidato');
                const partes = nome.trim().split(/\s+/);

                const iniciais = (
                    (partes[0]?.[0] || '') +
                    (partes.length > 1
                        ? partes[partes.length - 1][0] : '')
                ).toUpperCase();

                const topo = criar('div','ps-kanban-person');
                const avatar = criar('div','ps-avatar',iniciais);

                const info = criar('div','ps-kanban-name');

                info.append(
                    criar('strong','',nome),
                    criar('p','',
                        c.area_interesse || 'Perfil profissional')
                );

                topo.append(avatar,info);

                const badge = criar('div','ps-kanban-status');
                badge.innerHTML = statusBadge(c.status);

                const botao = criar(
                    'button','ps-kanban-manage','Gerenciar'
                );

                botao.type = 'button';

                botao.addEventListener('click',() => {
                    gerenciando = true;

                    currentVagaIdCandidatos = Number(select.value);

                    abrirDetalhesCandidato(
                        c,c.candidatura_id
                    );
                });

                card.append(topo,badge,botao);
                ativarArraste(card,c);
                corpo.append(card);
            });

            coluna.append(header,corpo);
            ativarDestino(coluna,status);
            board.append(coluna);
        });

        lista.append(board);
    }

    async function carregar() {
        const pedido = ++requestId;
        const vaga = Number(select.value);

        candidatos = [];
        carregado = false;
        atualizarIndicadores();

        if (!vaga) {
            mensagem(
                'Selecione uma vaga para acompanhar suas candidaturas.'
            );
            return;
        }

        mensagem('Carregando candidaturas...','bi-hourglass-split');

        try {
            const dados = await apiFetch(
                API.candidatos_vaga(vaga)
            );

            if (pedido !== requestId) return;

            if (!Array.isArray(dados)) {
                throw new Error('Resposta invalida.');
            }

            candidatos = dados;
            carregado = true;

            atualizarIndicadores();
            renderizar();

        } catch (erro) {
            if (pedido !== requestId) return;
            mensagem(
                'Nao foi possivel carregar as candidaturas.',
                'bi-exclamation-circle'
            );
        }
    }

    nav.addEventListener('click',event => {
        event.preventDefault();

        sincronizarVagas();

        if (!select.value && rankingSelect.value) {
            select.value = rankingSelect.value;
        }

        navigateTo('processos');
        document.getElementById('page-title').textContent =
            'Processos seletivos';

        carregar();
    });

    select.addEventListener('change',carregar);

    document.getElementById('ps-atualizar')
        .addEventListener('click',carregar);

    document.querySelectorAll('[data-ps-filter]')
        .forEach(botao => {
            botao.addEventListener('click',() => {
                filtro = botao.dataset.psFilter;

                document.querySelectorAll('[data-ps-filter]')
                    .forEach(b => {
                        const ativo = b === botao;
                        b.classList.toggle('active',ativo);
                        b.setAttribute('aria-pressed',String(ativo));
                    });

                renderizar();
            });
        });

    new MutationObserver(sincronizarVagas).observe(rankingSelect,{
        childList:true,
        subtree:true
    });

    if (modal) {
        new MutationObserver(() => {
            if (gerenciando && modal.hidden) {
                gerenciando = false;
                carregar();
            }
        }).observe(modal,{
            attributes:true,
            attributeFilter:['hidden']
        });
    }

    sincronizarVagas();
})();
