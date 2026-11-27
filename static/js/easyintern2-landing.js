(() => {
  const root = document.documentElement;
  const button = document.getElementById('landing-theme');
  const key = 'easyintern_auth_theme';

  function aplicarTema(tema) {
    root.dataset.theme = tema;

    if (!button) return;

    button.querySelector('i').className =
      tema === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';

    button.setAttribute(
      'aria-label',
      tema === 'dark'
        ? 'Ativar tema claro'
        : 'Ativar tema escuro'
    );
  }

  let tema = 'dark';

  try {
    const salvo = localStorage.getItem(key);

    if (salvo === 'light' || salvo === 'dark') {
      tema = salvo;
    }
  } catch {}

  aplicarTema(tema);

  button?.addEventListener('click', () => {
    const novo =
      root.dataset.theme === 'dark' ? 'light' : 'dark';

    aplicarTema(novo);

    try {
      localStorage.setItem(key, novo);
    } catch {}
  });
})();
