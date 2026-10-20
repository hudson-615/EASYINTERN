/**
 * dashboard.js — Motor Zero-G para os Painéis de Candidato e Empresa
 * Responsável por: autenticação JWT (redirect guard), todas as chamadas de API,
 * renderização de Cards/Timeline/Ranking-IA, Donut Chart animado, sidebar mobile,
 * modal de candidatura, modal de detalhe de candidato e toasts de feedback.
 */

'use strict';

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
  const res = await fetch(url, opts);
  if (res.status === 401) {
    // Token expirado/inválido — redireciona para login
    localStorage.removeItem('easyintern_token');
    window.location.href = '/';
    return null;
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Erro na requisição.');
  return data;
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
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.setAttribute('aria-label', 'Abrir menu de navegação');
    toggle?.setAttribute('title', 'Abrir menu de navegação');
    const label = toggle?.querySelector('span');
    if (label) label.textContent = 'Menu';
  };

  if (toggle) {
    toggle.addEventListener('click', () => {
      const isOpen = !sidebar.classList.contains('is-open');
      sidebar.classList.toggle('is-open', isOpen);
      overlay?.classList.toggle('is-open', isOpen);
      toggle.setAttribute('aria-expanded', String(isOpen));
      toggle.setAttribute('aria-label', isOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
      toggle.setAttribute('title', isOpen ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
      const label = toggle.querySelector('span');
      if (label) label.textContent = isOpen ? 'Fechar' : 'Menu';
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
  const toggle = document.getElementById('btn-theme-toggle');
  if (!toggle) return;

  const applyTheme = (theme) => {
    const isDark = theme === 'dark';
    if (isDark) {
      document.body.dataset.theme = 'dark';
    } else {
      delete document.body.dataset.theme;
    }
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute('aria-label', isDark ? 'Ativar modo claro' : 'Ativar modo escuro');
    toggle.title = isDark ? 'Ativar modo claro' : 'Ativar modo escuro';
    toggle.querySelector('span').textContent = isDark ? 'Ativar modo claro' : 'Ativar modo escuro';
    toggle.querySelector('i').className = isDark ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
  };

  let savedTheme = 'light';
  try {
    savedTheme = localStorage.getItem('easyintern-dashboard-theme') || 'light';
  } catch {
    savedTheme = 'light';
  }
  applyTheme(savedTheme);

  toggle.addEventListener('click', () => {
    const nextTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    try {
      localStorage.setItem('easyintern-dashboard-theme', nextTheme);
    } catch {
      return;
    }
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
  const menuToggle = document.getElementById('btn-menu-toggle');
  menuToggle?.setAttribute('aria-expanded', 'false');
  menuToggle?.setAttribute('aria-label', 'Abrir menu de navegação');
  menuToggle?.setAttribute('title', 'Abrir menu de navegação');
  const menuLabel = menuToggle?.querySelector('span');
  if (menuLabel) menuLabel.textContent = 'Menu';

  // Título
  const titles = {
    overview: 'Visão Geral', candidaturas: 'Minhas Candidaturas',
    recomendadas: 'Vagas Recomendadas', perfil: 'Meu Perfil',
    vagas: 'Vagas Publicadas', candidatos: 'Candidatos — Ranking IA',
    'nova-vaga': 'Publicar Nova Vaga',
    configuracoes: 'Configurações',
  };
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) pageTitle.textContent = titles[section] || section;
}

// ── Auth Guard ────────────────────────────────────────────────────────────────

async function authGuard() {
  const token = getToken();
  if (!token) {
    window.location.href = '/';
    return false;
  }
  try {
    currentUser = await apiFetch(API.me);
    if (!currentUser) return false;

    // Redireciona se tipo de usuário não bate com o painel
    if (dashPanel === 'candidato' && currentUser.tipo !== 'candidato') {
      window.location.href = '/dashboard/empresa';
      return false;
    }
    if (dashPanel === 'empresa' && currentUser.tipo !== 'empresa') {
      window.location.href = '/dashboard/candidato';
      return false;
    }

    const greetEl = document.getElementById('dash-greeting');
    if (greetEl) greetEl.textContent = `Olá, ${currentUser.nome} 👋`;
    return true;
  } catch {
    window.location.href = '/';
    return false;
  }
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
      window.location.href = '/';
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

    setText('stat-total-c', stats.total_candidaturas);
    setText('stat-aprovadas-v', stats.aprovadas);
    setText('stat-analise-v', stats.em_analise);
    setText('stat-taxa-match', `${stats.taxa_match}%`);
    setText('badge-candidaturas', stats.total_candidaturas);
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
    setText('stat-total-vagas', stats.total_vagas);
    setText('stat-vagas-abertas', stats.vagas_abertas);
    setText('stat-total-candidatos', stats.total_candidatos);
    setText('stat-aprovados', stats.aprovados);
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

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
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
}

document.addEventListener('DOMContentLoaded', init);
