
(() => {
    const origem = document.getElementById('dash-greeting');
    const destino = document.getElementById('ei2-empresa-saudacao');

    if (!origem || !destino) return;

    function atualizar() {
        const nome = origem.textContent.split('\u00b7')[0].trim();

        if (nome && nome !== 'Painel do Recrutador') {
            destino.textContent = 'Ol\u00e1, ' + nome + '!';
        }
    }

    new MutationObserver(atualizar).observe(origem, {
        childList: true,
        subtree: true,
        characterData: true
    });

    atualizar();
})();


// EI2-EMPRESA-DASHBOARD-HIBRIDO

(() => {
    const chart = document.getElementById('ep-chart-vagas');

    if (!chart) return;

    function criar(tag, classe, texto) {
        const el = document.createElement(tag);

        if (classe) el.className = classe;
        if (texto !== undefined) el.textContent = texto;

        return el;
    }

    async function atualizarGrafico() {
        try {
            const vagas = await apiFetch(API.vagas_emp);

            if (!Array.isArray(vagas)) {
                throw new Error('Dados invalidos');
            }

            const dados = vagas.map(vaga => ({
                titulo: vaga.titulo || 'Vaga sem titulo',
                quantidade: vaga.total_candidatos == null
                    ? NaN
                    : Number(vaga.total_candidatos)
            }));

            if (dados.some(v =>
                !Number.isInteger(v.quantidade) ||
                v.quantidade < 0
            )) {
                throw new Error('Contagens indisponiveis');
            }

            chart.replaceChildren();

            if (!dados.length) {
                chart.textContent = 'Nenhuma vaga publicada.';
                return;
            }

            const ordenados = [...dados].sort(
                (a,b) => b.quantidade - a.quantidade
            );

            const maximo = Math.max(
                1, ...ordenados.map(v => v.quantidade)
            );

            ordenados.slice(0,6).forEach(vaga => {
                const row = criar('div','ep-chart-row');

                const label = criar('div','ep-chart-label');

                label.append(
                    criar('span','',vaga.titulo),
                    criar('strong','',vaga.quantidade)
                );

                const track = criar('div','ep-chart-track');
                const bar = criar('div','ep-chart-bar');

                bar.style.width =
                    (vaga.quantidade / maximo * 100) + '%';

                track.setAttribute('aria-hidden','true');
                track.append(bar);

                row.append(label,track);
                chart.append(row);
            });

            const total = dados.reduce(
                (s,v) => s + v.quantidade, 0
            );

            const summary = criar('div','ep-chart-summary');

            summary.append(
                criar('span','','Total de candidaturas'),
                criar('strong','',total)
            );

            chart.append(summary);

            if (dados.length > 6) {
                chart.append(criar(
                    'small','',
                    'Exibindo as seis vagas com mais candidaturas.'
                ));
            }

        } catch (erro) {
            chart.textContent =
                'Nao foi possivel carregar as candidaturas.';

            console.warn('Grafico empresarial:',erro.message);
        }
    }

    const atalhos = {
        'ep-quick-publish': 'btn-nova-vaga-header',
        'ep-quick-candidates': 'nav-candidatos',
        'ep-quick-jobs': 'nav-vagas',
        'ep-quick-chat': 'nav-chat'
    };

    Object.entries(atalhos).forEach(([botao,destino]) => {
        document.getElementById(botao)
            ?.addEventListener('click',() => {
                document.getElementById(destino)?.click();
            });
    });

    const tabela = document.getElementById('vagas-table-wrap');

    if (tabela) {
        let timer;

        new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(atualizarGrafico,200);
        }).observe(tabela,{
            childList:true
        });
    }

    atualizarGrafico();
})();


// EI2-PAGINACAO-MODERNA

(() => {
    const painel = document.getElementById(
        'paginacao-vagas-empresa'
    );

    if (!painel) return;

    function atualizar() {
        const controles = painel.querySelector(':scope > div');
        const info = painel.querySelector(':scope > span');

        if (!controles || !info) return;
        if (controles.dataset.modernizado) return;

        const botoes = controles.querySelectorAll('button');

        if (botoes.length !== 2) return;

        controles.dataset.modernizado = 'true';

        const pagina = info.textContent.match(/(\d+)\s+de\s+(\d+)/);

        botoes[0].innerHTML =
            '<i class="bi bi-chevron-left" aria-hidden="true"></i>';

        botoes[0].setAttribute('aria-label','Pagina anterior');
        botoes[0].title = 'Pagina anterior';

        botoes[1].innerHTML =
            '<i class="bi bi-chevron-right" aria-hidden="true"></i>';

        botoes[1].setAttribute('aria-label','Proxima pagina');
        botoes[1].title = 'Proxima pagina';

        if (pagina) {
            const atual = document.createElement('span');

            atual.className = 'ep-current-page';
            atual.textContent = pagina[1];
            atual.setAttribute('aria-current','page');

            controles.insertBefore(atual,botoes[1]);
        }

        const partes = info.textContent.split('\u00b7');

        if (partes.length === 2) {
            const titulo = document.createElement('strong');
            titulo.textContent = partes[0].trim();

            const detalhes = document.createElement('small');
            detalhes.textContent = partes[1].trim();
            detalhes.style.display = 'block';
            detalhes.style.marginTop = '5px';
            detalhes.style.color = 'var(--ep-muted)';
            detalhes.style.fontWeight = '400';

            info.replaceChildren(titulo,detalhes);
        }
    }

    new MutationObserver(atualizar).observe(painel,{
        childList:true,
        subtree:true
    });

    atualizar();
})();
