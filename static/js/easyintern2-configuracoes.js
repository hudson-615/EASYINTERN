
(() => {
    const secao = document.getElementById('section-configuracoes');
    if (!secao) return;

    const temaOriginal = secao.querySelector('.settings-card');
    const dashboardOriginal = document.getElementById('card-editar-dashboards');
    const botaoTema = document.getElementById('btn-theme-toggle');

    const destinoTema = document.getElementById('es-theme-original');
    const destinoDashboard = document.getElementById('es-dashboard-original');

    if (!temaOriginal || !dashboardOriginal || !botaoTema ||
        !destinoTema || !destinoDashboard) {
        console.error('Estrutura de configuracoes incompleta.');
        return;
    }

    // Mover os elementos sem recriar seus eventos.
    destinoTema.append(temaOriginal);
    destinoDashboard.append(dashboardOriginal);

    const abas = [...secao.querySelectorAll('[data-es-tab]')];
    const paineis = [...secao.querySelectorAll('[data-es-panel]')];

    function abrirAba(nome) {
        abas.forEach(botao => {
            const ativo = botao.dataset.esTab === nome;
            botao.classList.toggle('active', ativo);
            botao.setAttribute('aria-pressed', String(ativo));
        });

        paineis.forEach(painel => {
            painel.hidden = painel.dataset.esPanel !== nome;
        });
    }

    abas.forEach(botao => {
        botao.addEventListener('click', () => {
            abrirAba(botao.dataset.esTab);
        });
    });

    // Reutilizar a navegacao existente.
    secao.querySelectorAll('[data-es-go]').forEach(botao => {
        const destino = document.getElementById(botao.dataset.esGo);

        if (!destino) {
            botao.disabled = true;
            botao.title = 'Navegacao indisponivel';
            return;
        }

        botao.addEventListener('click', () => destino.click());
    });

    const temas = [...secao.querySelectorAll('[data-es-theme]')];

    function temaAtual() {
        return document.body.dataset.theme === 'dark'
            ? 'dark'
            : 'light';
    }

    function sincronizarTema() {
        const atual = temaAtual();

        temas.forEach(botao => {
            const ativo = botao.dataset.esTheme === atual;
            botao.classList.toggle('active', ativo);
            botao.setAttribute('aria-pressed', String(ativo));
        });
    }

    temas.forEach(botao => {
        botao.addEventListener('click', () => {
            if (temaAtual() !== botao.dataset.esTheme) {
                botaoTema.click();
            }

            sincronizarTema();
        });
    });

    new MutationObserver(sincronizarTema).observe(document.body, {
        attributes: true,
        attributeFilter: ['data-theme']
    });

    abrirAba('conta');
    sincronizarTema();
})();



// EI2-SETTINGS-OFFICIAL-PROTOTYPE
(() => {
    const secao = document.getElementById(
        'section-configuracoes'
    );

    if (!secao) return;

    const menu = secao.querySelector('.es-menu');
    const content = secao.querySelector('.es-content');

    if (!menu || !content) return;

    const dados = [
        ['conta', 'Conta',
         'Dados de acesso e seguran\u00e7a',
         'bi-person'],

        ['privacidade', 'Privacidade',
         'Quem pode ver seu perfil e projetos',
         'bi-shield-check'],

        ['notificacoes', 'Notifica\u00e7\u00f5es',
         'E-mails e alertas da plataforma',
         'bi-bell'],

        ['acessibilidade', 'Acessibilidade',
         'Recurso em desenvolvimento',
         'bi-universal-access'],

        ['aparencia', 'Apar\u00eancia',
         'Tema claro ou escuro',
         'bi-palette'],

        ['preferencias', 'Prefer\u00eancias de vagas',
         '\u00c1rea de interesse e habilidades',
         'bi-briefcase'],

        ['dashboard', 'Dashboard',
         'Personaliza\u00e7\u00e3o do seu painel',
         'bi-grid']
    ];

    const anteriores = new Map(
        [...menu.querySelectorAll('[data-es-tab]')]
        .map(b => [b.dataset.esTab, b])
    );

    const voltar = document.createElement('button');

    voltar.type = 'button';
    voltar.className = 'es-back';
    voltar.innerHTML =
        '<i class="bi bi-arrow-left"></i> Voltar para configura\u00e7\u00f5es';

    content.before(voltar);

    function mostrarMenu() {
        menu.hidden = false;
        content.hidden = true;
        voltar.hidden = true;
    }

    dados.forEach(([id, nome, descricao, icone]) => {
        let botao = anteriores.get(id);

        if (!botao) {
            botao = document.createElement('button');
            botao.type = 'button';
            botao.disabled = true;
            botao.setAttribute('aria-disabled', 'true');
        }

        botao.classList.remove('active');

        botao.innerHTML = `
            <i class="bi ${icone}"></i>
            <span class="es-option-text">
                <strong>${nome}</strong>
                <small>${descricao}</small>
            </span>
            <i class="bi bi-chevron-right es-option-arrow"></i>
        `;

        menu.append(botao);

        if (!botao.disabled) {
            botao.addEventListener('click', () => {
                menu.hidden = true;
                content.hidden = false;
                voltar.hidden = false;

                secao.scrollIntoView({
                    block: 'start'
                });
            });
        }
    });

    voltar.addEventListener('click', mostrarMenu);

    new MutationObserver(() => {
        if (!secao.classList.contains('active')) {
            mostrarMenu();
        }
    }).observe(secao, {
        attributes: true,
        attributeFilter: ['class']
    });

    mostrarMenu();
})();
