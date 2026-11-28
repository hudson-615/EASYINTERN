
// EI2-CUSTOM-ALERTS

(() => {
    const alertaOriginal = window.alert.bind(window);

    function notificar(titulo, mensagem) {
        let container = document.getElementById(
            'ei2-toast-container'
        );

        if (!container) {
            container = document.createElement('div');
            container.id = 'ei2-toast-container';
            document.body.append(container);
        }

        const toast = document.createElement('div');
        toast.className = 'ei2-custom-toast';
        toast.setAttribute('role', 'status');

        const icone = document.createElement('div');
        icone.className = 'ei2-toast-icon';
        icone.innerHTML = '<i class="bi bi-info-circle" aria-hidden="true"></i>';

        const conteudo = document.createElement('div');
        conteudo.className = 'ei2-toast-content';

        const nome = document.createElement('strong');
        nome.textContent = titulo;

        const texto = document.createElement('p');
        texto.textContent = mensagem;

        conteudo.append(nome, texto);

        const fechar = document.createElement('button');
        fechar.type = 'button';
        fechar.className = 'ei2-toast-close';
        fechar.setAttribute('aria-label', 'Fechar aviso');
        fechar.innerHTML = '<i class="bi bi-x-lg"></i>';

        const progresso = document.createElement('div');
        progresso.className = 'ei2-toast-progress';
        progresso.setAttribute('aria-hidden', 'true');

        const timer = setTimeout(() => toast.remove(), 6000);

        fechar.onclick = () => {
            clearTimeout(timer);
            toast.remove();
        };

        toast.append(icone, conteudo, fechar, progresso);
        container.append(toast);

        while (container.children.length > 3) {
            container.firstElementChild.remove();
        }
    }

    window.ei2Notificar = notificar;

    window.alert = function(mensagem) {
        const texto = String(mensagem ?? '');

        if (/^candidatura encerrada\.?$/i.test(texto.trim())) {
            notificar(
                'Candidatura encerrada',
                'N\u00e3o \u00e9 poss\u00edvel iniciar uma conversa para esta candidatura.'
            );
            return;
        }

        return alertaOriginal(mensagem);
    };
})();
