
(() => {
    const section = document.getElementById('section-candidatos');
    const select = document.getElementById('select-vaga-cands');
    const ranking = document.getElementById('candidatos-ranking');

    if (!section || !select || !ranking) return;
    if (section.querySelector('.er-hero')) return;

    const criar = (tag, classe, texto) => {
        const el = document.createElement(tag);
        el.className = classe || '';
        if (texto !== undefined) el.textContent = texto;
        return el;
    };

    const hero = criar('div','er-hero');

    hero.innerHTML = `
        <div>
            <span class="er-eyebrow">RECRUTAMENTO INTELIGENTE</span>
            <h2 id="er-title">Candidatos da vaga</h2>
            <p>Gerencie candidaturas e analise a compatibilidade profissional.</p>
        </div>
        <div class="er-hero-icon">
            <i class="bi bi-people"></i>
        </div>
    `;

    section.prepend(hero);

    const stats = criar('div','er-stats');

    stats.innerHTML = `
        <div class="er-stat">
            <i class="bi bi-people"></i>
            <div><strong id="er-total">&mdash;</strong><span>Candidatos</span></div>
        </div>
        <div class="er-stat">
            <i class="bi bi-cpu"></i>
            <div><strong id="er-avaliados">&mdash;</strong><span>Avaliados pela IA</span></div>
        </div>
        <div class="er-stat">
            <i class="bi bi-check-circle"></i>
            <div><strong id="er-aprovados">&mdash;</strong><span>Aprovados</span></div>
        </div>
    `;

    const results = criar('div','er-results');
    const controls = criar('div','er-controls');

    controls.innerHTML = `
        <h3>Ranking de candidatos</h3>

        <div class="er-filter-row">
            <div class="er-search">
                <i class="bi bi-search"></i>
                <input type="search" id="er-search"
                    aria-label="Buscar candidato"
                    placeholder="Buscar candidato...">
            </div>

            <select id="er-status-filter" aria-label="Filtrar candidatos">
                <option value="">Todas as situa&ccedil;&otilde;es</option>
                <option value="pendente">Pendente</option>
                <option value="em analise">Em an&aacute;lise</option>
                <option value="entrevista">Entrevista</option>
                <option value="aprovado">Aprovado</option>
                <option value="reprovado">Reprovado</option>
                <option value="__avaliado">Avaliado pela IA</option>
                <option value="__nao_avaliado">N&atilde;o avaliado</option>
            </select>
        </div>
    `;

    const columns = criar('div','er-columns');

    columns.innerHTML = `
        <span>#</span>
        <span>Candidato</span>
        <span>Compatibilidade</span>
        <span>Situa&ccedil;&atilde;o</span>
        <span>A&ccedil;&otilde;es</span>
    `;

    const vazio = criar(
        'div','er-no-results',
        'Nenhum candidato corresponde aos filtros.'
    );
    vazio.hidden = true;

    ranking.before(stats,results);
    results.append(controls,columns,ranking,vazio);

    const aviso = criar('div','er-disclaimer');

    aviso.innerHTML = `
        <i class="bi bi-info-circle"></i>
        <span>A IA auxilia na an&aacute;lise da compatibilidade
        profissional. Os resultados podem conter imprecis&otilde;es
        e n&atilde;o substituem a avalia&ccedil;&atilde;o humana.</span>
    `;

    results.after(aviso);

    const search = document.getElementById('er-search');
    const filtro = document.getElementById('er-status-filter');

    const normalizar = texto => String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'')
        .toLowerCase()
        .replace(/_/g,' ')
        .trim();

    const cards = () => [...ranking.querySelectorAll(
        '.ranking-card[data-candidato-indice]'
    )];

    function filtrar() {
        const busca = normalizar(search.value);
        const status = filtro.value;
        let visiveis = 0;

        cards().forEach(card => {
            const nome = normalizar(
                card.querySelector('.ranking-nome')?.textContent
            );

            const area = normalizar(
                card.querySelector('.ranking-sub')?.textContent
            );

            let corresponde = true;

            if (status === '__avaliado') {
                corresponde = card.dataset.erAvaliado === 'true';
            } else if (status === '__nao_avaliado') {
                corresponde = card.dataset.erAvaliado === 'false';
            } else if (status) {
                corresponde = card.dataset.erStatus === status;
            }

            card.hidden = !(
                corresponde &&
                (nome.includes(busca) || area.includes(busca))
            );

            if (!card.hidden) visiveis++;
        });

        vazio.hidden = !cards().length || visiveis > 0;
    }

    function atualizar() {
        const lista = cards();

        document.getElementById('er-title').textContent =
            select.value
                ? (select.selectedOptions[0]?.textContent || '')
                    .replace(/\s*\(\d+\s+candidatos?\)\s*$/,'').trim()
                : 'Candidatos da vaga';

        let avaliados = 0;
        let aprovados = 0;
        let desconhecidos = 0;

        lista.forEach(card => {
            const nome = card.querySelector('.ranking-nome');
            const avatar = card.querySelector('.ranking-avatar');
            const score = card.querySelector('.ranking-score-wrap');

            if (!card.dataset.erModernizado) {
                const badge = card.querySelector('.ranking-sub .cand-status-badge')
                    || card.querySelector('.ranking-sub [class*="status"]');

                const status = criar('div','er-status');

                card.dataset.erStatus = normalizar(badge?.textContent);

                if (badge) {
                    const sub = card.querySelector('.ranking-sub');
                    badge.remove();

                    if (sub) {
                        for (const node of sub.childNodes) {
                            if (node.nodeType === 3) {
                                node.textContent = node.textContent
                                    .replace(/\s*\u00b7\s*$/,'');
                            }
                        }
                    }

                    status.append(badge);
                } else {
                    status.textContent = '\u2014';
                }

                if (avatar && nome) {
                    const partes = nome.textContent.trim().split(/\s+/);
                    avatar.textContent = (
                        partes[0]?.[0] +
                        (partes.length > 1
                            ? partes[partes.length - 1][0]
                            : '')
                    ).toUpperCase();
                }

                const botao = criar(
                    'button','er-view','Ver perfil'
                );

                botao.type = 'button';

                botao.addEventListener('click',event => {
                    event.stopPropagation();
                    card.click();
                });

                card.append(status,botao);
                card.dataset.erModernizado = 'true';
            }

            const textoScore = normalizar(score?.textContent);

            if (textoScore.includes('nao avaliado')) {
                card.dataset.erAvaliado = 'false';
            } else if (/\d+(?:[.,]\d+)?\s*%/.test(textoScore)) {
                card.dataset.erAvaliado = 'true';
                avaliados++;
            } else {
                card.dataset.erAvaliado = 'unknown';
                desconhecidos++;
            }

            if (card.dataset.erStatus === 'aprovado') {
                aprovados++;
            }
        });

        const semCandidatos = normalizar(ranking.textContent)
            .includes('nenhum candidato inscrito');

        const disponivel = lista.length > 0 || semCandidatos;

        document.getElementById('er-total').textContent =
            disponivel ? lista.length : '\u2014';

        document.getElementById('er-avaliados').textContent =
            disponivel && desconhecidos === 0 ? avaliados : '\u2014';

        document.getElementById('er-aprovados').textContent =
            disponivel ? aprovados : '\u2014';

        controls.hidden = !lista.length;
        columns.hidden = !lista.length;

        filtrar();
    }

    search.addEventListener('input',filtrar);
    filtro.addEventListener('change',filtrar);

    select.addEventListener('change',() => {
        search.value = '';
        filtro.value = '';

        if (!select.value) {
            if (typeof rankingRequestId !== 'undefined') {
                rankingRequestId++;
            }

            ranking.innerHTML =
                '<div class="empty-state"><h4>Selecione uma vaga.</h4></div>';
        }

        atualizar();
    });

    let agendado = false;

    new MutationObserver(() => {
        if (agendado) return;
        agendado = true;

        requestAnimationFrame(() => {
            agendado = false;
            atualizar();
        });
    }).observe(ranking,{
        childList:true,
        subtree:true,
        characterData:true
    });

    atualizar();
})();



// EI2-RANKING-REFINAMENTOS
(() => {
    const ranking = document.getElementById('candidatos-ranking');
    const seletor = document.getElementById('select-vaga-cands');
    const modal = document.getElementById('modal-candidato');
    const corpo = document.getElementById('modal-candidato-body');

    if (!ranking || !seletor || !modal || !corpo) return;

    function corrigirOpcoes() {
        [...seletor.options].forEach(opcao => {
            const texto = opcao.textContent.replace(
                /\(1 candidatos\)/g,
                '(1 candidato)'
            );

            if (texto !== opcao.textContent) {
                opcao.textContent = texto;
            }
        });
    }

    new MutationObserver(corrigirOpcoes).observe(seletor,{
        childList:true,
        subtree:true
    });

    corrigirOpcoes();

    function ajustarEstadoInicial() {
        const aviso = document.querySelector('.er-disclaimer');

        if (aviso) aviso.hidden = !seletor.value;

        if (!seletor.value) {
            ['er-total','er-avaliados','er-aprovados'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = '\u2014';
            });
        }
    }

    seletor.addEventListener('change',ajustarEstadoInicial);

    new MutationObserver(ajustarEstadoInicial).observe(ranking,{
        childList:true
    });

    ajustarEstadoInicial();

    function modernizarModal() {
        const perfil = corpo.querySelector('.ranking-card');

        if (!perfil || perfil.dataset.erPerfilModernizado) return;

        perfil.dataset.erPerfilModernizado = 'true';

        const nome = perfil.querySelector('.ranking-nome');
        const avatar = perfil.querySelector('.ranking-avatar');

        if (nome && avatar) {
            const partes = nome.textContent.trim().split(/\s+/);

            avatar.textContent = (
                partes[0][0] +
                (partes.length > 1
                    ? partes[partes.length - 1][0]
                    : '')
            ).toUpperCase();
        }

        const filhos = [...corpo.children];

        filhos[1]?.classList.add('er-profile-details');
        filhos[2]?.classList.add('er-profile-match');
        filhos[3]?.classList.add('er-profile-feedback');

        const skills = filhos[1]?.children[1]?.querySelector('p');

        if (skills && skills.textContent.trim() &&
            !skills.textContent.includes('informadas')) {

            const tags = skills.textContent.split(',')
                .map(t => t.trim()).filter(Boolean);

            const lista = document.createElement('div');
            lista.className = 'er-profile-skills';

            tags.forEach(tag => {
                const item = document.createElement('span');
                item.textContent = tag;
                lista.append(item);
            });

            skills.replaceWith(lista);
        }

        const baixar = corpo.querySelector('#ei-baixar-curriculo');

        if (baixar) {
            baixar.innerHTML =
                '<i class="bi bi-file-earmark-pdf"></i> Baixar curr&iacute;culo PDF';
        }

        const chat = corpo.querySelector('.ei-iniciar-chat');

        if (chat) {
            chat.innerHTML =
                '<i class="bi bi-chat-dots"></i> Conversar com candidato';
        }

        const feedback = corpo.querySelector('#ei-feedback-texto');

        if (feedback) {
            feedback.placeholder =
                'Informe pontos de melhoria e orienta\u00e7\u00f5es profissionais...';
        }

        corpo.scrollTop = 0;
    }

    new MutationObserver(modernizarModal).observe(corpo,{
        childList:true
    });

    modernizarModal();
})();
