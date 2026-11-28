
(() => {
    const abrirGerenciamento = abrirDetalhesCandidato;

    function criar(tag, classe, texto) {
        const el = document.createElement(tag);
        el.className = classe || '';
        if (texto !== undefined) el.textContent = texto;
        return el;
    }

    const modal = criar('div','rp-overlay');
    modal.id = 'rp-perfil-modal';
    modal.hidden = true;
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-label','Perfil profissional');

    document.body.append(modal);

    let focoAnterior = null;

    function fechar() {
        modal.hidden = true;
        focoAnterior?.focus();
    }

    modal.addEventListener('click',e => {
        if (e.target === modal) fechar();
    });

    document.addEventListener('keydown',e => {
        if (modal.hidden) return;
        if (e.key === 'Escape') fechar();

        if (e.key === 'Tab') {
            const itens = [...modal.querySelectorAll(
                'button:not(:disabled),a[href]'
            )].filter(el => el.getClientRects().length);

            if (!itens.length) return;

            const primeiro = itens[0];
            const ultimo = itens[itens.length - 1];

            if (e.shiftKey && document.activeElement === primeiro) {
                e.preventDefault();
                ultimo.focus();
            } else if (!e.shiftKey && document.activeElement === ultimo) {
                e.preventDefault();
                primeiro.focus();
            }
        }
    });

    function abrirPerfil(c, candidaturaId) {
        focoAnterior = document.activeElement;
        modal.replaceChildren();

        const painel = criar('div','rp-panel');
        const header = criar('div','rp-header');

        const fecharBtn = criar('button','rp-close');
        fecharBtn.type = 'button';
        fecharBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
        fecharBtn.setAttribute('aria-label','Fechar perfil');
        fecharBtn.addEventListener('click',fechar);

        header.append(
            criar('strong','','Perfil profissional'),
            fecharBtn
        );

        const scroll = criar('div','rp-scroll');
        const capa = criar('div','rp-cover');

        const resumo = criar('div','rp-summary');
        const nome = String(c.nome || 'Candidato');
        const partes = nome.trim().split(/\s+/);

        const iniciais = (
            (partes[0]?.[0] || '') +
            (partes.length > 1
                ? partes[partes.length - 1][0] : '')
        ).toUpperCase();

        const avatar = criar('div','rp-avatar',iniciais);
        const info = criar('div','rp-info');

        info.append(
            criar('h2','',nome),
            criar('p','',c.area_interesse || 'Perfil profissional'),
            criar('small','',
                [c.cidade,c.uf].filter(Boolean).join(', ')
                || 'Localiza\u00e7\u00e3o n\u00e3o informada'
            )
        );

        const acoes = criar('div','rp-actions');

        const curriculo = criar('button','rp-primary');
        curriculo.type = 'button';
        curriculo.innerHTML =
            '<i class="bi bi-file-earmark-pdf"></i> Baixar curr&iacute;culo';

        curriculo.addEventListener('click',() => {
            baixarCurriculoEmpresa(candidaturaId,curriculo);
        });

        const mensagem = criar('button','rp-secondary');
        mensagem.type = 'button';
        mensagem.innerHTML =
            '<i class="bi bi-chat-dots"></i> Mensagem';

        mensagem.disabled = !window.EasyInternChat;

        mensagem.addEventListener('click',async () => {
            if (!window.EasyInternChat) return;

            fechar();
            await window.EasyInternChat.iniciar(candidaturaId);
        });

        acoes.append(curriculo,mensagem);
        resumo.append(avatar,info,acoes);

        const tabs = criar('div','rp-tabs');
        const conteudo = criar('div','rp-content');

        const paineis = {};

        function bloco(titulo,valor) {
            const el = criar('div','rp-card');
            el.append(
                criar('h3','',titulo),
                criar('p','',valor)
            );
            return el;
        }

        const sobre = criar('div','rp-about');

        const bio = bloco(
            'Sobre mim',
            c.biografia || 'Biografia n\u00e3o informada.'
        );

        const skills = criar('div','rp-card');

        skills.append(criar('h3','','Principais habilidades'));

        const tags = criar('div','rp-skills');

        const habilidades = String(c.habilidades || '')
            .split(',').map(t => t.trim()).filter(Boolean);

        if (habilidades.length) {
            habilidades.forEach(h => {
                tags.append(criar('span','',h));
            });
        } else {
            tags.append(criar('p','','Habilidades n\u00e3o informadas.'));
        }

        skills.append(tags);

        const links = criar('div','rp-card');
        links.append(criar('h3','','Links profissionais'));

        let quantidade = 0;

        [
            ['LinkedIn',c.linkedin_url],
            ['GitHub',c.github_url]
        ].forEach(([rotulo,endereco]) => {
            if (!endereco) return;

            try {
                const url = new URL(endereco);
                if (!['https:','http:'].includes(url.protocol)) return;

                const link = criar('a','rp-link',rotulo);
                link.href = url.href;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                links.append(link);
                quantidade++;
            } catch (_) {}
        });

        if (!quantidade) {
            links.append(criar('p','','N\u00e3o informados.'));
        }

        sobre.append(bio,skills,links);

        paineis.sobre = sobre;

        paineis.formacao = bloco(
            'Forma\u00e7\u00e3o acad\u00eamica',
            c.formacoes || 'Forma\u00e7\u00e3o n\u00e3o informada.'
        );

        const match = c.match || {};
        const ia = criar('div','rp-ia');

        const nota = criar('div','rp-match');

        nota.append(
            criar('span','','Compatibilidade profissional'),
            criar('strong','',scoreTexto(match))
        );

        ia.append(nota);

        if (scoreValido(match)) {
            [
                ['Pontos fortes',match.pontos_fortes],
                ['Pontos de aten\u00e7\u00e3o',match.pontos_atencao],
                ['Parecer da IA',match.veredicto]
            ].forEach(([titulo,valor]) => {
                if (valor) ia.append(bloco(titulo,valor));
            });
        } else {
            ia.append(bloco(
                'Avalia\u00e7\u00e3o',
                'Avalia\u00e7\u00e3o ainda indispon\u00edvel.'
            ));
        }

        ia.append(criar(
            'p','rp-disclaimer',
            'A an\u00e1lise automatizada pode conter imprecis\u00f5es e n\u00e3o substitui a avalia\u00e7\u00e3o humana.'
        ));

        paineis.ia = ia;

        const botoes = [];

        function selecionar(chave) {
            conteudo.replaceChildren(paineis[chave]);

            botoes.forEach(b => {
                const ativo = b.dataset.tab === chave;
                b.classList.toggle('active',ativo);
                b.setAttribute('aria-pressed',String(ativo));
            });
        }

        [
            ['sobre','Sobre'],
            ['formacao','Forma\u00e7\u00e3o'],
            ['ia','Compatibilidade IA']
        ].forEach(([chave,rotulo]) => {
            const botao = criar('button','',rotulo);
            botao.type = 'button';
            botao.dataset.tab = chave;
            botao.addEventListener('click',() => selecionar(chave));
            botoes.push(botao);
            tabs.append(botao);
        });

        scroll.append(capa,resumo,tabs,conteudo);
        painel.append(header,scroll);
        modal.append(painel);

        selecionar('sobre');
        modal.hidden = false;
        fecharBtn.focus();
    }

    abrirDetalhesCandidato = function(candidato,candidaturaId) {
        const ranking = document.getElementById('section-candidatos');

        if (ranking?.classList.contains('active')) {
            abrirPerfil(candidato,candidaturaId);
            return;
        }

        return abrirGerenciamento(candidato,candidaturaId);
    };
})();
