'use strict';

(() => {
  const toastContainer = document.getElementById('toast-container')
    || document.getElementById('ag-toast-container');

  function toast(message, type = 'info') {
    if (!toastContainer) return;
    const item = document.createElement('div');
    item.className = toastContainer.id === 'ag-toast-container'
      ? `ag-toast ag-toast--${type}`
      : `toast ${type}`;
    item.setAttribute('role', 'status');
    item.textContent = message;
    toastContainer.appendChild(item);
    window.setTimeout(() => item.remove(), 3200);
  }

  function applyTheme(theme) {
    const dark = theme === 'dark';
    if (dark) {
      document.body.dataset.theme = 'dark';
    } else {
      delete document.body.dataset.theme;
    }
    const button = document.getElementById('btn-theme-toggle');
    if (!button) return;
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
    button.title = dark ? 'Ativar modo claro' : 'Ativar modo escuro';
    const label = button.querySelector('span');
    const icon = button.querySelector('i');
    if (label) label.textContent = dark ? 'Ativar modo claro' : 'Ativar modo escuro';
    if (icon) icon.className = dark ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
    button.querySelector('.theme-icon--sun')?.toggleAttribute('hidden', !dark);
    button.querySelector('.theme-icon--moon')?.toggleAttribute('hidden', dark);
  }

  const themeStorageKey = 'easyintern-dashboard-theme';
  try {
    applyTheme(localStorage.getItem(themeStorageKey) || 'light');
  } catch {
    applyTheme('light');
  }

  document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
    const theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme);
    try {
      localStorage.setItem(themeStorageKey, theme);
    } catch {
      return;
    }
  });

  function showSection(name) {
    document.querySelectorAll('.dash-section').forEach(section => {
      section.classList.toggle('active', section.id === `section-${name}`);
    });
    document.querySelectorAll('.nav-item[data-section]').forEach(item => {
      item.classList.toggle('active', item.dataset.section === name);
    });
    const title = document.getElementById('page-title');
    const active = document.querySelector(`.nav-item[data-section="${name}"] span`);
    if (title && active) title.textContent = active.textContent.trim();
    document.getElementById('dash-sidebar')?.classList.remove('is-open');
    document.getElementById('sidebar-overlay')?.classList.remove('is-open');
    document.getElementById('btn-menu-toggle')?.setAttribute('aria-expanded', 'false');
  }

  function setText(id, text) {
    const element = document.getElementById(id);
    if (element) element.textContent = text;
  }

  function renderCandidateDemo() {
    setText('dash-greeting', 'Olá, Lucas Silva 👋');
    setText('stat-total-c', '4');
    setText('stat-aprovadas-v', '1');
    setText('stat-analise-v', '2');
    setText('stat-taxa-match', '86%');
    setText('donut-score', '86%');
    setText('match-tip', 'Seu perfil tem ótima compatibilidade com vagas de tecnologia.');
    setText('perfil-nome', 'Lucas Silva');
    setText('perfil-area', 'Desenvolvimento de Sistemas, Python e APIs');
    setText('perfil-nivel-tag', 'Estagiário');
    setText('badge-candidaturas', '4');
    setText('rec-count', '3 vagas');

    const recommendations = [
      ['Estágio em Desenvolvimento Web', 'TechNova · Remoto', '92% compatível'],
      ['Pessoa Estagiária de Dados', 'Dados Abertos · Híbrido', '86% compatível'],
      ['Estágio em QA e Automação', 'Produto Digital · São Paulo', '79% compatível'],
    ];
    const cards = recommendations.map(([title, company, match]) => `
      <article class="vaga-card">
        <div class="vaga-card-body">
          <h3>${title}</h3><p>${company}</p>
          <span class="match-score-big">${match}</span>
        </div>
        <button class="btn btn-primary btn-sm" type="button" data-preview-action="apply">Ver oportunidade</button>
      </article>`).join('');
    ['top-vagas-list', 'vagas-recomendadas-grid'].forEach(id => {
      const target = document.getElementById(id);
      if (target) target.innerHTML = cards;
    });

    const candidaturas = document.getElementById('candidaturas-grid');
    if (candidaturas) candidaturas.innerHTML = `
      <article class="cand-card"><h3>Estágio em Desenvolvimento Web</h3><p>TechNova · Atualizada hoje</p><span class="status-aprovado">Aprovado</span></article>
      <article class="cand-card"><h3>Pessoa Estagiária de Dados</h3><p>Dados Abertos · Atualizada ontem</p><span class="status-em_analise">Em análise</span></article>
      <article class="cand-card"><h3>Estágio em QA e Automação</h3><p>Produto Digital · Há 3 dias</p><span class="status-pendente">Pendente</span></article>`;
    const timeline = document.getElementById('timeline-recente');
    if (timeline) timeline.innerHTML = '<p class="timeline-item">Sua candidatura para <strong>Estágio em Desenvolvimento Web</strong> foi aprovada.</p><p class="timeline-item">A empresa Dados Abertos visualizou seu perfil.</p>';
    const profile = document.getElementById('perfil-info-list');
    if (profile) profile.innerHTML = '<p><i class="bi bi-envelope"></i> lucas.demo@example.com</p><p><i class="bi bi-geo-alt"></i> São Paulo, SP</p>';
  }

  function renderRecruiterDemo() {
    setText('dash-greeting', 'Olá, TechNova 👋');
    setText('stat-total-vagas', '5');
    setText('stat-vagas-abertas', '3');
    setText('stat-total-candidatos', '24');
    setText('stat-aprovados', '4');
    setText('badge-vagas', '3');

    const rows = `
      <table class="dash-table"><thead><tr><th>Vaga</th><th>Status</th><th>Candidatos</th></tr></thead><tbody>
      <tr><td>Estágio em Desenvolvimento Web</td><td><span class="status-aprovado">Aberta</span></td><td>12</td></tr>
      <tr><td>Estágio em QA</td><td><span class="status-em_analise">Aberta</span></td><td>8</td></tr>
      <tr><td>Assistente de Dados</td><td><span class="status-pendente">Aberta</span></td><td>4</td></tr>
      </tbody></table>`;
    const table = document.getElementById('vagas-table-wrap');
    if (table) table.innerHTML = rows;
    const cards = document.getElementById('vagas-empresa-grid');
    if (cards) cards.innerHTML = `
      <article class="vaga-card"><h3>Estágio em Desenvolvimento Web</h3><p>Remoto · 12 candidatos</p><span class="status-aprovado">Aberta</span></article>
      <article class="vaga-card"><h3>Estágio em QA</h3><p>Híbrido · 8 candidatos</p><span class="status-em_analise">Aberta</span></article>
      <article class="vaga-card"><h3>Assistente de Dados</h3><p>São Paulo · 4 candidatos</p><span class="status-pendente">Aberta</span></article>`;
    const select = document.getElementById('select-vaga-cands');
    if (select) select.insertAdjacentHTML('beforeend', '<option value="demo">Estágio em Desenvolvimento Web</option>');
    const ranking = document.getElementById('top-candidatos-overview');
    if (ranking) ranking.innerHTML = '<p><strong>Marina Costa</strong> · 94% de compatibilidade</p><p><strong>Lucas Silva</strong> · 88% de compatibilidade</p>';
  }

  if (document.body.classList.contains('dash-body')) {
    const panel = document.body.dataset.panel;
    panel === 'empresa' ? renderRecruiterDemo() : renderCandidateDemo();

    document.addEventListener('click', event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const nav = target.closest('.nav-item[data-section], [data-section]:not(.dash-section)');
      if (nav?.dataset.section) {
        event.preventDefault();
        showSection(nav.dataset.section);
      }
      if (target.closest('#btn-menu-toggle')) {
        const open = !document.getElementById('dash-sidebar')?.classList.contains('is-open');
        document.getElementById('dash-sidebar')?.classList.toggle('is-open', open);
        document.getElementById('sidebar-overlay')?.classList.toggle('is-open', open);
        document.getElementById('btn-menu-toggle')?.setAttribute('aria-expanded', String(open));
      }
      if (target.closest('#sidebar-overlay')) {
        document.getElementById('dash-sidebar')?.classList.remove('is-open');
        target.closest('#sidebar-overlay')?.classList.remove('is-open');
      }
      if (target.closest('#btn-logout')) toast('Prévia estática: o encerramento de sessão não está conectado.', 'info');
      if (target.closest('[data-preview-action="apply"]')) toast('Prévia estática: candidatura demonstrativa.', 'success');
      if (target.closest('#btn-nova-vaga-header, #btn-nova-vaga-card, #btn-nova-vaga-section')) showSection('nova-vaga');
    });

    document.getElementById('form-nova-vaga')?.addEventListener('submit', event => {
      event.preventDefault();
      toast('Prévia estática: vaga não publicada no servidor.', 'info');
    });
    document.getElementById('modal-cand-close')?.addEventListener('click', () => {
      const modal = document.getElementById('modal-candidatura');
      if (modal) modal.hidden = true;
    });
    document.getElementById('select-vaga-cands')?.addEventListener('change', () => {
      const ranking = document.getElementById('candidatos-ranking');
      if (ranking) ranking.innerHTML = '<div class="glass-card"><h3>Marina Costa</h3><p>94% de compatibilidade · Python, APIs e SQL</p></div><div class="glass-card"><h3>Lucas Silva</h3><p>88% de compatibilidade · Desenvolvimento web e React</p></div>';
    });
    return;
  }

  const tabs = document.querySelectorAll('.auth-tab[data-panel]');
  tabs.forEach(tab => tab.addEventListener('click', () => {
    const selected = tab.dataset.panel;
    tabs.forEach(item => {
      const active = item === tab;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.auth-panel[role="tabpanel"]').forEach(panel => {
      panel.hidden = panel.id !== `panel-${selected}`;
    });
    window.history.replaceState(null, '', `#${selected}`);
  }));

  function selectPanelFromHash() {
    const hash = window.location.hash.slice(1);
    const selected = hash === 'cadastro' ? 'candidato' : hash;
    const tab = [...tabs].find(item => item.dataset.panel === selected);
    if (tab) tab.click();
  }

  selectPanelFromHash();
  window.addEventListener('hashchange', selectPanelFromHash);

  document.querySelectorAll('.auth-form').forEach(form => form.addEventListener('submit', event => {
    event.preventDefault();
    toast('Prévia estática: autenticação e cadastro precisam do servidor EasyIntern.', 'info');
  }));

  document.querySelectorAll('[data-demo-email]').forEach(button => {
    button.addEventListener('click', () => {
      const email = document.getElementById('login-email');
      const password = document.getElementById('login-password');
      if (email) email.value = button.dataset.demoEmail || '';
      if (password) password.value = 'Senha de demonstração';
      toast('Dados demonstrativos preenchidos; o login real requer o servidor.', 'info');
    });
  });

  const areaInput = document.getElementById('c-area');
  const suggestions = document.getElementById('area-suggestions');
  if (areaInput && suggestions) {
    const options = ['Técnico em Desenvolvimento de Sistemas', 'Bacharelado em Ciência da Computação', 'Bacharelado em Administração'];
    areaInput.addEventListener('input', () => {
      const query = areaInput.value.trim().toLocaleLowerCase('pt-BR');
      const matches = options.filter(item => item.toLocaleLowerCase('pt-BR').includes(query));
      if (!query) {
        suggestions.hidden = true;
        areaInput.setAttribute('aria-expanded', 'false');
        return;
      }
      suggestions.innerHTML = matches.length
        ? matches.map(item => `<div class="autocomplete-item" role="option" tabindex="0">${item}</div>`).join('')
        : '<div class="autocomplete-empty">Nenhuma formação encontrada. Você pode continuar digitando.</div>';
      suggestions.hidden = false;
      areaInput.setAttribute('aria-expanded', 'true');
    });
    suggestions.addEventListener('click', event => {
      const option = event.target.closest('.autocomplete-item');
      if (!option) return;
      areaInput.value = option.textContent.trim();
      suggestions.hidden = true;
      areaInput.setAttribute('aria-expanded', 'false');
    });
    document.querySelectorAll('.area-chip[data-value]').forEach(chip => {
      chip.addEventListener('click', () => {
        areaInput.value = chip.dataset.value || '';
        areaInput.dispatchEvent(new Event('input', { bubbles: true }));
        suggestions.hidden = true;
        areaInput.setAttribute('aria-expanded', 'false');
        document.getElementById('btn-clear-area')?.removeAttribute('hidden');
      });
    });
  }

  document.getElementById('btn-clear-area')?.addEventListener('click', () => {
    if (areaInput) areaInput.value = '';
    if (suggestions) suggestions.hidden = true;
    areaInput?.setAttribute('aria-expanded', 'false');
  });
})();
