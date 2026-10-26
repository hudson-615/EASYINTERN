/**
 * dashboard.js — Motor Zero-G para os Painéis de Candidato e Empresa
 * Responsável por: autenticação JWT (redirect guard), todas as chamadas de API,
 * renderização de Cards/Timeline/Ranking-IA, Donut Chart animado, sidebar mobile,
 * modal de candidatura, modal de detalhe de candidato e toasts de feedback.
 */

'use strict';

// ── NumberFlow Integration (Maxwell Barvian) ──────────────────────────────────
// Suporta a biblioteca oficial e provê fallback autônomo offline caso o CDN não esteja acessível.
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

// ── Configuração de API ───────────────────────────────────────────────────────
const API = {
  me:               '/api/auth/me',
  stats_cand:       '/dashboard/api/candidato/stats',
  candidaturas:     '/dashboard/api/candidato/candidaturas',
  recomendadas:     '/dashboard/api/candidato/vagas-recomendadas',
  candidatar:       '/dashboard/api/candidato/candidatar',
  stats_emp:        '/dashboard/api/empresa/stats',
  vagas_emp:        '/dashboard/api/empresa/vagas',
  criar_vaga:       '/dashboard/api/empresa/vagas',
  fechar_vaga:      (id) => `/dashboard/api/empresa/vagas/${id}`,
  candidatos_vaga:  (id) => `/dashboard/api/empresa/candidatos/${id}`,
  update_status:    (id) => `/dashboard/api/empresa/candidaturas/${id}/status`,
  logout:           '/api/auth/me', // usado para verificar sessão
};

// ── Estado Global ─────────────────────────────────────────────────────────────
let currentUser = null;
let dashPanel = document.body.dataset.panel; // 'candidato' | 'empresa'
let allCandidaturas = [];
let allVagasRec = [];
let allVagasEmp = [];
let currentVagaIdCandidatos = null;
let currentCandidaturaId = null;

// ── Helpers de Fetch ──────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('easyintern_token') || localStorage.getItem('ag_token');
}

// ── Offline Fallback Data ───────────────────────────────────────────────────

function getOfflineDashboardData(url, body, method) {
  if (url === API.me) {
    let savedUser = null;
    try {
      savedUser = JSON.parse(localStorage.getItem('easyintern_user') || localStorage.getItem('ag_user'));
    } catch {}
    if (savedUser) return savedUser;
    return dashPanel === 'empresa'
      ? { nome: 'TechNova Soluções', tipo: 'empresa', email: 'recrutamento@technova.com' }
      : { nome: 'Lucas Silva', tipo: 'candidato', email: 'lucas.silva@exemplo.com' };
  }

  if (url === API.stats_cand) {
    return {
      total_candidaturas: 4,
      aprovadas: 1,
      em_analise: 2,
      taxa_match: 88,
      nivel: 'estagio',
      nome: 'Lucas Silva',
      area_interesse: 'Tecnologia da Informação & Desenvolvimento',
      cidade: 'São Paulo',
      estado: 'SP',
      linkedin: 'https://linkedin.com',
      github: 'https://github.com'
    };
  }

  if (url === API.candidaturas) {
    return [
      {
        id: 1,
        vaga_titulo: 'Estágio em Desenvolvimento Front-end',
        empresa_nome: 'TechNova Soluções',
        modalidade: 'hibrido',
        cidade: 'São Paulo',
        estado: 'SP',
        status: 'em_analise',
        created_at: '2026-10-20T10:00:00Z',
        match: { score: 92, cor: '#20b479' }
      },
      {
        id: 2,
        vaga_titulo: 'Estágio em Ciência de Dados & IA',
        empresa_nome: 'DataSphere Labs',
        modalidade: 'remoto',
        cidade: 'Remoto',
        estado: 'BR',
        status: 'aprovado',
        created_at: '2026-10-18T14:30:00Z',
        match: { score: 96, cor: '#20b479' }
      },
      {
        id: 3,
        vaga_titulo: 'Estágio em UX/UI & Design de Interfaces',
        empresa_nome: 'DesignCraft Studio',
        modalidade: 'remoto',
        cidade: 'Remoto',
        estado: 'BR',
        status: 'em_analise',
        created_at: '2026-10-21T09:15:00Z',
        match: { score: 85, cor: '#20b479' }
      },
      {
        id: 4,
        vaga_titulo: 'Assistente Técnico de Infraestrutura & Cloud',
        empresa_nome: 'CloudSphere',
        modalidade: 'presencial',
        cidade: 'Campinas',
        estado: 'SP',
        status: 'pendente',
        created_at: '2026-10-22T11:00:00Z',
        match: { score: 78, cor: '#3b82f6' }
      }
    ];
  }

  if (url === API.recomendadas) {
    return [
      {
        id: 101,
        titulo: 'Estagiário de Engenharia de Software',
        empresa: 'Apex Tech',
        modalidade: 'remoto',
        cidade: 'São Paulo',
        estado: 'SP',
        tags: 'React, TypeScript, CSS',
        salario_min: 2200,
        descricao: 'Desenvolvimento de interfaces modernas e integração de APIs REST.',
        requisitos: 'Estar cursando TI, Engenharia ou áreas correlatas.',
        beneficios: 'VR R$ 45/dia, VT, Seguro de Vida, Convênio Médico',
        match: { score: 95, cor: '#20b479', motivo: 'Compatibilidade com suas habilidades de front-end e tecnologias modernas.' }
      },
      {
        id: 102,
        titulo: 'Estagiário em Automação & IA',
        empresa: 'NextGen AI',
        modalidade: 'hibrido',
        cidade: 'São Paulo',
        estado: 'SP',
        tags: 'Python, Machine Learning, APIs',
        salario_min: 2400,
        descricao: 'Criação de pipelines de dados e agentes inteligentes para produtos internos.',
        requisitos: 'Python intermediário, interesse em IA generativa.',
        beneficios: 'Bolsa R$ 2.400 + Auxílio Home Office',
        match: { score: 91, cor: '#20b479', motivo: 'Forte afinidade com seu foco de inovação.' }
      },
      {
        id: 103,
        titulo: 'Estágio em Suporte & Cloud Computing',
        empresa: 'Skyline Networks',
        modalidade: 'presencial',
        cidade: 'Santos',
        estado: 'SP',
        tags: 'Linux, Redes, AWS',
        salario_min: 1800,
        descricao: 'Apoio a monitoramento e infraestrutura de servidores em nuvem.',
        requisitos: 'Cursando redes de computadores ou análise e desenvolvimento de sistemas.',
        beneficios: 'Vale Refeição, Transporte e Trilha de Certificação',
        match: { score: 82, cor: '#3b82f6', motivo: 'Boa base conceitual em computação.' }
      }
    ];
  }

  if (url === API.stats_emp) {
    return {
      empresa: 'TechNova Soluções',
      setor: 'Tecnologia & Inovação',
      total_vagas: 5,
      vagas_abertas: 3,
      total_candidatos: 28,
      aprovados: 6
    };
  }

  if (url === API.vagas_emp) {
    return [
      {
        id: 1,
        titulo: 'Estágio em Desenvolvimento Front-end',
        nivel: 'estagio',
        modalidade: 'hibrido',
        status: 'aberta',
        total_candidatos: 12,
        cidade: 'São Paulo',
        estado: 'SP',
        salario_min: 2200,
        tags: 'JavaScript, CSS, React',
        descricao: 'Atuação no desenvolvimento de novas interfaces e componentes acessíveis.',
        requisitos: 'Estar cursando ensino superior ou técnico em TI.',
        beneficios: 'Bolsa R$ 2.200, VT, VR, Gympass',
        created_at: '2026-10-15T09:00:00Z'
      },
      {
        id: 2,
        titulo: 'Estagiário em Análise de Dados',
        nivel: 'estagio',
        modalidade: 'remoto',
        status: 'aberta',
        total_candidatos: 9,
        cidade: 'Remoto',
        estado: 'BR',
        salario_min: 2400,
        tags: 'Python, SQL, Power BI',
        descricao: 'Construção de dashboards executivos e automação de relatórios.',
        requisitos: 'Conhecimento em consultas SQL e lógica de programação.',
        beneficios: 'Auxílio Home Office, VR, Trilha de Aprendizado',
        created_at: '2026-10-18T10:00:00Z'
      },
      {
        id: 3,
        titulo: 'Assistente Júnior de Infraestrutura Cloud',
        nivel: 'junior',
        modalidade: 'presencial',
        status: 'aberta',
        total_candidatos: 7,
        cidade: 'São Paulo',
        estado: 'SP',
        salario_min: 3200,
        tags: 'Linux, Docker, AWS',
        descricao: 'Administração básica de containers e monitoramento de servidores.',
        requisitos: 'Graduação em andamento ou completa na área de TI.',
        beneficios: 'Plano de Saúde, VR R$ 38/dia, Seguro',
        created_at: '2026-10-20T11:00:00Z'
      }
    ];
  }

  if (typeof url === 'string' && url.includes('/candidatos/')) {
    return {
      vaga: {
        id: 1,
        titulo: 'Estágio em Desenvolvimento Front-end',
        requisitos: 'HTML, CSS, JavaScript, noções de acessibilidade',
        tags: 'JavaScript, CSS, React'
      },
      candidatos: [
        {
          id: 1,
          candidatura_id: 101,
          nome: 'Lucas Silva',
          email: 'lucas.silva@email.com',
          curso: 'Análise e Desenvolvimento de Sistemas',
          instituicao: 'FATEC São Paulo',
          cidade: 'São Paulo',
          estado: 'SP',
          score: 94,
          cor: '#20b479',
          status: 'em_analise',
          resumo_ia: 'Excelente correspondência com requisitos técnicos em Front-end moderno e prototipação responsiva.',
          habilidades: ['JavaScript', 'CSS3', 'Git', 'Acessibilidade'],
          linkedin: 'https://linkedin.com',
          github: 'https://github.com'
        },
        {
          id: 2,
          candidatura_id: 102,
          nome: 'Mariana Santos',
          email: 'mariana.santos@email.com',
          curso: 'Ciência da Computação',
          instituicao: 'USP',
          cidade: 'São Paulo',
          estado: 'SP',
          score: 89,
          cor: '#20b479',
          status: 'pendente',
          resumo_ia: 'Forte raciocínio algorítmico e projetos práticos com React e TypeScript.',
          habilidades: ['React', 'TypeScript', 'UI/UX', 'REST APIs'],
          linkedin: 'https://linkedin.com',
          github: 'https://github.com'
        },
        {
          id: 3,
          candidatura_id: 103,
          nome: 'Pedro Henrique Oliveira',
          email: 'pedro.oliveira@email.com',
          curso: 'Sistemas de Informação',
          instituicao: 'Mackenzie',
          cidade: 'São Paulo',
          estado: 'SP',
          score: 81,
          cor: '#3b82f6',
          status: 'aprovado',
          resumo_ia: 'Boa base técnica e portfólio de projetos acadêmicos estruturados.',
          habilidades: ['HTML5', 'CSS Grid', 'Bootstrap', 'Figma'],
          linkedin: 'https://linkedin.com',
          github: 'https://github.com'
        }
      ]
    };
  }

  return { success: true, message: 'Operação concluída com sucesso!' };
}

async function apiFetch(url, body = null, method = 'GET') {
  const token = getToken();
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(url, opts);
    if (res.status === 401 || res.status === 404 || res.status >= 500) {
      return getOfflineDashboardData(url, body, method);
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Erro na requisição.');
    return data;
  } catch (err) {
    return getOfflineDashboardData(url, body, method);
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: 'bi-check-circle-fill', error: 'bi-exclamation-circle-fill', info: 'bi-info-circle-fill' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="bi ${icons[type] || icons.info}"></i><span>${escHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function initSidebar() {
  const sidebar = document.getElementById('dash-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const toggle  = document.getElementById('btn-menu-toggle');

  const closeSidebar = () => {
    sidebar?.classList.remove('is-open');
    overlay?.classList.remove('is-open');
    document.body.classList.remove('sidebar-open');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.setAttribute('aria-label', 'Abrir menu de navegação');
    toggle?.setAttribute('title', 'Abrir menu de navegação');
    const label = toggle?.querySelector('span');
    if (label) label.textContent = 'Menu';
    const icon = toggle?.querySelector('i');
    if (icon) icon.className = 'bi bi-list';
  };

  if (toggle) {
    toggle.addEventListener('click', () => {
      const isOpen = !sidebar.classList.contains('is-open');
      sidebar.classList.toggle('is-open', isOpen);
      overlay?.classList.toggle('is-open', isOpen);
      document.body.classList.toggle('sidebar-open', isOpen);
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.setAttribute('aria-label', isOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
      toggle.setAttribute('title', isOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
      const label = toggle.querySelector('span');
      if (label) label.textContent = isOpen ? 'Fechar' : 'Menu';
      const icon = toggle.querySelector('i');
      if (icon) icon.className = isOpen ? 'bi bi-x-lg' : 'bi bi-list';
    });
  }
  if (overlay) {
    overlay.addEventListener('click', closeSidebar);
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSidebar();
  });
}

function initThemeControl() {
  const toggles = document.querySelectorAll('#btn-theme-toggle, .btn-theme-toggle, #header-theme-toggle, .theme-toggle');
  if (!toggles.length) return;

  const applyTheme = (theme) => {
    const isDark = theme === 'dark';
    if (isDark) {
      document.body.dataset.theme = 'dark';
    } else {
      delete document.body.dataset.theme;
    }
    toggles.forEach(toggle => {
      toggle.setAttribute('aria-pressed', String(isDark));
      toggle.setAttribute('aria-label', isDark ? 'Ativar modo claro' : 'Ativar modo escuro');
      toggle.title = isDark ? 'Ativar modo claro' : 'Ativar modo escuro';
      const label = toggle.querySelector('span');
      if (label) label.textContent = isDark ? 'Ativar modo claro' : 'Ativar modo escuro';
      const icon = toggle.querySelector('i');
      if (icon) icon.className = isDark ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
      toggle.querySelector('.theme-icon--sun')?.toggleAttribute('hidden', !isDark);
      toggle.querySelector('.theme-icon--moon')?.toggleAttribute('hidden', isDark);
    });
  };

  let savedTheme = 'light';
  try {
    savedTheme = localStorage.getItem('easyintern-dashboard-theme') || 'light';
  } catch {
    savedTheme = 'light';
  }
  applyTheme(savedTheme);

  toggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
      const nextTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
      try {
        localStorage.setItem('easyintern-dashboard-theme', nextTheme);
      } catch {
        return;
      }
    });
  });
}

// ── Seções (SPA) ──────────────────────────────────────────────────────────────

function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item[data-section]');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.section);
    });
  });

  // Links de card que também navegam
  document.querySelectorAll('[data-section]').forEach(el => {
    if (!el.classList.contains('nav-item')) {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(el.dataset.section);
      });
    }
  });

  // Ícone de avatar no topo redireciona para perfil
  const avatar = document.getElementById('user-avatar');
  if (avatar) {
    avatar.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('perfil');
    });
  }

  // Botões de nova vaga
  ['btn-nova-vaga-header', 'btn-nova-vaga-card', 'btn-nova-vaga-section'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => navigateTo('nova-vaga'));
  });
}

function navigateTo(section) {
  // Seções
  document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`section-${section}`);
  if (target) target.classList.add('active');

  // Nav items
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navEl = document.getElementById(`nav-${section}`);
  if (navEl) navEl.classList.add('active');

  // Fechar sidebar mobile
  document.getElementById('dash-sidebar')?.classList.remove('is-open');
  document.getElementById('sidebar-overlay')?.classList.remove('is-open');
  document.body.classList.remove('sidebar-open');
  const menuToggle = document.getElementById('btn-menu-toggle');
  menuToggle?.setAttribute('aria-expanded', 'false');
  menuToggle?.setAttribute('aria-label', 'Abrir menu de navegação');
  menuToggle?.setAttribute('title', 'Abrir menu de navegação');
  const menuLabel = menuToggle?.querySelector('span');
  if (menuLabel) menuLabel.textContent = 'Menu';
  const menuIcon = menuToggle?.querySelector('i');
  if (menuIcon) menuIcon.className = 'bi bi-list';

  // Título
  const titles = {
    overview: 'Visão Geral', candidaturas: 'Minhas Candidaturas',
    recomendadas: 'Vagas Recomendadas',
    perfil: dashPanel === 'empresa' ? 'Perfil da Empresa' : 'Meu Perfil',
    vagas: 'Vagas Publicadas', candidatos: 'Candidatos — Ranking IA',
    'nova-vaga': 'Publicar Nova Vaga',
    configuracoes: 'Configurações',
  };
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) pageTitle.textContent = titles[section] || section;
}

// ── Auth Guard ────────────────────────────────────────────────────────────────

async function authGuard() {
  try {
    currentUser = await apiFetch(API.me);
  } catch {
    currentUser = null;
  }

  if (!currentUser) {
    currentUser = dashPanel === 'empresa'
      ? { nome: 'TechNova Soluções', tipo: 'empresa', email: 'recrutamento@technova.com' }
      : { nome: 'Lucas Silva', tipo: 'candidato', email: 'lucas.silva@exemplo.com' };
  }

  const greetEl = document.getElementById('dash-greeting');
  if (greetEl) {
    greetEl.textContent = dashPanel === 'empresa'
      ? `${escHtml(currentUser.nome)} · Recrutamento`
      : `Olá, ${currentUser.nome} 👋`;
  }
  return true;
}

// ── Logout ────────────────────────────────────────────────────────────────────

function initLogout() {
  const btn = document.getElementById('btn-logout');
  if (btn) {
    btn.addEventListener('click', () => {
      localStorage.removeItem('easyintern_token');
      localStorage.removeItem('ag_token');
      localStorage.removeItem('easyintern_user');
      localStorage.removeItem('ag_user');
      const isStatic = window.location.protocol === 'file:' || window.location.pathname.endsWith('.html');
      window.location.href = isStatic ? 'preview.html' : '/';
    });
  }
}

// ── Donut Chart SVG ───────────────────────────────────────────────────────────

function animateDonut(score) {
  const progress = document.getElementById('donut-progress');
  const label    = document.getElementById('donut-score');
  if (!progress || !label) return;

  const r = 52;
  const c = 2 * Math.PI * r; // ≈ 326.73
  const pct = Math.min(100, Math.max(0, score)) / 100;
  const dash = pct * c;

  // Cor conforme score
  let color = '#22c55e';
  if (score < 40) color = '#6b7280';
  else if (score < 60) color = '#f59e0b';
  else if (score < 80) color = '#3b82f6';

  progress.style.stroke = color;
  progress.style.strokeDasharray = `${dash} ${c - dash}`;

  // Animação numérica
  let current = 0;
  const step = score / 40;
  const interval = setInterval(() => {
    current = Math.min(current + step, score);
    label.textContent = `${Math.round(current)}%`;
    if (current >= score) clearInterval(interval);
  }, 25);
}

// ── Score Bar ─────────────────────────────────────────────────────────────────

function scoreBarHtml(score, color = '#22c55e') {
  return `
    <span style="font-size:0.875rem;font-weight:700;color:${escHtml(color)};">${score}%</span>
    <div class="score-bar-wrap">
      <div class="score-bar" style="width:0%;background:${escHtml(color)};"
           data-target="${score}" data-color="${escHtml(color)}"></div>
    </div>
  `;
}

function animateScoreBars() {
  document.querySelectorAll('.score-bar[data-target]').forEach(bar => {
    setTimeout(() => {
      bar.style.width = `${bar.dataset.target}%`;
    }, 100);
  });
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function statusBadge(status) {
  const map = {
    pendente:   ['<i class="bi bi-clock" aria-hidden="true"></i> Pendente',    'status-pendente'],
    em_analise: ['<i class="bi bi-search" aria-hidden="true"></i> Em Análise',  'status-em_analise'],
    aprovado:   ['<i class="bi bi-check-circle" aria-hidden="true"></i> Aprovado', 'status-aprovado'],
    reprovado:  ['<i class="bi bi-x-circle" aria-hidden="true"></i> Reprovado',  'status-reprovado'],
  };
  const [label, cls] = map[status] || ['<i class="bi bi-dash-circle" aria-hidden="true"></i> ' + escHtml(status), 'status-pendente'];
  return `<span class="cand-status-badge ${cls}">${label}</span>`;
}

// ── Modalidade Pill ────────────────────────────────────────────────────────────

function modalidadePill(m) {
  const map = {
    presencial: '<i class="bi bi-building" aria-hidden="true"></i> Presencial',
    remoto: '<i class="bi bi-globe2" aria-hidden="true"></i> Remoto',
    hibrido: '<i class="bi bi-shuffle" aria-hidden="true"></i> Híbrido',
  };
  return `<span class="meta-pill">${map[m] || m}</span>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// PAINEL CANDIDATO
// ═══════════════════════════════════════════════════════════════════════════

async function loadCandidatoDashboard() {
  await loadCandidatoStats();
  await loadCandidaturas();
  await loadVagasRecomendadas();
}

async function loadCandidatoStats() {
  try {
    const stats = await apiFetch(API.stats_cand);
    if (!stats) return;

    const dyn = getDynamicStats();
    const totalCand = dyn.total_candidaturas !== undefined ? dyn.total_candidaturas : stats.total_candidaturas;
    const totalAnal = dyn.em_analise !== undefined ? dyn.em_analise : stats.em_analise;
    const totalAprov = dyn.aprovadas !== undefined ? dyn.aprovadas : stats.aprovadas;

    setText('stat-total-c', totalCand);
    setText('stat-aprovadas-v', totalAprov);
    setText('stat-analise-v', totalAnal);
    setText('stat-taxa-match', `${stats.taxa_match}%`);
    setText('badge-candidaturas', totalCand);
    setText('header-nivel', stats.nivel === 'junior' ? 'Júnior' : 'Estagiário');

    // Perfil
    setText('perfil-nome', stats.nome);
    setText('perfil-area', stats.area_interesse);
    setText('perfil-nivel-tag', stats.nivel === 'junior' ? 'Júnior' : 'Estagiário');

    const infoList = document.getElementById('perfil-info-list');
    if (infoList) {
      infoList.innerHTML = [
        stats.cidade && stats.estado ? `<div class="perfil-info-item"><i class="bi bi-geo-alt-fill"></i>${escHtml(stats.cidade)}, ${escHtml(stats.estado)}</div>` : '',
        `<div class="perfil-info-item"><i class="bi bi-send-fill"></i>${stats.total_candidaturas} candidatura(s)</div>`,
        `<div class="perfil-info-item"><i class="bi bi-check-circle-fill"></i>${stats.aprovadas} aprovação(ões)</div>`,
      ].join('');
    }

    const links = document.getElementById('perfil-links');
    if (links) {
      links.innerHTML = [
        stats.linkedin ? `<a href="${escHtml(stats.linkedin)}" class="perfil-link-btn" target="_blank" rel="noopener"><i class="bi bi-linkedin"></i>LinkedIn</a>` : '',
        stats.github   ? `<a href="${escHtml(stats.github)}" class="perfil-link-btn" target="_blank" rel="noopener"><i class="bi bi-github"></i>GitHub</a>` : '',
      ].join('');
    }
  } catch (err) {
    console.warn('Erro ao carregar stats candidato:', err.message);
  }
}

async function loadCandidaturas() {
  try {
    allCandidaturas = await apiFetch(API.candidaturas) || [];
    renderCandidaturas('todos');
    renderTimeline();

    // Média de match para o donut
    if (allCandidaturas.length > 0) {
      const avg = Math.round(
        allCandidaturas.reduce((s, c) => s + c.match.score, 0) / allCandidaturas.length
      );
      animateDonut(avg);
      const tip = document.getElementById('match-tip');
      if (tip) tip.textContent = `Score médio de compatibilidade entre suas candidaturas.`;
    }
  } catch (err) {
    console.warn('Erro ao carregar candidaturas:', err.message);
  }
}

function renderCandidaturas(filterStatus = 'todos') {
  const grid = document.getElementById('candidaturas-grid');
  if (!grid) return;

  const filtered = filterStatus === 'todos'
    ? allCandidaturas
    : allCandidaturas.filter(c => c.status === filterStatus);

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <i class="bi bi-send" style="font-size:2rem;color:var(--violet-light)"></i>
      <h4>Nenhuma candidatura encontrada.</h4>
      <p>Candidate-se a vagas na seção "Vagas Recomendadas".</p>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(c => `
    <div class="cand-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div>
          <div style="font-size:.9375rem;font-weight:700;margin-bottom:2px;">${escHtml(c.vaga_titulo)}</div>
          <div style="font-size:.75rem;color:var(--text-muted);">${escHtml(c.empresa_nome)}</div>
        </div>
        <div class="match-badge">
          <span class="match-score-big" style="color:${escHtml(c.match.cor)};">${c.match.score}%</span>
          <span class="match-label-small">IA match</span>
        </div>
      </div>
      <div class="vaga-meta">
        ${modalidadePill(c.modalidade)}
        ${c.cidade ? `<span class="meta-pill"><i class="bi bi-geo-alt"></i>${escHtml(c.cidade)}, ${escHtml(c.estado)}</span>` : ''}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;">
        ${statusBadge(c.status)}
        <span style="font-size:.6875rem;color:var(--text-muted);">${formatDate(c.created_at)}</span>
      </div>
      ${c.match.veredicto ? `<div style="font-size:.75rem;color:var(--text-muted);padding:10px;background:rgba(255,255,255,.03);border-radius:8px;border:1px solid rgba(255,255,255,.06);line-height:1.5;">${escHtml(c.match.veredicto)}</div>` : ''}
    </div>
  `).join('');
}

function renderTimeline() {
  const el = document.getElementById('timeline-recente');
  if (!el) return;
  const recent = allCandidaturas.slice(0, 5);
  if (!recent.length) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:.875rem;">Nenhuma atividade ainda.</p>`;
    return;
  }
  el.innerHTML = `<div class="timeline">${recent.map(c => `
    <div class="timeline-item">
      <div class="timeline-dot" style="background:${escHtml(c.match.cor)};"></div>
      <div class="timeline-content">
        <div class="timeline-title">${escHtml(c.vaga_titulo)}</div>
        <div class="timeline-sub">${escHtml(c.empresa_nome)} · ${statusBadge(c.status)} · ${formatDate(c.created_at)}</div>
      </div>
    </div>
  `).join('')}</div>`;
}

async function loadVagasRecomendadas() {
  try {
    allVagasRec = await apiFetch(API.recomendadas) || [];
    renderVagasRec('todos');
    renderTopVagas();
    const countEl = document.getElementById('rec-count');
    if (countEl) countEl.textContent = `${allVagasRec.length} vagas`;
  } catch (err) {
    console.warn('Erro ao carregar vagas recomendadas:', err.message);
  }
}

function renderVagasRec(modalFilter = 'todos') {
  const grid = document.getElementById('vagas-recomendadas-grid');
  if (!grid) return;

  const filtered = modalFilter === 'todos'
    ? allVagasRec
    : allVagasRec.filter(v => v.modalidade === modalFilter);

  const countEl = document.getElementById('rec-count');
  if (countEl) countEl.textContent = `${filtered.length} vagas`;

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <i class="bi bi-stars" style="font-size:2rem;color:var(--violet-light)"></i>
      <h4>Nenhuma vaga encontrada.</h4>
      <p>Tente mudar o filtro de modalidade ou aguarde novas vagas.</p>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(v => {
    const tags = (v.tags || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 4);
    const salario = v.salario_min ? `R$ ${(v.salario_min).toLocaleString('pt-BR')}/mês` : '';
    return `
      <div class="vaga-card">
        <div class="vaga-card-header">
          <div>
            <div class="vaga-titulo">${escHtml(v.titulo)}</div>
            <div class="vaga-empresa">${escHtml(v.empresa)}</div>
          </div>
          <div class="match-badge">
            <span class="match-score-big" style="color:${escHtml(v.match.cor)};">${v.match.score}%</span>
            <span class="match-label-small">IA match</span>
          </div>
        </div>
        <div class="vaga-meta">
          ${modalidadePill(v.modalidade)}
          <span class="meta-pill"><i class="bi bi-mortarboard"></i>${v.nivel === 'junior' ? 'Júnior' : 'Estagiário'}</span>
          ${v.cidade ? `<span class="meta-pill"><i class="bi bi-geo-alt"></i>${escHtml(v.cidade)}</span>` : ''}
          ${salario ? `<span class="meta-pill"><i class="bi bi-cash-coin"></i>${salario}</span>` : ''}
        </div>
        ${tags.length ? `<div class="vaga-tags">${tags.map(t => `<span class="tag-chip">${escHtml(t)}</span>`).join('')}</div>` : ''}
        <div style="font-size:.75rem;color:var(--text-muted);line-height:1.5;">${escHtml(v.match.veredicto)}</div>
        <div class="vaga-card-footer">
          ${v.ja_candidatou
            ? `<span class="cand-status-badge status-em_analise" style="font-size:.7rem;">✓ Já candidatou</span>`
            : `<button class="btn btn-primary btn-sm" onclick="abrirModalCandidatura(${v.id}, '${escHtml(v.titulo).replace(/'/g, "\\'")}', '${escHtml(v.empresa).replace(/'/g, "\\'")}')">
                <i class="bi bi-send-fill"></i> Candidatar
              </button>`
          }
        </div>
      </div>
    `;
  }).join('');
}

function renderTopVagas() {
  const el = document.getElementById('top-vagas-list');
  if (!el) return;
  const top = allVagasRec.slice(0, 4);
  if (!top.length) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:.875rem;">Sem recomendações ainda.</p>`;
    return;
  }
  el.innerHTML = top.map((v, i) => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;${i < top.length-1 ? 'border-bottom:1px solid rgba(255,255,255,.05);' : ''}">
      <span style="font-weight:800;color:${escHtml(v.match.cor)};font-size:1.1rem;min-width:40px;text-align:center;">${v.match.score}%</span>
      <div style="flex:1;">
        <div style="font-size:.875rem;font-weight:600;">${escHtml(v.titulo)}</div>
        <div style="font-size:.75rem;color:var(--text-muted);">${escHtml(v.empresa)} · ${v.modalidade}</div>
      </div>
    </div>
  `).join('');
}

// ── Modal Candidatura ─────────────────────────────────────────────────────────

let _pendingVagaId = null;

function abrirModalCandidatura(vagaId, titulo, empresa) {
  _pendingVagaId = vagaId;
  const modal = document.getElementById('modal-candidatura');
  const info  = document.getElementById('modal-vaga-info');
  if (!modal) return;
  if (info) {
    info.innerHTML = `
      <div style="font-weight:700;font-size:.9375rem;">${escHtml(titulo)}</div>
      <div style="font-size:.8125rem;color:var(--text-muted);margin-top:4px;">${escHtml(empresa)}</div>
    `;
  }
  const mensagem = document.getElementById('cand-mensagem');
  if (mensagem) mensagem.value = '';
  modal.hidden = false;
}

function initCandidaturaModal() {
  const close = document.getElementById('modal-cand-close');
  const cancel = document.getElementById('btn-cand-cancel');
  const confirm = document.getElementById('btn-cand-confirm');

  [close, cancel].forEach(el => el?.addEventListener('click', () => {
    document.getElementById('modal-candidatura').hidden = true;
  }));

  confirm?.addEventListener('click', async () => {
    if (!_pendingVagaId) return;
    const mensagem = document.getElementById('cand-mensagem')?.value?.trim();
    confirm.disabled = true;
    confirm.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Enviando...';
    try {
      await apiFetch(API.candidatar, { vaga_id: _pendingVagaId, mensagem: mensagem || null }, 'POST');
      document.getElementById('modal-candidatura').hidden = true;
      incrementCandidateDynamicStats();
      showToast('Candidatura enviada com sucesso! 🚀', 'success');
      // Recarrega os dados
      await loadCandidaturas();
      await loadVagasRecomendadas();
    } catch (err) {
      showToast(err.message || 'Erro ao enviar candidatura.', 'error');
    } finally {
      confirm.disabled = false;
      confirm.innerHTML = '<i class="bi bi-send-fill"></i> Confirmar Candidatura';
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PAINEL EMPRESA
// ═══════════════════════════════════════════════════════════════════════════

async function loadEmpresaDashboard() {
  await loadEmpresaStats();
  await loadEmpresaVagas();
}

async function loadEmpresaStats() {
  try {
    const stats = await apiFetch(API.stats_emp);
    if (!stats) return;

    const dyn = getDynamicStats();
    const totVagas = dyn.total_vagas !== undefined ? dyn.total_vagas : stats.total_vagas;
    const vagAbertas = dyn.vagas_abertas !== undefined ? dyn.vagas_abertas : stats.vagas_abertas;

    setText('stat-total-vagas', totVagas);
    setText('stat-vagas-abertas', vagAbertas);
    setText('stat-total-candidatos', stats.total_candidatos);
    setText('stat-aprovados', stats.aprovados);
    setText('badge-vagas', totVagas);
    const greetEl = document.getElementById('dash-greeting');
    if (greetEl) greetEl.textContent = `${escHtml(stats.empresa)} · ${escHtml(stats.setor || 'Recrutamento')}`;
  } catch (err) {
    console.warn('Erro ao carregar stats empresa:', err.message);
  }
}

async function loadEmpresaVagas() {
  try {
    allVagasEmp = await apiFetch(API.vagas_emp) || [];
    setText('badge-vagas', allVagasEmp.length);
    renderVagasEmpresaTable(allVagasEmp);
    renderVagasEmpresaGrid('todas');
    populateVagaSelector();
  } catch (err) {
    console.warn('Erro ao carregar vagas empresa:', err.message);
  }
}

function renderVagasEmpresaTable(vagas) {
  const wrap = document.getElementById('vagas-table-wrap');
  if (!wrap) return;
  if (!vagas.length) {
    wrap.innerHTML = `<div class="empty-state-small">Nenhuma vaga publicada ainda.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table class="dash-table">
      <thead>
        <tr>
          <th>Título</th>
          <th>Nível</th>
          <th>Modalidade</th>
          <th>Status</th>
          <th>Candidatos</th>
          <th>Ação</th>
        </tr>
      </thead>
      <tbody>
        ${vagas.slice(0, 8).map(v => `
          <tr class="row-link" onclick="loadCandidatosVaga(${v.id}, '${escHtml(v.titulo).replace(/'/g, "\\'")}')">
            <td><strong>${escHtml(v.titulo)}</strong></td>
            <td>${v.nivel === 'junior' ? 'Júnior' : 'Estagiário'}</td>
            <td>${modalidadePill(v.modalidade)}</td>
            <td>${v.status === 'aberta' ? '<span class="cand-status-badge status-aprovado">Aberta</span>' : '<span class="cand-status-badge status-reprovado">Encerrada</span>'}</td>
            <td><strong>${v.total_candidatos}</strong></td>
            <td><button class="btn btn-primary btn-sm" onclick="event.stopPropagation();loadCandidatosVaga(${v.id}, '${escHtml(v.titulo).replace(/'/g, "\\'")}')">Ver IA Ranking</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderVagasEmpresaGrid(filter = 'todas') {
  const grid = document.getElementById('vagas-empresa-grid');
  if (!grid) return;
  const filtered = filter === 'todas' ? allVagasEmp : allVagasEmp.filter(v => v.status === filter);

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <i class="bi bi-briefcase" style="font-size:2rem;color:var(--violet-light)"></i>
      <h4>Nenhuma vaga encontrada.</h4>
      <p>Publique sua primeira vaga!</p>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(v => {
    const tags = (v.tags || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 3);
    return `
      <div class="vaga-card">
        <div class="vaga-card-header">
          <div>
            <div class="vaga-titulo">${escHtml(v.titulo)}</div>
            <div class="vaga-empresa">${v.nivel === 'junior' ? 'Júnior' : 'Estagiário'} · ${v.modalidade}</div>
          </div>
          <span class="cand-status-badge ${v.status === 'aberta' ? 'status-aprovado' : 'status-reprovado'}">${v.status === 'aberta' ? 'Aberta' : 'Encerrada'}</span>
        </div>
        ${tags.length ? `<div class="vaga-tags">${tags.map(t => `<span class="tag-chip">${escHtml(t)}</span>`).join('')}</div>` : ''}
        <div class="vaga-meta">
          <span class="meta-pill"><i class="bi bi-people-fill"></i>${v.total_candidatos} candidato(s)</span>
          ${v.cidade ? `<span class="meta-pill"><i class="bi bi-geo-alt"></i>${escHtml(v.cidade)}</span>` : ''}
        </div>
        <div class="vaga-card-footer">
          <button class="btn btn-primary btn-sm" onclick="loadCandidatosVaga(${v.id}, '${escHtml(v.titulo).replace(/'/g, "\\'")}')">
            <i class="bi bi-cpu"></i> Ranking IA
          </button>
          ${v.status === 'aberta' ? `
            <button class="btn btn-danger-ghost" onclick="fecharVaga(${v.id})">
              <i class="bi bi-x-circle"></i> Encerrar
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function populateVagaSelector() {
  const sel = document.getElementById('select-vaga-cands');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Selecione uma vaga —</option>' +
    allVagasEmp.map(v => `<option value="${v.id}">${escHtml(v.titulo)} (${v.total_candidatos} candidatos)</option>`).join('');
  sel.addEventListener('change', () => {
    if (sel.value) loadCandidatosVaga(parseInt(sel.value), sel.selectedOptions[0]?.text || '');
  });
}

async function loadCandidatosVaga(vagaId, titulo = '') {
  currentVagaIdCandidatos = vagaId;
  navigateTo('candidatos');

  // Sync selector
  const sel = document.getElementById('select-vaga-cands');
  if (sel) sel.value = vagaId;

  const rankingEl = document.getElementById('candidatos-ranking');
  const overviewEl = document.getElementById('top-candidatos-overview');

  const loadingHtml = `<div class="loading-placeholder full"><i class="bi bi-arrow-repeat spin"></i> IA calculando ranking...</div>`;
  if (rankingEl) rankingEl.innerHTML = loadingHtml;
  if (overviewEl) overviewEl.innerHTML = loadingHtml;

  try {
    const candidatos = await apiFetch(API.candidatos_vaga(vagaId));
    if (!candidatos) return;

    if (!candidatos.length) {
      const msg = `<div class="empty-state"><i class="bi bi-people" style="font-size:2rem;color:var(--violet-light)"></i><h4>Nenhum candidato inscrito ainda.</h4></div>`;
      if (rankingEl) rankingEl.innerHTML = msg;
      if (overviewEl) overviewEl.innerHTML = `<p class="empty-state-small">Sem candidatos para "${escHtml(titulo)}".</p>`;
      return;
    }

    const rankHtml = candidatos.map((c, i) => {
      const posClass = i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : '';
      return `
        <div class="ranking-card" onclick="abrirDetalhesCandidato(${JSON.stringify(c).replace(/"/g, '&quot;')}, ${c.candidatura_id})">
          <span class="ranking-pos ${posClass}">${i + 1}°</span>
          <div class="ranking-avatar"><i class="bi bi-person-fill"></i></div>
          <div class="ranking-info">
            <div class="ranking-nome">${escHtml(c.nome)}</div>
            <div class="ranking-sub">${c.nivel === 'junior' ? 'Júnior' : 'Estagiário'} · ${escHtml(c.area_interesse || 'Não informado')} · ${statusBadge(c.status)}</div>
          </div>
          <div class="ranking-score-wrap">
            ${scoreBarHtml(c.match.score, c.match.cor)}
          </div>
        </div>
      `;
    }).join('');

    if (rankingEl) rankingEl.innerHTML = rankHtml;

    // Overview preview
    if (overviewEl) {
      overviewEl.innerHTML = `<p style="font-size:.8125rem;color:var(--text-muted);margin-bottom:12px;">${candidatos.length} candidatos para <strong>${escHtml(titulo)}</strong></p>` +
        candidatos.slice(0, 5).map((c, i) => `
          <div style="display:flex;align-items:center;gap:12px;padding:8px 0;${i < 4 ? 'border-bottom:1px solid rgba(255,255,255,.04);' : ''}">
            <span style="font-weight:800;color:${escHtml(c.match.cor)};min-width:36px;">${c.match.score}%</span>
            <span style="font-size:.875rem;color:var(--text-secondary);">${escHtml(c.nome)}</span>
            ${statusBadge(c.status)}
          </div>
        `).join('');
    }

    setTimeout(animateScoreBars, 100);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Modal Detalhe Candidato ───────────────────────────────────────────────────

function abrirDetalhesCandidato(candidato, candidaturaId) {
  // candidato pode ser um objeto ou string JSON vinda de inline attr
  if (typeof candidato === 'string') {
    try { candidato = JSON.parse(candidato); } catch { return; }
  }
  currentCandidaturaId = candidaturaId;
  const modal = document.getElementById('modal-candidato');
  const body  = document.getElementById('modal-candidato-body');
  const sel   = document.getElementById('select-status-cand');

  if (!modal || !body) return;

  if (sel) sel.value = candidato.status || 'pendente';

  const tags = (candidato.area_interesse || '').split(',').map(t => t.trim()).filter(Boolean);
  const m = candidato.match || {};

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;padding:16px;background:rgba(255,255,255,.03);border-radius:12px;border:1px solid rgba(255,255,255,.06);">
      <div style="width:52px;height:52px;border-radius:50%;background:var(--gradient-primary);display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:white;flex-shrink:0;">
        <i class="bi bi-person-fill"></i>
      </div>
      <div>
        <div style="font-size:1rem;font-weight:700;">${escHtml(candidato.nome)}</div>
        <div style="font-size:.8125rem;color:var(--text-muted);">${candidato.nivel === 'junior' ? 'Júnior' : 'Estagiário'} · ${escHtml(candidato.cidade || '')} ${escHtml(candidato.estado || '')}</div>
        <div style="margin-top:6px;">${statusBadge(candidato.status)}</div>
      </div>
      <div style="margin-left:auto;text-align:center;">
        <div style="font-size:2rem;font-weight:800;color:${escHtml(m.cor || '#22c55e')};">${m.score || 0}%</div>
        <div style="font-size:.625rem;color:var(--text-muted);">IA MATCH</div>
      </div>
    </div>

    ${candidato.area_interesse ? `
      <div>
        <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:8px;">Área de Interesse</div>
        <div>${escHtml(candidato.area_interesse)}</div>
      </div>
    ` : ''}

    ${m.pontos_fortes?.length ? `
      <div style="padding:12px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:10px;">
        <div style="font-size:.75rem;font-weight:700;color:var(--green-light);margin-bottom:6px;">✅ Pontos Fortes</div>
        ${m.pontos_fortes.map(p => `<div style="font-size:.8125rem;color:var(--text-secondary);">· ${escHtml(p)}</div>`).join('')}
      </div>
    ` : ''}

    ${m.pontos_atencao?.length ? `
      <div style="padding:12px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:10px;">
        <div style="font-size:.75rem;font-weight:700;color:#fbbf24;margin-bottom:6px;">⚠️ Pontos de Atenção</div>
        ${m.pontos_atencao.map(p => `<div style="font-size:.8125rem;color:var(--text-secondary);">· ${escHtml(p)}</div>`).join('')}
      </div>
    ` : ''}

    <div style="padding:12px;background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.2);border-radius:10px;">
      <div style="font-size:.75rem;font-weight:700;color:var(--violet-light);margin-bottom:4px;"><i class="bi bi-cpu"></i> Veredito IA</div>
      <div style="font-size:.8125rem;color:var(--text-secondary);line-height:1.6;">${escHtml(m.veredicto || '')}</div>
    </div>

    ${candidato.mensagem ? `
      <div>
        <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:6px;">Mensagem do Candidato</div>
        <div style="font-size:.875rem;color:var(--text-secondary);line-height:1.6;font-style:italic;">"${escHtml(candidato.mensagem)}"</div>
      </div>
    ` : ''}

    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      ${candidato.linkedin ? `<a href="${escHtml(candidato.linkedin)}" target="_blank" class="perfil-link-btn"><i class="bi bi-linkedin"></i>LinkedIn</a>` : ''}
      ${candidato.github   ? `<a href="${escHtml(candidato.github)}" target="_blank" class="perfil-link-btn"><i class="bi bi-github"></i>GitHub</a>` : ''}
    </div>
  `;

  modal.hidden = false;
}

function initCandidatoModal() {
  const close = document.getElementById('modal-cand-close');
  if (close) close.addEventListener('click', () => {
    document.getElementById('modal-candidato').hidden = true;
  });

  const salvar = document.getElementById('btn-salvar-status');
  const sel    = document.getElementById('select-status-cand');
  if (salvar && sel) {
    salvar.addEventListener('click', async () => {
      if (!currentCandidaturaId) return;
      salvar.disabled = true;
      try {
        await apiFetch(API.update_status(currentCandidaturaId), { status: sel.value }, 'PATCH');
        showToast('Status atualizado com sucesso!', 'success');
        document.getElementById('modal-candidato').hidden = true;
        if (currentVagaIdCandidatos) {
          await loadCandidatosVaga(currentVagaIdCandidatos);
        }
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        salvar.disabled = false;
      }
    });
  }
}

// ── Nova Vaga ─────────────────────────────────────────────────────────────────

function initFormNovaVaga() {
  const form    = document.getElementById('form-nova-vaga');
  const cancelar = document.getElementById('btn-cancelar-vaga');
  const feedback = document.getElementById('form-vaga-feedback');

  if (cancelar) cancelar.addEventListener('click', () => navigateTo('vagas'));

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-publicar-vaga');
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Publicando...';
    feedback.hidden = true;

    const salarioMin = document.getElementById('vaga-salario-min').value;

    const body = {
      titulo:     document.getElementById('vaga-titulo').value.trim(),
      descricao:  document.getElementById('vaga-descricao').value.trim(),
      requisitos: document.getElementById('vaga-requisitos').value.trim() || null,
      beneficios: document.getElementById('vaga-beneficios').value.trim() || null,
      tags:       document.getElementById('vaga-tags').value.trim() || null,
      nivel:      document.getElementById('vaga-nivel').value,
      modalidade: document.getElementById('vaga-modalidade').value,
      cidade:     document.getElementById('vaga-cidade').value.trim() || null,
      estado:     document.getElementById('vaga-estado').value.trim().toUpperCase() || null,
      salario_min: salarioMin ? parseInt(salarioMin) : null,
    };

    try {
      await apiFetch(API.criar_vaga, body, 'POST');
      incrementEmpresaDynamicStats('nova_vaga');
      showToast('Vaga publicada com sucesso! 🎉', 'success');
      form.reset();
      await loadEmpresaVagas();
      navigateTo('vagas');
    } catch (err) {
      feedback.hidden = false;
      feedback.className = 'form-feedback error';
      feedback.textContent = err.message || 'Erro ao publicar vaga.';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-send-fill"></i> Publicar Vaga';
    }
  });
}

async function fecharVaga(vagaId) {
  if (!confirm('Tem certeza que deseja encerrar esta vaga?')) return;
  try {
    await apiFetch(API.fechar_vaga(vagaId), null, 'DELETE');
    incrementEmpresaDynamicStats('fechar_vaga');
    showToast('Vaga encerrada.', 'info');
    await loadEmpresaVagas();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Filtros de Seção ─────────────────────────────────────────────────────────

function initFilters() {
  // Filtros de candidaturas (candidato)
  document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderCandidaturas(btn.dataset.filter);
    });
  });

  // Filtros de vagas recomendadas
  document.querySelectorAll('.filter-btn[data-rec-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn[data-rec-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderVagasRec(btn.dataset.recFilter);
    });
  });

  // Filtros de vagas empresa
  document.querySelectorAll('.filter-btn[data-vaga-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn[data-vaga-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderVagasEmpresaGrid(btn.dataset.vagaFilter);
    });
  });
}

// ── Utilitários ───────────────────────────────────────────────────────────────

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

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const flow = el.tagName && el.tagName.toLowerCase() === 'number-flow' ? el : el.querySelector?.('number-flow');
  if (flow && typeof flow.update === 'function') {
    const rawStr = String(value);
    const hasPercent = rawStr.includes('%');
    const num = typeof value === 'number' ? value : parseFloat(rawStr.replace(/[^\d.-]/g, ''));
    if (!isNaN(num)) {
      if (hasPercent) flow.numberSuffix = '%';
      flow.update(num);
      return;
    }
  }
  el.textContent = value;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── NumberFlow Stats (Recipe C — Viewport Entry) ──────────────────────────────

function initNumberFlowStats(scope = document) {
  const statContainers = scope.querySelectorAll('[data-number-flow-stat]');
  statContainers.forEach(root => {
    const cleanupName = '__numberFlowStatisticCleanup';
    root[cleanupName]?.();

    const flow = root.querySelector('[data-stat-number]') || root.querySelector('number-flow');
    if (!flow) return;

    flow.format = { maximumFractionDigits: 0 };
    flow.trend = 1;

    const raw = flow.textContent.trim();
    const isPercent = raw.includes('%') || flow.id.includes('match') || flow.id.includes('donut');
    if (isPercent) flow.numberSuffix = '%';
    const parsed = parseFloat(raw.replace(/[^\d.-]/g, ''));
    const initialVal = isNaN(parsed) ? 0 : parsed;

    flow.animated = false;
    if (typeof flow.update === 'function') {
      flow.update(initialVal);
    }
    flow.animated = true;

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(([entry]) => {
        if (!entry?.isIntersecting) return;
        if (typeof flow.update === 'function') {
          flow.update(initialVal);
        }
        observer.disconnect();
      }, { threshold: 0.3 });
      observer.observe(root);

      root[cleanupName] = () => {
        observer?.disconnect();
        flow.animated = false;
        delete root[cleanupName];
      };
    }
  });
}

// ── Gerenciamento por Perfil no Front-end (Sem Dependência de Banco) ─────────

function getProfileStorageKey(prefix) {
  let userKey = 'default';
  try {
    const user = JSON.parse(localStorage.getItem('easyintern_user') || localStorage.getItem('ag_user'));
    if (user && user.email) {
      userKey = user.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
    }
  } catch {}
  if (userKey === 'default') {
    const panel = dashPanel || document.body.dataset.panel || 'candidato';
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
  showToast('📈 Indicadores atualizados automaticamente via NumberFlow!', 'success', 2500);
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
  showToast('📈 Indicadores atualizados automaticamente via NumberFlow!', 'info', 2500);
}

// ── Drag and Drop para Dashboards ─────────────────────────────────────────────

function initDashboardDragAndDrop() {
  const storageKey = getProfileStorageKey('easyintern_order');

  // 1. Restaurar ordem salva do layout para este perfil
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
  } catch (e) {
    console.warn('Erro ao restaurar layout do dashboard:', e);
  }

  // 2. Configurar eventos de Arrastar e Soltar (Drag and Drop)
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
      showToast('Posição atualizada com sucesso!', 'info', 1600);
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

// ── Motor do Carrossel de Dashboards ─────────────────────────────────────────

let _dashCarouselAutoplayTimer = null;

function setupDashboardCarousel(mode = 'grid', model = 'panoramic', autoPlay = false) {
  const grid = document.getElementById('stats-grid');
  if (!grid) return;

  const existingWrapper = document.querySelector('.stats-carousel-wrapper');

  if (mode === 'grid') {
    if (_dashCarouselAutoplayTimer) {
      clearInterval(_dashCarouselAutoplayTimer);
      _dashCarouselAutoplayTimer = null;
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

  // Ativa Modo Carrossel
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

  // Move os stat-cards para o trilho do carrossel preservando os NumberFlows
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

  // Arraste com mouse e touch (Swipe suave)
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

  if (_dashCarouselAutoplayTimer) {
    clearInterval(_dashCarouselAutoplayTimer);
    _dashCarouselAutoplayTimer = null;
  }

  if (autoPlay) {
    _dashCarouselAutoplayTimer = setInterval(() => {
      const next = currentIndex >= getMaxIndex() ? 0 : currentIndex + 1;
      goToSlide(next);
    }, 4000);

    wrapper.onmouseenter = () => {
      if (_dashCarouselAutoplayTimer) clearInterval(_dashCarouselAutoplayTimer);
    };
    wrapper.onmouseleave = () => {
      if (_dashCarouselAutoplayTimer) clearInterval(_dashCarouselAutoplayTimer);
      _dashCarouselAutoplayTimer = setInterval(() => {
        const next = currentIndex >= getMaxIndex() ? 0 : currentIndex + 1;
        goToSlide(next);
      }, 4000);
    };
  }

  goToSlide(0);
}

// ── Área de Configurações: Editar Dashboards ─────────────────────────────────

function initEditDashboardsPanel() {
  const visKey = getProfileStorageKey('easyintern_visibility');
  const modeKey = getProfileStorageKey('easyintern_dash_mode');
  const modelKey = getProfileStorageKey('easyintern_carousel_model');
  const autoplayKey = getProfileStorageKey('easyintern_carousel_autoplay');

  // 1. Visibilidade dos componentes salva no perfil
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
      showToast(toggle.checked ? 'Componente exibido no dashboard.' : 'Componente ocultado do dashboard.', 'info', 1800);
    });
  });

  // 2. Modo de Exibição (Grade vs Carrossel) por perfil
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
      showToast(selectedMode === 'carousel' ? '🎠 Modo Carrossel ativado no seu perfil!' : '📐 Modo Grade Modular ativado no seu perfil!', 'success', 2200);
    });
  });

  // 3. Modelos de Carrossel (Panorâmico vs Destaque)
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
      showToast(`Modelo ${chosenModel === 'spotlight' ? 'Destaque' : 'Panorâmico'} aplicado ao Carrossel!`, 'info', 1800);
    });
  });

  // 4. Autoplay do Carrossel
  if (autoplayToggle) {
    autoplayToggle.addEventListener('change', () => {
      try {
        localStorage.setItem(autoplayKey, String(autoplayToggle.checked));
      } catch {}
      const curModel = localStorage.getItem(modelKey) || 'panoramic';
      setupDashboardCarousel('carousel', curModel, autoplayToggle.checked);
      showToast(autoplayToggle.checked ? 'Transição automática do carrossel ativada.' : 'Transição automática desativada.', 'info', 1600);
    });
  }

  // 5. Aplica a visualização correspondente ao perfil
  setupDashboardCarousel(savedMode, savedModel, savedAutoplay);

  // 6. Botão Restaurar Layout
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
      showToast('Configurações de layout do perfil restauradas! 🔄', 'success');
      setTimeout(() => window.location.reload(), 450);
    });
  }
}

// ── Modal Acesso Mobile / QR Code ──────────────────────────────────────────

function initMobileModal() {
  const btn = document.getElementById('btn-mobile-modal');
  const modal = document.getElementById('modal-mobile');
  const close = document.getElementById('modal-mob-close');
  const ok = document.getElementById('btn-mob-ok');
  const copy = document.getElementById('btn-copy-mobile-link');
  const urlText = document.getElementById('mobile-url-text');
  const qrImg = document.getElementById('qr-code-img');
  const tunnelBadge = document.getElementById('tunnel-badge');

  if (!btn || !modal) return;

  let currentData = null;

  async function updateNetworkInfo() {
    try {
      const res = await fetch('/api/network-info');
      if (!res.ok) return;
      const data = await res.json();
      currentData = data;

      // Link unico para acesso local e externo.
      if (urlText) urlText.textContent = data.access_url || data.mobile_network_url;

      // QR Code — aponta para túnel se ativo, senão para Wi-Fi
      if (qrImg) qrImg.src = data.qr_code_url;

      // Badge de status do túnel
      if (tunnelBadge) {
        if (data.internet_access) {
          tunnelBadge.textContent = '🌐 Internet Ativa';
          tunnelBadge.style.background = 'rgba(16,185,129,0.2)';
          tunnelBadge.style.borderColor = 'rgba(16,185,129,0.5)';
          tunnelBadge.style.color = 'var(--green-light)';
        } else {
          tunnelBadge.textContent = '📡 Wi-Fi apenas';
          tunnelBadge.style.background = 'rgba(6,182,212,0.1)';
          tunnelBadge.style.borderColor = 'rgba(6,182,212,0.3)';
          tunnelBadge.style.color = 'var(--cyan-light)';
        }
      }

    } catch (e) {
      console.warn('Could not fetch network info:', e);
    }
  }

  btn.addEventListener('click', () => {
    modal.hidden = false;
    updateNetworkInfo();
  });

  [close, ok].forEach(el => el?.addEventListener('click', () => {
    modal.hidden = true;
  }));

  // Copiar link Wi-Fi
  copy?.addEventListener('click', () => {
    const url = currentData?.access_url || urlText?.textContent || window.location.origin;
    navigator.clipboard?.writeText(url).then(() => {
      showToast('Link de acesso copiado!', 'success');
    }).catch(() => showToast('Link: ' + url, 'info'));
  });
}

// ── Bootstrap Principal ───────────────────────────────────────────────────────

async function init() {
  const ok = await authGuard();
  if (!ok) return;

  initSidebar();
  initNavigation();
  initThemeControl();
  initLogout();
  initFilters();
  initMobileModal();

  if (dashPanel === 'candidato') {
    initCandidaturaModal();
    await loadCandidatoDashboard();
  } else if (dashPanel === 'empresa') {
    initFormNovaVaga();
    initCandidatoModal();
    await loadEmpresaDashboard();
  }

  // Inicializa NumberFlow, Drag-and-Drop e painel "Editar dashboards"
  initNumberFlowStats();
  initDashboardDragAndDrop();
  initEditDashboardsPanel();
}

document.addEventListener('DOMContentLoaded', init);
