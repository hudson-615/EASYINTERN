
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
