
(() => {
    const form = document.getElementById('form-nova-vaga');
    const section = document.getElementById('section-nova-vaga');

    if (!form || !section) return;

    const grupos = [
        ['vaga-titulo','vaga-nivel','vaga-modalidade','vaga-descricao'],
        ['vaga-requisitos','vaga-tags'],
        ['vaga-beneficios','vaga-salario-min','vaga-cidade',
         'vaga-estado','vaga-latitude','vaga-longitude'],
        ['vaga-prazo']
    ];

    const titulos = [
        'Detalhes',
        'Requisitos',
        'Benef\u00edcios',
        'Revis\u00e3o'
    ];

    const descricoes = [
        'Informe os dados principais da oportunidade.',
        'Defina as habilidades e os requisitos da vaga.',
        'Informe a remunera\u00e7\u00e3o e o local de trabalho.',
        'Confira os dados antes de finalizar.'
    ];

    const campos = grupos.map(ids => ids.map(id =>
        document.getElementById(id)?.closest('.field-group')
    ));

    if (campos.flat().some(c => !c)) return;

    const publicar = document.getElementById('btn-publicar-vaga');
    const cancelar = document.getElementById('btn-cancelar-vaga');
    const feedback = document.getElementById('form-vaga-feedback');

    if (!publicar || !cancelar || !feedback) return;

    const criar = (tag, classe, texto) => {
        const el = document.createElement(tag);
        el.className = classe || '';
        if (texto !== undefined) el.textContent = texto;
        return el;
    };

    const intro = criar(
        'p',
        'ep-wizard-description',
        'Preencha as etapas para disponibilizar sua oportunidade.'
    );

    const steps = criar('div','ep-wizard-steps');

    const marcadores = titulos.map((titulo,i) => {
        const item = criar('div','ep-wizard-step');

        item.append(
            criar('span','ep-wizard-number',i+1),
            criar('span','',titulo)
        );

        steps.append(item);
        return item;
    });

    const paineis = campos.map((lista,i) => {
        const painel = criar('div','ep-wizard-panel');
        const heading = criar('div','ep-wizard-heading');

        heading.append(
            criar('h4','',titulos[i]),
            criar('p','',descricoes[i])
        );

        painel.append(heading);

        lista.forEach(campo => {
            if (campo.querySelector('textarea') ||
                campo.querySelector('#vaga-tags, #vaga-beneficios, #vaga-titulo, #vaga-salario-min')) {
                campo.classList.add('ep-full-field');
            }

            painel.append(campo);
        });

        if (i === 2) {
            const aviso = [...form.querySelectorAll('.field-group')]
                .find(c => !c.querySelector('input,select,textarea') &&
                    c.textContent.includes('Coordenadas opcionais'));

            if (aviso) {
                aviso.classList.add('ep-full-field');
                painel.append(aviso);
            }
        }

        return painel;
    });

    const review = criar('div','ep-wizard-review');
    paineis[3].append(review);

    const actions = criar('div','ep-wizard-actions');

    const voltar = criar('button','btn btn-ghost','Voltar');
    voltar.type = 'button';

    const proximo = criar(
        'button','btn btn-primary','Pr\u00f3ximo \u2192'
    );
    proximo.type = 'button';

    actions.append(cancelar,voltar,proximo,publicar);

    form.replaceChildren(
        intro,steps,...paineis,feedback,actions
    );

    let etapa = 0;

    function atualizarResumo() {
        const itens = [
            ['T\u00edtulo','vaga-titulo'],
            ['N\u00edvel','vaga-nivel'],
            ['Modalidade','vaga-modalidade'],
            ['Descri\u00e7\u00e3o','vaga-descricao'],
            ['Requisitos','vaga-requisitos'],
            ['Habilidades','vaga-tags'],
            ['Benef\u00edcios','vaga-beneficios'],
            ['Bolsa mensal','vaga-salario-min'],
            ['Cidade','vaga-cidade'],
            ['UF','vaga-estado'],
            ['Latitude','vaga-latitude'],
            ['Longitude','vaga-longitude'],
            ['Prazo','vaga-prazo']
        ];

        review.replaceChildren();

        itens.forEach(([rotulo,id]) => {
            const campo = document.getElementById(id);
            let valor = campo?.tagName === 'SELECT'
                ? campo.selectedOptions[0]?.textContent
                : campo?.value;

            if (['vaga-latitude','vaga-longitude'].includes(id) && !valor) {
                return;
            }

            if (id === 'vaga-salario-min' && valor !== '') {
                const numero = Number(valor);

                if (Number.isFinite(numero)) {
                    valor = numero.toLocaleString('pt-BR',{
                        style: 'currency',
                        currency: 'BRL'
                    });
                }
            }

            if (id === 'vaga-prazo' && valor) {
                valor = valor.split('-').reverse().join('/');
            }

            if (id === 'vaga-tags') {
                const habilidades = lerHabilidadesFormulario();

                valor = habilidades.map(h =>
                    h.nome +
                    ' - Peso ' + h.peso +
                    (h.obrigatorio
                        ? ' (Obrigat\u00f3ria)'
                        : ' (Opcional)')
                ).join('\n');
            }

            const row = criar('div','ep-review-row');

            row.append(
                criar('span','',rotulo),
                criar('strong','',valor || 'N\u00e3o informado')
            );

            review.append(row);
        });
    }

    function mostrar(i) {
        etapa = Math.max(0,Math.min(3,i));

        paineis.forEach((painel,n) => {
            painel.hidden = n !== etapa;
        });

        marcadores.forEach((item,n) => {
            item.classList.toggle('active',n === etapa);
            item.classList.toggle('completed',n < etapa);

            if (n === etapa) {
                item.setAttribute('aria-current','step');
            } else {
                item.removeAttribute('aria-current');
            }
        });

        voltar.hidden = etapa === 0;
        proximo.hidden = etapa === 3;
        publicar.hidden = etapa !== 3;

        if (etapa === 3) atualizarResumo();
    }

    function validarEtapa(n) {
        const inputs = paineis[n].querySelectorAll(
            'input,select,textarea'
        );

        for (const campo of inputs) {
            if (!campo.checkValidity() ||
                (campo.required && !campo.value.trim())) {
                mostrar(n);
                campo.focus();
                campo.reportValidity();
                return false;
            }
        }

        return true;
    }

    proximo.addEventListener('click',() => {
        if (validarEtapa(etapa)) mostrar(etapa + 1);
    });

    voltar.addEventListener('click',() => mostrar(etapa - 1));

    form.addEventListener('input',() => {
        if (etapa === 3) atualizarResumo();
    });

    form.addEventListener('submit',evento => {
        if (etapa !== 3) {
            evento.preventDefault();
            evento.stopImmediatePropagation();

            if (validarEtapa(etapa)) mostrar(etapa + 1);
            return;
        }

        for (let i = 0; i < 4; i++) {
            if (!validarEtapa(i)) {
                evento.preventDefault();
                evento.stopImmediatePropagation();
                return;
            }
        }
    },true);

    form.addEventListener('reset',() => mostrar(0));

    const titulo = section.querySelector('.card-header h3');

    if (titulo) {
        new MutationObserver(() => {
            mostrar(0);

            if (section.classList.contains('active')) {
                const header = document.getElementById('page-title');
                if (header) header.textContent = titulo.textContent;
            }
        }).observe(
            titulo,{childList:true,characterData:true,subtree:true}
        );
    }

    mostrar(0);
})();
