'use strict';

// ── NumberFlow Fallback (Maxwell Barvian) ──────────────────────────────────────
if (typeof window !== 'undefined' && 'customElements' in window && !customElements.get('number-flow')) {
  class NumberFlowElementFallback extends HTMLElement {
    constructor() {
      super();
      this._value = 0;
      this.format = { maximumFractionDigits: 0 };
      this.animated = true;
      this.numberSuffix = '';
      this.trend = 0;
    }
    connectedCallback() {
      const text = this.textContent.trim();
      if (text && text !== '—') {
        const parsed = parseFloat(text.replace(/[^\d.-]/g, ''));
        if (!isNaN(parsed)) this._value = parsed;
      }
    }
    update(val) {
      const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^\d.-]/g, '')) || 0;
      if (!this.animated) {
        this._value = num;
        this.render();
        return;
      }
      const start = this._value;
      const end = num;
      this._value = end;
      const duration = 600;
      const startTime = performance.now();
      const step = (now) => {
        const progress = Math.min(1, (now - startTime) / duration);
        const ease = 1 - Math.pow(1 - progress, 3);
        const current = start + (end - start) * ease;
        this.render(current);
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          this.render(end);
        }
      };
      requestAnimationFrame(step);
    }
    render(val = this._value) {
      let formatted = '';
      if (this.format?.style === 'percent') {
        formatted = `${Math.round(val * 100)}%`;
      } else if (this.format?.style === 'currency') {
        formatted = `$${Math.round(val)}`;
      } else {
        formatted = Math.round(val).toLocaleString('pt-BR');
      }
      this.textContent = formatted + (this.numberSuffix || '');
    }
  }
  customElements.define('number-flow', NumberFlowElementFallback);
}

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
    const buttons = document.querySelectorAll('#btn-theme-toggle, .theme-toggle, #header-theme-toggle');
    buttons.forEach(button => {
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('aria-label', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
      button.title = dark ? 'Ativar modo claro' : 'Ativar modo escuro';
      const label = button.querySelector('span');
      const icon = button.querySelector('i');
      if (label) label.textContent = dark ? 'Ativar modo claro' : 'Ativar modo escuro';
      if (icon) icon.className = dark ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
      button.querySelector('.theme-icon--sun')?.toggleAttribute('hidden', !dark);
      button.querySelector('.theme-icon--moon')?.toggleAttribute('hidden', dark);
    });
  }

  const themeStorageKey = 'easyintern-dashboard-theme';
  try {
    applyTheme(localStorage.getItem(themeStorageKey) || 'light');
  } catch {
    applyTheme('light');
  }

  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    // Alternar tema em qualquer botão de toggle
    const toggleBtn = target.closest('#btn-theme-toggle, .theme-toggle, #header-theme-toggle');
    if (toggleBtn) {
      const theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(theme);
      try {
        localStorage.setItem(themeStorageKey, theme);
      } catch {
        return;
      }
      return;
    }

    // Menu drawer da apresentação (preview.html)
    if (target.closest('#btn-preview-menu')) {
      const drawer = document.getElementById('preview-drawer');
      const overlay = document.getElementById('preview-menu-overlay');
      const btn = document.getElementById('btn-preview-menu');
      const isOpen = !drawer?.classList.contains('is-open');
      drawer?.classList.toggle('is-open', isOpen);
      overlay?.classList.toggle('is-open', isOpen);
      btn?.setAttribute('aria-expanded', String(isOpen));
      return;
    }

    if (target.closest('#preview-menu-close, #preview-menu-overlay, .preview-drawer-link')) {
      document.getElementById('preview-drawer')?.classList.remove('is-open');
      document.getElementById('preview-menu-overlay')?.classList.remove('is-open');
      document.getElementById('btn-preview-menu')?.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      document.getElementById('preview-drawer')?.classList.remove('is-open');
      document.getElementById('preview-menu-overlay')?.classList.remove('is-open');
      document.getElementById('btn-preview-menu')?.setAttribute('aria-expanded', 'false');
    }
  });

  function showSection(name) {
    document.querySelectorAll('.dash-section').forEach(section => {
      section.classList.toggle('active', section.id === `section-${name}`);
    });
    document.querySelectorAll('.nav-item[data-section]').forEach(item => {
      item.classList.toggle('active', item.dataset.section === name);
    });
    const titles = {
      overview: 'Visão Geral',
      candidaturas: 'Minhas Candidaturas',
      recomendadas: 'Vagas Recomendadas',
      perfil: document.body.dataset.panel === 'empresa' ? 'Perfil da Empresa' : 'Meu Perfil',
      vagas: 'Vagas Publicadas',
      candidatos: 'Candidatos — Ranking IA',
      'nova-vaga': 'Publicar Nova Vaga',
      configuracoes: 'Configurações',
    };
    const title = document.getElementById('page-title');
    const active = document.querySelector(`.nav-item[data-section="${name}"] span`);
    if (title) title.textContent = titles[name] || active?.textContent.trim() || name;
    document.getElementById('dash-sidebar')?.classList.remove('is-open');
    document.getElementById('sidebar-overlay')?.classList.remove('is-open');
    document.body.classList.remove('sidebar-open');
    const menuToggle = document.getElementById('btn-menu-toggle');
    menuToggle?.setAttribute('aria-expanded', 'false');
    const label = menuToggle?.querySelector('span');
    if (label) label.textContent = 'Menu';
    const icon = menuToggle?.querySelector('i');
    if (icon) icon.className = 'bi bi-list';
  }

  function updateNumberFlow(elOrId, val, options = {}) {
    const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (!el) return;
    const flow = el.tagName && el.tagName.toLowerCase() === 'number-flow' ? el : el.querySelector?.('number-flow');
    const target = flow || el;
    const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^\d.-]/g, '')) || 0;
    if (target && typeof target.update === 'function') {
      if (options.format) target.format = options.format;
      if (options.numberSuffix !== undefined) target.numberSuffix = options.numberSuffix;
      if (options.trend !== undefined) target.trend = options.trend;
      if (options.animated !== undefined) target.animated = options.animated;
      target.update(num);
    } else if (target) {
      target.textContent = `${num}${options.numberSuffix || ''}`;
    }
  }

  function setText(id, text) {
    const element = document.getElementById(id);
    if (!element) return;
    const flow = element.tagName && element.tagName.toLowerCase() === 'number-flow' ? element : element.querySelector?.('number-flow');
    if (flow && typeof flow.update === 'function') {
      const rawStr = String(text);
      const hasPercent = rawStr.includes('%');
      const num = typeof text === 'number' ? text : parseFloat(rawStr.replace(/[^\d.-]/g, ''));
      if (!isNaN(num)) {
        if (hasPercent) flow.numberSuffix = '%';
        flow.update(num);
        return;
      }
    }
    element.textContent = text;
  }

  function getProfileStorageKey(prefix) {
    let userKey = 'default';
    try {
      const user = JSON.parse(localStorage.getItem('easyintern_user') || localStorage.getItem('ag_user'));
      if (user && user.email) {
        userKey = user.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
      }
    } catch {}
    if (userKey === 'default') {
      const panel = document.body.dataset.panel || 'candidato';
      userKey = panel;
    }
    return `${prefix}_${userKey}`;
  }

  function getDynamicStats() {
    try {
      return JSON.parse(localStorage.getItem(getProfileStorageKey('easyintern_dyn_stats'))) || {};
    } catch {
      return {};
    }
  }

  function saveDynamicStats(stats) {
    try {
      localStorage.setItem(getProfileStorageKey('easyintern_dyn_stats'), JSON.stringify(stats));
    } catch {}
  }

  function incrementCandidateDynamicStats() {
    const current = getDynamicStats();
    const cand = (current.total_candidaturas !== undefined ? current.total_candidaturas : 4) + 1;
    const anal = (current.em_analise !== undefined ? current.em_analise : 2) + 1;
    current.total_candidaturas = cand;
    current.em_analise = anal;
    saveDynamicStats(current);

    updateNumberFlow('stat-total-c', cand);
    updateNumberFlow('stat-analise-v', anal);
    setText('badge-candidaturas', cand);
    toast('📈 Indicadores atualizados automaticamente via NumberFlow!', 'success');
  }

  function incrementEmpresaDynamicStats(type) {
    const current = getDynamicStats();
    let totVagas = current.total_vagas !== undefined ? current.total_vagas : 5;
    let vagAbertas = current.vagas_abertas !== undefined ? current.vagas_abertas : 3;

    if (type === 'nova_vaga') {
      totVagas += 1;
      vagAbertas += 1;
    } else if (type === 'fechar_vaga') {
      vagAbertas = Math.max(0, vagAbertas - 1);
    }

    current.total_vagas = totVagas;
    current.vagas_abertas = vagAbertas;
    saveDynamicStats(current);

    updateNumberFlow('stat-total-vagas', totVagas);
    updateNumberFlow('stat-vagas-abertas', vagAbertas);
    setText('badge-vagas', totVagas);
    toast('📈 Indicadores atualizados automaticamente via NumberFlow!', 'info');
  }

  function renderCandidateDemo() {
    const dyn = getDynamicStats();
    const cand = dyn.total_candidaturas !== undefined ? dyn.total_candidaturas : 4;
    const anal = dyn.em_analise !== undefined ? dyn.em_analise : 2;

    setText('dash-greeting', 'Olá, Lucas Silva 👋');
    setText('stat-total-c', cand);
    setText('stat-aprovadas-v', '1');
    setText('stat-analise-v', anal);
    setText('stat-taxa-match', '86%');
    setText('donut-score', '86%');
    setText('flow-donut-score', '86%');
    setText('match-tip', 'Seu perfil tem ótima compatibilidade com vagas de tecnologia.');
    setText('perfil-nome', 'Lucas Silva');
    setText('perfil-area', 'Desenvolvimento de Sistemas, Python e APIs');
    setText('perfil-nivel-tag', 'Estagiário');
    setText('badge-candidaturas', cand);
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
    const dyn = getDynamicStats();
    const totVagas = dyn.total_vagas !== undefined ? dyn.total_vagas : 5;
    const vagAbertas = dyn.vagas_abertas !== undefined ? dyn.vagas_abertas : 3;

    setText('dash-greeting', 'Olá, TechNova 👋');
    setText('stat-total-vagas', totVagas);
    setText('stat-vagas-abertas', vagAbertas);
    setText('stat-total-candidatos', '24');
    setText('stat-aprovados', '4');
    setText('badge-vagas', totVagas);

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
    setText('empresa-perfil-nome', 'TechNova Soluções');
    setText('empresa-perfil-setor', 'Tecnologia & Inovação');
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
        const sidebar = document.getElementById('dash-sidebar');
        const open = !sidebar?.classList.contains('is-open');
        sidebar?.classList.toggle('is-open', open);
        document.getElementById('sidebar-overlay')?.classList.toggle('is-open', open);
        document.body.classList.toggle('sidebar-open', open);
        const menuToggle = document.getElementById('btn-menu-toggle');
        menuToggle?.setAttribute('aria-expanded', String(open));
        const label = menuToggle?.querySelector('span');
        if (label) label.textContent = open ? 'Fechar' : 'Menu';
        const icon = menuToggle?.querySelector('i');
        if (icon) icon.className = open ? 'bi bi-x-lg' : 'bi bi-list';
      }
      if (target.closest('#user-avatar')) {
        event.preventDefault();
        showSection('perfil');
      }
      if (target.closest('#sidebar-overlay')) {
        document.getElementById('dash-sidebar')?.classList.remove('is-open');
        target.closest('#sidebar-overlay')?.classList.remove('is-open');
        document.body.classList.remove('sidebar-open');
        const menuToggle = document.getElementById('btn-menu-toggle');
        menuToggle?.setAttribute('aria-expanded', 'false');
        const label = menuToggle?.querySelector('span');
        if (label) label.textContent = 'Menu';
        const icon = menuToggle?.querySelector('i');
        if (icon) icon.className = 'bi bi-list';
      }
      if (target.closest('#btn-logout')) {
        try {
          localStorage.removeItem('easyintern_token');
          localStorage.removeItem('easyintern_user');
        } catch {}
        toast('Sessão encerrada com sucesso.', 'info');
        setTimeout(() => { window.location.href = 'preview.html'; }, 500);
      }
      if (target.closest('[data-preview-action="apply"]')) {
        incrementCandidateDynamicStats();
        toast('Candidatura enviada com sucesso! 🚀 Indicadores atualizados via NumberFlow!', 'success');
      }
      if (target.closest('#btn-nova-vaga-header, #btn-nova-vaga-card, #btn-nova-vaga-section')) showSection('nova-vaga');
    });

    document.getElementById('form-nova-vaga')?.addEventListener('submit', event => {
      event.preventDefault();
      const tituloInput = document.getElementById('nv-titulo');
      const titulo = tituloInput?.value || 'Nova Vaga Publicada';
      const grid = document.getElementById('vagas-publicadas-grid');
      if (grid) {
        const newCard = document.createElement('article');
        newCard.className = 'vaga-card';
        newCard.innerHTML = `
          <div class="vaga-card-body">
            <h3>${titulo}</h3>
            <p>TechNova · Publicada agora</p>
            <span class="meta-pill"><i class="bi bi-clock"></i> Recente</span>
          </div>
          <button class="btn btn-primary btn-sm" type="button" data-preview-action="apply">Gerenciar candidatos</button>
        `;
        grid.prepend(newCard);
      }
      incrementEmpresaDynamicStats('nova_vaga');
      toast('Vaga publicada com sucesso no painel!', 'success');
      showSection('vagas');
      event.target.reset();
    });
    document.getElementById('modal-cand-close')?.addEventListener('click', () => {
      const modal = document.getElementById('modal-candidatura');
      if (modal) modal.hidden = true;
    });
    document.getElementById('select-vaga-cands')?.addEventListener('change', () => {
      const ranking = document.getElementById('candidatos-ranking');
      if (ranking) ranking.innerHTML = '<div class="glass-card"><h3>Marina Costa</h3><p>94% de compatibilidade · Python, APIs e SQL</p></div><div class="glass-card"><h3>Lucas Silva</h3><p>88% de compatibilidade · Desenvolvimento web e React</p></div>';
    });

    // ── NumberFlow Stats (Recipe C) ───────────────────────────────────────────
    function initNumberFlowStats() {
      document.querySelectorAll('[data-number-flow-stat]').forEach(root => {
        const flow = root.querySelector('[data-stat-number]') || root.querySelector('number-flow');
        if (!flow) return;
        flow.format = { maximumFractionDigits: 0 };
        flow.trend = 1;
        const raw = flow.textContent.trim();
        const isPercent = raw.includes('%') || flow.id.includes('match') || flow.id.includes('donut');
        if (isPercent) flow.numberSuffix = '%';
        const parsed = parseFloat(raw.replace(/[^\d.-]/g, ''));
        const val = isNaN(parsed) ? 0 : parsed;
        flow.animated = false;
        if (typeof flow.update === 'function') flow.update(val);
        flow.animated = true;
      });
    }

    // ── Motor do Carrossel de Dashboards ─────────────────────────────────────────
    let _previewCarouselTimer = null;

    function setupDashboardCarousel(mode = 'grid', model = 'panoramic', autoPlay = false) {
      const grid = document.getElementById('stats-grid');
      if (!grid) return;

      const existingWrapper = document.querySelector('.stats-carousel-wrapper');

      if (mode === 'grid') {
        if (_previewCarouselTimer) {
          clearInterval(_previewCarouselTimer);
          _previewCarouselTimer = null;
        }
        if (existingWrapper) {
          const cards = existingWrapper.querySelectorAll('.stat-card');
          cards.forEach(card => grid.appendChild(card));
          existingWrapper.remove();
        }
        grid.style.display = 'grid';
        grid.classList.remove('carousel-active');
        return;
      }

      grid.style.display = 'none';
      grid.classList.add('carousel-active');

      let wrapper = existingWrapper;
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'stats-carousel-wrapper';
        wrapper.innerHTML = `
          <div class="stats-carousel-header">
            <span class="stats-carousel-title"><i class="bi bi-collection-play-fill" style="color:#20b479;"></i> Indicadores em Carrossel</span>
            <span class="carousel-mode-badge"><i class="bi bi-arrows-expand"></i> Arraste ou use as setas</span>
          </div>
          <div class="stats-carousel-container" id="dash-carousel-container">
            <div class="stats-carousel-track" id="dash-carousel-track"></div>
          </div>
          <div class="carousel-controls" id="dash-carousel-controls">
            <button type="button" class="carousel-nav-btn prev" id="carousel-btn-prev" aria-label="Slide anterior" title="Slide anterior">
              <i class="bi bi-chevron-left"></i>
            </button>
            <div class="carousel-dots" id="carousel-dots-container"></div>
            <button type="button" class="carousel-nav-btn next" id="carousel-btn-next" aria-label="Próximo slide" title="Próximo slide">
              <i class="bi bi-chevron-right"></i>
            </button>
          </div>
        `;
        grid.parentElement.insertBefore(wrapper, grid);
      }

      const track = wrapper.querySelector('#dash-carousel-track');
      track.className = `stats-carousel-track ${model === 'spotlight' ? 'mode-spotlight' : 'mode-panoramic'}`;

      const allCards = grid.querySelectorAll('.stat-card');
      if (allCards.length) {
        allCards.forEach(card => track.appendChild(card));
      }

      const dotsContainer = wrapper.querySelector('#carousel-dots-container');
      const prevBtn = wrapper.querySelector('#carousel-btn-prev');
      const nextBtn = wrapper.querySelector('#carousel-btn-next');
      const container = wrapper.querySelector('#dash-carousel-container');

      let currentIndex = 0;

      const getVisibleCards = () => {
        return Array.from(track.querySelectorAll('.stat-card')).filter(c => c.style.display !== 'none');
      };

      const getStep = () => {
        if (model === 'spotlight') return 1;
        const w = window.innerWidth;
        if (w < 640) return 1;
        if (w < 1024) return 2;
        return 3;
      };

      const getMaxIndex = () => {
        const total = getVisibleCards().length;
        if (total <= 1) return 0;
        const step = getStep();
        return Math.max(0, total - (model === 'spotlight' ? 1 : step));
      };

      const updateDots = () => {
        dotsContainer.innerHTML = '';
        const max = getMaxIndex();
        for (let i = 0; i <= max; i++) {
          const dot = document.createElement('button');
          dot.className = `carousel-dot ${i === currentIndex ? 'active' : ''}`;
          dot.type = 'button';
          dot.setAttribute('aria-label', `Slide ${i + 1}`);
          dot.addEventListener('click', () => goToSlide(i));
          dotsContainer.appendChild(dot);
        }
      };

      const updateButtons = () => {
        prevBtn.disabled = currentIndex <= 0;
        nextBtn.disabled = currentIndex >= getMaxIndex();
      };

      const goToSlide = (idx) => {
        const max = getMaxIndex();
        currentIndex = Math.max(0, Math.min(idx, max));
        const visible = getVisibleCards();
        if (visible[currentIndex]) {
          const offset = visible[currentIndex].offsetLeft;
          track.style.transform = `translateX(-${offset}px)`;
        } else {
          track.style.transform = `translateX(-${currentIndex * 100}%)`;
        }
        updateDots();
        updateButtons();
      };

      prevBtn.onclick = () => goToSlide(currentIndex - 1);
      nextBtn.onclick = () => goToSlide(currentIndex + 1);

      let startX = 0;
      let isDown = false;

      container.onpointerdown = (e) => {
        if (e.target.closest('button, a, input, select')) return;
        isDown = true;
        startX = e.clientX;
        track.style.transition = 'none';
      };

      window.addEventListener('pointermove', (e) => {
        if (!isDown) return;
        const diff = e.clientX - startX;
        const visible = getVisibleCards();
        const baseOffset = visible[currentIndex] ? visible[currentIndex].offsetLeft : 0;
        track.style.transform = `translateX(-${baseOffset - diff}px)`;
      });

      window.addEventListener('pointerup', (e) => {
        if (!isDown) return;
        isDown = false;
        track.style.transition = 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)';
        const diff = e.clientX - startX;
        if (diff < -40) {
          goToSlide(currentIndex + 1);
        } else if (diff > 40) {
          goToSlide(currentIndex - 1);
        } else {
          goToSlide(currentIndex);
        }
      });

      if (_previewCarouselTimer) {
        clearInterval(_previewCarouselTimer);
        _previewCarouselTimer = null;
      }

      if (autoPlay) {
        _previewCarouselTimer = setInterval(() => {
          const next = currentIndex >= getMaxIndex() ? 0 : currentIndex + 1;
          goToSlide(next);
        }, 4000);

        wrapper.onmouseenter = () => {
          if (_previewCarouselTimer) clearInterval(_previewCarouselTimer);
        };
        wrapper.onmouseleave = () => {
          if (_previewCarouselTimer) clearInterval(_previewCarouselTimer);
          _previewCarouselTimer = setInterval(() => {
            const next = currentIndex >= getMaxIndex() ? 0 : currentIndex + 1;
            goToSlide(next);
          }, 4000);
        };
      }

      goToSlide(0);
    }

    // ── Drag & Drop ──────────────────────────────────────────────────────────
    function initDashboardDragAndDrop() {
      const storageKey = getProfileStorageKey('easyintern_order');

      try {
        const savedOrder = JSON.parse(localStorage.getItem(storageKey));
        if (savedOrder && typeof savedOrder === 'object') {
          Object.entries(savedOrder).forEach(([containerId, itemIds]) => {
            const container = document.getElementById(containerId);
            if (!container || !Array.isArray(itemIds)) return;
            itemIds.forEach(id => {
              const item = container.querySelector(`[data-widget-id="${id}"]`) || document.getElementById(id);
              if (item && item.parentElement === container) {
                container.appendChild(item);
              }
            });
          });
        }
      } catch {}

      const draggables = document.querySelectorAll('.draggable-card');
      let draggedEl = null;

      draggables.forEach(card => {
        card.setAttribute('draggable', 'true');

        card.addEventListener('dragstart', (e) => {
          const targetTag = e.target.tagName ? e.target.tagName.toLowerCase() : '';
          if (['input', 'button', 'select', 'textarea', 'a'].includes(targetTag)) {
            e.preventDefault();
            return;
          }
          draggedEl = card;
          card.classList.add('is-dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', card.dataset.widgetId || card.id);
        });

        card.addEventListener('dragend', () => {
          card.classList.remove('is-dragging');
          draggedEl = null;
          document.querySelectorAll('.draggable-card').forEach(c => c.classList.remove('drag-over'));
          saveCurrentOrder();
        });

        card.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (!draggedEl || draggedEl === card) return;
          if (draggedEl.parentElement !== card.parentElement) return;
          e.dataTransfer.dropEffect = 'move';
          card.classList.add('drag-over');
        });

        card.addEventListener('dragleave', () => {
          card.classList.remove('drag-over');
        });

        card.addEventListener('drop', (e) => {
          e.preventDefault();
          card.classList.remove('drag-over');
          if (!draggedEl || draggedEl === card) return;
          if (draggedEl.parentElement !== card.parentElement) return;

          const container = card.parentElement;
          const bounding = card.getBoundingClientRect();
          const offset = e.clientY - bounding.top;
          const isAfter = offset > bounding.height / 2;

          if (isAfter) {
            container.insertBefore(draggedEl, card.nextSibling);
          } else {
            container.insertBefore(draggedEl, card);
          }
          saveCurrentOrder();
          toast('Posição atualizada com sucesso!', 'info');
        });
      });

      function saveCurrentOrder() {
        const orderData = {};
        const containers = [
          document.getElementById('stats-grid'),
          document.getElementById('candidato-main-grid'),
          document.getElementById('section-overview')
        ].filter(Boolean);

        containers.forEach(cont => {
          if (!cont.id) return;
          const items = cont.querySelectorAll(':scope > .draggable-card');
          if (items.length) {
            orderData[cont.id] = Array.from(items).map(item => item.dataset.widgetId || item.id);
          }
        });
        try {
          localStorage.setItem(storageKey, JSON.stringify(orderData));
        } catch {}
      }
    }

    // ── Editar Dashboards ────────────────────────────────────────────────────
    function initEditDashboardsPanel() {
      const visKey = getProfileStorageKey('easyintern_visibility');
      const modeKey = getProfileStorageKey('easyintern_dash_mode');
      const modelKey = getProfileStorageKey('easyintern_carousel_model');
      const autoplayKey = getProfileStorageKey('easyintern_carousel_autoplay');

      let visibilityMap = {};
      try {
        visibilityMap = JSON.parse(localStorage.getItem(visKey)) || {};
      } catch {}

      const toggles = document.querySelectorAll('.edit-dash-switch input[data-target-widget]');
      toggles.forEach(toggle => {
        const targetId = toggle.dataset.targetWidget;
        const targetEl = document.querySelector(`[data-widget-id="${targetId}"]`) || document.getElementById(targetId);

        if (visibilityMap[targetId] !== undefined) {
          toggle.checked = visibilityMap[targetId];
          if (targetEl) targetEl.style.display = toggle.checked ? '' : 'none';
        }

        toggle.addEventListener('change', () => {
          visibilityMap[targetId] = toggle.checked;
          if (targetEl) targetEl.style.display = toggle.checked ? '' : 'none';
          try {
            localStorage.setItem(visKey, JSON.stringify(visibilityMap));
          } catch {}

          const curMode = localStorage.getItem(modeKey) || 'grid';
          if (curMode === 'carousel') {
            const curModel = localStorage.getItem(modelKey) || 'panoramic';
            const curAutoplay = localStorage.getItem(autoplayKey) === 'true';
            setupDashboardCarousel('carousel', curModel, curAutoplay);
          }
          toast(toggle.checked ? 'Componente exibido no dashboard.' : 'Componente ocultado do dashboard.', 'info');
        });
      });

      const savedMode = localStorage.getItem(modeKey) || 'grid';
      const savedModel = localStorage.getItem(modelKey) || 'panoramic';
      const savedAutoplay = localStorage.getItem(autoplayKey) === 'true';

      const modeCards = document.querySelectorAll('.edit-dash-mode-card[data-mode]');
      const suboptions = document.getElementById('carousel-suboptions');
      const autoplayToggle = document.getElementById('toggle-carousel-autoplay');

      if (autoplayToggle) autoplayToggle.checked = savedAutoplay;

      const applyModeSelection = (mode) => {
        modeCards.forEach(card => {
          const isCardActive = card.dataset.mode === mode;
          card.classList.toggle('active', isCardActive);
          const icon = card.querySelector('.mode-check');
          if (icon) {
            icon.className = isCardActive ? 'bi bi-check-circle-fill mode-check' : 'bi bi-circle mode-check';
            icon.style.color = isCardActive ? '#20b479' : 'var(--text-muted)';
          }
        });
        if (suboptions) {
          suboptions.style.display = mode === 'carousel' ? 'flex' : 'none';
        }
      };

      applyModeSelection(savedMode);

      modeCards.forEach(card => {
        card.addEventListener('click', () => {
          const selectedMode = card.dataset.mode;
          applyModeSelection(selectedMode);
          try {
            localStorage.setItem(modeKey, selectedMode);
          } catch {}
          const curModel = localStorage.getItem(modelKey) || 'panoramic';
          const isAutoplay = localStorage.getItem(autoplayKey) === 'true';
          setupDashboardCarousel(selectedMode, curModel, isAutoplay);
          toast(selectedMode === 'carousel' ? '🎠 Modo Carrossel ativado no seu perfil!' : '📐 Modo Grade Modular ativado no seu perfil!', 'success');
        });
      });

      const modelChips = document.querySelectorAll('.carousel-chip[data-carousel-model]');
      modelChips.forEach(chip => {
        chip.classList.toggle('active', chip.dataset.carouselModel === savedModel);
        chip.addEventListener('click', () => {
          modelChips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          const chosenModel = chip.dataset.carouselModel;
          try {
            localStorage.setItem(modelKey, chosenModel);
          } catch {}
          const isAutoplay = localStorage.getItem(autoplayKey) === 'true';
          setupDashboardCarousel('carousel', chosenModel, isAutoplay);
          toast(`Modelo ${chosenModel === 'spotlight' ? 'Destaque' : 'Panorâmico'} aplicado ao Carrossel!`, 'info');
        });
      });

      if (autoplayToggle) {
        autoplayToggle.addEventListener('change', () => {
          try {
            localStorage.setItem(autoplayKey, String(autoplayToggle.checked));
          } catch {}
          const curModel = localStorage.getItem(modelKey) || 'panoramic';
          setupDashboardCarousel('carousel', curModel, autoplayToggle.checked);
          toast(autoplayToggle.checked ? 'Transição automática do carrossel ativada.' : 'Transição automática desativada.', 'info');
        });
      }

      setupDashboardCarousel(savedMode, savedModel, savedAutoplay);

      const resetBtn = document.getElementById('btn-reset-dash-order');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          const orderKey = getProfileStorageKey('easyintern_order');
          try {
            localStorage.removeItem(orderKey);
            localStorage.removeItem(modeKey);
            localStorage.removeItem(modelKey);
            localStorage.removeItem(autoplayKey);
            localStorage.removeItem(visKey);
            localStorage.removeItem(getProfileStorageKey('easyintern_dyn_stats'));
          } catch {}
          toast('Configurações de layout do perfil restauradas! 🔄', 'success');
          setTimeout(() => window.location.reload(), 450);
        });
      }
    }

    initNumberFlowStats();
    initDashboardDragAndDrop();
    initEditDashboardsPanel();

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
    const formId = form.id;
    if (formId === 'form-login') {
      const email = document.getElementById('login-email')?.value || '';
      const isEmpresa = email.toLowerCase().includes('empresa') || email.toLowerCase().includes('recrutador') || email.toLowerCase().includes('tech');
      const user = {
        nome: isEmpresa ? 'TechNova Soluções' : 'Lucas Silva',
        email: email || (isEmpresa ? 'empresa@techcorp.com' : 'candidato@easyintern.com'),
        tipo: isEmpresa ? 'empresa' : 'candidato'
      };
      try {
        localStorage.setItem('easyintern_token', 'local-token-' + Date.now());
        localStorage.setItem('easyintern_user', JSON.stringify(user));
      } catch {}
      toast(`Bem-vindo, ${user.nome}! Redirecionando...`, 'success');
      setTimeout(() => {
        window.location.href = isEmpresa ? 'recrutador_painel-preview.html' : 'candidato_dashboard-preview.html';
      }, 400);
    } else if (formId === 'form-candidato') {
      const nome = document.getElementById('c-nome')?.value || 'Lucas Silva';
      const email = document.getElementById('c-email')?.value || 'candidato@easyintern.com';
      const user = { nome, email, tipo: 'candidato' };
      try {
        localStorage.setItem('easyintern_token', 'local-token-' + Date.now());
        localStorage.setItem('easyintern_user', JSON.stringify(user));
      } catch {}
      toast(`Conta de candidato criada com sucesso! Bem-vindo(a), ${nome}!`, 'success');
      setTimeout(() => {
        window.location.href = 'candidato_dashboard-preview.html';
      }, 400);
    } else if (formId === 'form-empresa') {
      const nome = document.getElementById('e-nome')?.value || 'TechNova';
      const email = document.getElementById('e-email')?.value || 'empresa@easyintern.com';
      const user = { nome, email, tipo: 'empresa' };
      try {
        localStorage.setItem('easyintern_token', 'local-token-' + Date.now());
        localStorage.setItem('easyintern_user', JSON.stringify(user));
      } catch {}
      toast(`Empresa cadastrada com sucesso! Bem-vinda, ${nome}!`, 'success');
      setTimeout(() => {
        window.location.href = 'recrutador_painel-preview.html';
      }, 400);
    } else {
      toast('Operação realizada com sucesso!', 'success');
    }
  }));

  document.querySelectorAll('[data-demo-email]').forEach(button => {
    button.addEventListener('click', () => {
      const email = button.dataset.demoEmail || '';
      const isCandidate = button.classList.contains('demo-access-btn--candidate') || email.includes('candidato');
      const user = {
        nome: isCandidate ? 'Lucas Silva' : 'TechNova',
        email: email,
        tipo: isCandidate ? 'candidato' : 'empresa'
      };
      try {
        localStorage.setItem('easyintern_token', 'local-token-' + Date.now());
        localStorage.setItem('easyintern_user', JSON.stringify(user));
      } catch {}
      toast(`Acesso liberado! Entrando como ${user.nome}...`, 'success');
      setTimeout(() => {
        window.location.href = isCandidate ? 'candidato_dashboard-preview.html' : 'recrutador_painel-preview.html';
      }, 350);
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
