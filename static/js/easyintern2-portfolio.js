
(() => {
    const $ = id => document.getElementById(id);

    const grid = $('ep-grid');
    if (!grid) return;

    const dialog = $('ep-dialog');
    const form = $('ep-form');

    function chaveUsuario() {
        try {
            const token =
                localStorage.getItem('easyintern_token') ||
                localStorage.getItem('ag_token');

            if (!token) return null;

            let payload = token.split('.')[1]
                .replace(/-/g, '+')
                .replace(/_/g, '/');

            payload = payload.padEnd(
                Math.ceil(payload.length / 4) * 4, '='
            );

            const dados = JSON.parse(atob(payload));
            const id = dados.id_usuario ?? dados.user_id ?? dados.sub;

            return id == null
                ? null
                : 'ei2_portfolio_' + encodeURIComponent(String(id));
        } catch {
            return null;
        }
    }

    const chave = chaveUsuario();

    let projetos = [];
    let editando = null;

    try {
        if (chave) {
            const dados = JSON.parse(
                localStorage.getItem(chave) || '[]'
            );

            if (Array.isArray(dados)) projetos = dados;
        }
    } catch {}

    function salvar(dados) {
        if (!chave) {
            alert('Nao foi possivel identificar sua conta.');
            return false;
        }

        try {
            localStorage.setItem(chave, JSON.stringify(dados));
            projetos = dados;
            return true;
        } catch {
            alert('Nao foi possivel salvar o projeto.');
            return false;
        }
    }

    function criar(tag, classe, texto) {
        const el = document.createElement(tag);
        el.className = classe || '';
        el.textContent = texto || '';
        return el;
    }

    function tecnologias(texto) {
        return [...new Set(
            String(texto || '').split(',')
                .map(t => t.trim()).filter(Boolean)
        )];
    }

    function linkSeguro(valor) {
        try {
            const url = new URL(valor);
            return ['http:', 'https:'].includes(url.protocol)
                ? url.href : null;
        } catch {
            return null;
        }
    }

    function abrir(projeto = null) {
        editando = projeto ? projeto.id : null;

        form.reset();

        $('ep-dialog-title').textContent = projeto
            ? 'Editar projeto' : 'Novo projeto';

        if (projeto) {
            $('ep-title').value = projeto.titulo;
            $('ep-category').value = projeto.categoria;
            $('ep-description').value = projeto.descricao;
            $('ep-technologies').value = projeto.tecnologias;
            $('ep-url').value = projeto.url;
        }

        dialog.showModal();
    }

    function renderizar() {
        const busca = $('ep-search').value.toLowerCase().trim();

        $('ep-count').textContent = projetos.length;

        $('ep-tech-count').textContent = new Set(
            projetos.flatMap(p => tecnologias(p.tecnologias))
                .map(t => t.toLowerCase())
        ).size;

        $('ep-link-count').textContent = projetos.filter(
            p => linkSeguro(p.url)
        ).length;

        const lista = projetos.filter(p =>
            [p.titulo, p.descricao, p.tecnologias, p.categoria]
                .join(' ').toLowerCase().includes(busca)
        );

        grid.replaceChildren();

        $('ep-empty').hidden = projetos.length > 0;

        if (projetos.length && !lista.length) {
            grid.append(criar('p', '', 'Nenhum projeto encontrado.'));
        }

        lista.forEach(p => {
            const card = criar('article', 'ep-card');
            const capa = criar('div', 'ep-cover');

            capa.append(
                criar('i', 'bi bi-code-slash'),
                criar('span', '', p.categoria)
            );

            const corpo = criar('div', 'ep-card-body');

            corpo.append(
                criar('h3', '', p.titulo),
                criar('p', '', p.descricao)
            );

            const tags = criar('div', 'ep-tags');

            tecnologias(p.tecnologias).forEach(t =>
                tags.append(criar('span', '', t))
            );

            const acoes = criar('div', 'ep-card-actions');
            const url = linkSeguro(p.url);

            if (url) {
                const link = criar('a', '', 'Ver projeto');
                link.href = url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                acoes.append(link);
            }

            const editar = criar('button', 'ep-secondary', 'Editar');
            editar.type = 'button';
            editar.onclick = () => abrir(p);

            const excluir = criar('button', 'ep-secondary', 'Excluir');
            excluir.type = 'button';

            excluir.onclick = () => {
                if (!confirm('Excluir este projeto?')) return;

                if (salvar(projetos.filter(x => x.id !== p.id))) {
                    renderizar();
                }
            };

            acoes.append(editar, excluir);
            corpo.append(tags, acoes);
            card.append(capa, corpo);
            grid.append(card);
        });
    }

    $('ep-add').onclick = () => abrir();
    $('ep-first').onclick = () => abrir();
    $('ep-cancel').onclick = () => dialog.close();
    $('ep-search').oninput = renderizar;

    form.addEventListener('submit', e => {
        e.preventDefault();

        const url = $('ep-url').value.trim();

        if (url && !linkSeguro(url)) {
            alert('Informe um link HTTP ou HTTPS valido.');
            return;
        }

        const projeto = {
            id: editando || crypto.randomUUID(),
            titulo: $('ep-title').value.trim(),
            categoria: $('ep-category').value,
            descricao: $('ep-description').value.trim(),
            tecnologias: $('ep-technologies').value.trim(),
            url
        };

        if (!projeto.titulo || !projeto.descricao) {
            alert('Preencha o nome e a descricao.');
            return;
        }

        const novos = editando
            ? projetos.map(p => p.id === editando ? projeto : p)
            : [projeto, ...projetos];

        if (salvar(novos)) {
            dialog.close();
            renderizar();
        }
    });

    renderizar();
})();
