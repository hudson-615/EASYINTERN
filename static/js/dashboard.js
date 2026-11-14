/**
 * dashboard.js — EasyIntern
 *
 * Painéis de Candidato e Empresa
 * Autenticação JWT, APIs, estatísticas, candidaturas,
 * vagas, navegação, gráficos e personalização.
 *
 * Os dados profissionais são obtidos das APIs.
 * Nenhum dado fictício substitui falhas do backend.
 */

'use strict';

// ============================================================
// NUMBERFLOW — FALLBACK
// ============================================================

if (
  typeof window !== 'undefined' &&
  'customElements' in window &&
  !customElements.get('number-flow')
) {
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
      const texto = this.textContent.trim();

      if (texto && texto !== '—') {
        const numero = parseFloat(
          texto.replace(/[^\d.-]/g, '')
        );

        if (Number.isFinite(numero)) {
          this._value = numero;
        }
      }
    }

    update(valor) {
      const numero = Number(valor);

      const destino = Number.isFinite(numero)
        ? numero
        : 0;

      if (!this.animated) {
        this._value = destino;
        this.render();
        return;
      }

      const inicio = this._value;
      const final = destino;
      const duracao = 600;
      const inicioTempo = performance.now();

      this._value = destino;

      const animar = (agora) => {
        const progresso = Math.min(
          1,
          (agora - inicioTempo) / duracao
        );

        const suavizacao =
          1 - Math.pow(1 - progresso, 3);

        const atual =
          inicio + (final - inicio) * suavizacao;

        this.render(atual);

        if (progresso < 1) {
          requestAnimationFrame(animar);
        } else {
          this.render(final);
        }
      };

      requestAnimationFrame(animar);
    }

    render(valor = this._value) {
      let texto;

      if (this.format?.style === 'percent') {
        texto = `${Math.round(valor * 100)}%`;
      } else if (this.format?.style === 'currency') {
        texto = `R$ ${Math.round(valor)}`;
      } else {
        texto = Math.round(valor).toLocaleString('pt-BR');
      }

      this.textContent = texto + (this.numberSuffix || '');
    }
  }

  customElements.define(
    'number-flow',
    NumberFlowElementFallback
  );
}

// ============================================================
// CONFIGURAÇÃO DAS APIS
// ============================================================

const API = {
  me: '/api/auth/me',

  stats_cand: '/dashboard/api/candidato/stats',
  perfil_cand: '/dashboard/api/candidato/perfil',
  candidaturas: '/dashboard/api/candidato/candidaturas',
  recomendadas: '/dashboard/api/candidato/vagas-recomendadas',
  candidatar: '/dashboard/api/candidato/candidatar',

  stats_emp: '/dashboard/api/empresa/stats',
  vagas_emp: '/dashboard/api/empresa/vagas',
  criar_vaga: '/dashboard/api/empresa/vagas',

  fechar_vaga: (id) =>
    `/dashboard/api/empresa/vagas/${id}`,

  candidatos_vaga: (id) =>
    `/dashboard/api/empresa/candidatos/${id}`,

  update_status: (id) =>
    `/dashboard/api/empresa/candidaturas/${id}/status`
};

// API POST de candidaturas implementada e habilitada.
const CANDIDATURAS_HABILITADAS = true;

// ============================================================
// ESTADO DA APLICAÇÃO
// ============================================================

let currentUser = null;

const dashPanel = document.body.dataset.panel;

let allCandidaturas = [];
let allVagasRec = [];
let allVagasEmp = [];

let currentVagaIdCandidatos = null;
let currentCandidaturaId = null;
let _pendingVagaId = null;

let _dashCarouselAutoplayTimer = null;

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function escHtml(valor) {
  if (valor === null || valor === undefined) {
    return '';
  }

  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getToken() {
  return (
    localStorage.getItem('easyintern_token') ||
    localStorage.getItem('ag_token')
  );
}

function limparSessao() {
  localStorage.removeItem('easyintern_token');
  localStorage.removeItem('ag_token');
  localStorage.removeItem('easyintern_user');
  localStorage.removeItem('ag_user');
}

async function apiFetch(url, body = null, method = 'GET') {
  const token = getToken();

  const headers = {
    Accept: 'application/json'
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body !== null && body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let resposta;

  try {
    resposta = await fetch(url, {
      method,
      headers,
      body:
        body !== null && body !== undefined
          ? JSON.stringify(body)
          : undefined
    });
  } catch {
    throw new Error(
      'Não foi possível conectar ao servidor.'
    );
  }

  let dados = null;

  const contentType =
    resposta.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      dados = await resposta.json();
    } catch {
      throw new Error(
        'O servidor retornou uma resposta inválida.'
      );
    }
  }

  if (!resposta.ok) {
    let mensagem = `Erro ${resposta.status} na requisição.`;

    if (typeof dados?.detail === 'string') {
      mensagem = dados.detail;
    } else if (Array.isArray(dados?.detail)) {
      mensagem = dados.detail
        .map(item => item.msg || 'Dados inválidos.')
        .join(' · ');
    }

    const erro = new Error(mensagem);
    erro.status = resposta.status;

    throw erro;
  }

  return dados;
}

function showToast(
  mensagem,
  tipo = 'info',
  duracao = 3500
) {
  const container = document.getElementById(
    'toast-container'
  );

  if (!container) return;

  const icones = {
    success: 'bi-check-circle-fill',
    error: 'bi-exclamation-circle-fill',
    info: 'bi-info-circle-fill'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;

  toast.innerHTML = `
    <i class="bi ${icones[tipo] || icones.info}"></i>
    <span>${escHtml(mensagem)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => toast.remove(), duracao);
}

function setText(id, valor) {
  const elemento = document.getElementById(id);

  if (!elemento) return;

  const flow =
    elemento.tagName?.toLowerCase() === 'number-flow'
      ? elemento
      : elemento.querySelector?.('number-flow');

  if (flow && typeof flow.update === 'function') {
    const texto = String(valor);
    const numero = Number.parseFloat(
      texto.replace(/[^\d.-]/g, '')
    );

    if (Number.isFinite(numero)) {
      flow.numberSuffix = texto.includes('%') ? '%' : '';
      flow.update(numero);
      return;
    }
  }

  elemento.textContent = valor ?? '—';
}

function updateNumberFlow(
  elementoOuId,
  valor,
  opcoes = {}
) {
  const elemento =
    typeof elementoOuId === 'string'
      ? document.getElementById(elementoOuId)
      : elementoOuId;

  if (!elemento) return;

  const flow =
    elemento.tagName?.toLowerCase() === 'number-flow'
      ? elemento
      : elemento.querySelector?.('number-flow');

  const destino = flow || elemento;
  const numero = Number(valor);

  if (typeof destino.update === 'function') {
    if (opcoes.format) {
      destino.format = opcoes.format;
    }

    if (opcoes.numberSuffix !== undefined) {
      destino.numberSuffix = opcoes.numberSuffix;
    }

    if (opcoes.animated !== undefined) {
      destino.animated = opcoes.animated;
    }

    destino.update(
      Number.isFinite(numero) ? numero : 0
    );
  } else {
    destino.textContent = Number.isFinite(numero)
      ? `${numero}${opcoes.numberSuffix || ''}`
      : '—';
  }
}

function formatDate(data) {
  if (!data) return '—';

  const objeto = new Date(data);

  if (Number.isNaN(objeto.getTime())) {
    return '—';
  }

  return objeto.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function formatarMoeda(valor) {
  if (valor === null || valor === undefined) {
    return 'Bolsa não informada';
  }

  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return 'Bolsa não informada';
  }

  return numero.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

// ============================================================
// VERIFICAÇÃO DOS SCORES DE IA
// ============================================================

function scoreValido(match) {
  return (
    match != null &&
    match.avaliado !== false &&
    match.score !== null &&
    match.score !== undefined &&
    match.score !== '' &&
    Number.isFinite(Number(match.score))
  );
}

function obterScore(match) {
  if (!scoreValido(match)) {
    return null;
  }

  return Math.max(
    0,
    Math.min(100, Number(match.score))
  );
}

function obterCorScore(match) {
  const score = obterScore(match);

  if (score === null) return '#6b7280';
  if (score >= 80) return '#20b479';
  if (score >= 60) return '#3b82f6';
  if (score >= 40) return '#f59e0b';

  return '#6b7280';
}

function scoreTexto(match) {
  const score = obterScore(match);

  return score === null
    ? 'Não avaliado'
    : `${Math.round(score)}%`;
}

function matchBadgeHtml(match) {
  const avaliado = scoreValido(match);

  return `
    <div class="match-badge">
      <span
        class="match-score-big"
        style="
          color:${obterCorScore(match)};
          ${!avaliado ? 'font-size:.75rem;' : ''}
        "
      >
        ${scoreTexto(match)}
      </span>

      <span class="match-label-small">
        ${avaliado ? 'IA match' : 'IA pendente'}
      </span>
    </div>
  `;
}

function scoreBarHtml(
  score,
  cor = '#22c55e'
) {
  if (
    score === null ||
    score === undefined ||
    !Number.isFinite(Number(score))
  ) {
    return `
      <span style="
        font-size:.8125rem;
        color:var(--text-muted);
      ">
        Não avaliado
      </span>
    `;
  }

  const numero = Math.max(
    0,
    Math.min(100, Number(score))
  );

  return `
    <span style="
      font-size:.875rem;
      font-weight:700;
      color:${escHtml(cor)};
    ">
      ${numero}%
    </span>

    <div class="score-bar-wrap">
      <div
        class="score-bar"
        style="
          width:0%;
          background:${escHtml(cor)};
        "
        data-target="${numero}"
      ></div>
    </div>
  `;
}

function animateScoreBars() {
  document
    .querySelectorAll('.score-bar[data-target]')
    .forEach(barra => {
      setTimeout(() => {
        barra.style.width =
          `${Number(barra.dataset.target) || 0}%`;
      }, 100);
    });
}

// ============================================================
// STATUS E MODALIDADE
// ============================================================

function statusBadge(statusAtual) {
  const mapa = {
    pendente: [
      '<i class="bi bi-clock"></i> Pendente',
      'status-pendente'
    ],
    em_analise: [
      '<i class="bi bi-search"></i> Em Análise',
      'status-em_analise'
    ],
    entrevista: [
      '<i class="bi bi-calendar-event"></i> Entrevista',
      'status-em_analise'
    ],
    aprovado: [
      '<i class="bi bi-check-circle"></i> Aprovado',
      'status-aprovado'
    ],
    reprovado: [
      '<i class="bi bi-x-circle"></i> Reprovado',
      'status-reprovado'
    ]
  };

  const [rotulo, classe] =
    mapa[statusAtual] || [
      escHtml(statusAtual || 'Não informado'),
      'status-pendente'
    ];

  return `
    <span class="cand-status-badge ${classe}">
      ${rotulo}
    </span>
  `;
}

function modalidadePill(modalidade) {
  const mapa = {
    presencial:
      '<i class="bi bi-building"></i> Presencial',
    remoto:
      '<i class="bi bi-globe2"></i> Remoto',
    hibrido:
      '<i class="bi bi-shuffle"></i> Híbrido'
  };

  return `
    <span class="meta-pill">
      ${mapa[modalidade] || escHtml(modalidade)}
    </span>
  `;
}

// ============================================================
// AUTENTICAÇÃO
// ============================================================

async function authGuard() {
  if (!getToken()) {
    window.location.replace('/auth');
    return false;
  }

  try {
    const usuario = await apiFetch(API.me);

    if (
      !usuario ||
      !usuario.nome ||
      !['candidato', 'empresa'].includes(usuario.tipo)
    ) {
      throw new Error('Sessão inválida.');
    }

    if (usuario.tipo !== dashPanel) {
      window.location.replace(
        usuario.tipo === 'candidato'
          ? '/dashboard/candidato'
          : '/dashboard/empresa'
      );

      return false;
    }

    currentUser = usuario;

    const saudacao = document.getElementById(
      'dash-greeting'
    );

    if (saudacao) {
      saudacao.textContent =
        dashPanel === 'empresa'
          ? `${usuario.nome} · Recrutamento`
          : `Olá, ${usuario.nome} 👋`;
    }

    return true;

  } catch (erro) {
    console.warn(
      'Falha na autenticação:',
      erro.message
    );

    if (erro.status === 401 || erro.status === 403) {
      limparSessao();
      window.location.replace('/auth');
    } else {
      showToast(
        'Não foi possível verificar sua sessão. Tente atualizar a página.',
        'error'
      );
    }

    return false;
  }
}

function initLogout() {
  const botao = document.getElementById(
    'btn-logout'
  );

  if (!botao) return;

  botao.addEventListener('click', () => {
    limparSessao();
    window.location.replace('/auth');
  });
}

// ============================================================
// SIDEBAR
// ============================================================

function initSidebar() {
  const sidebar = document.getElementById(
    'dash-sidebar'
  );

  const overlay = document.getElementById(
    'sidebar-overlay'
  );

  const botao = document.getElementById(
    'btn-menu-toggle'
  );

  const fechar = () => {
    sidebar?.classList.remove('is-open');
    overlay?.classList.remove('is-open');
    document.body.classList.remove('sidebar-open');

    botao?.setAttribute('aria-expanded', 'false');

    if (botao) {
      botao.title = 'Abrir menu de navegação';
      botao.setAttribute(
        'aria-label',
        'Abrir menu de navegação'
      );

      const texto = botao.querySelector('span');
      const icone = botao.querySelector('i');

      if (texto) texto.textContent = 'Menu';
      if (icone) icone.className = 'bi bi-list';
    }
  };

  botao?.addEventListener('click', () => {
    const aberto = !sidebar?.classList.contains(
      'is-open'
    );

    sidebar?.classList.toggle('is-open', aberto);
    overlay?.classList.toggle('is-open', aberto);

    document.body.classList.toggle(
      'sidebar-open',
      aberto
    );

    botao.setAttribute(
      'aria-expanded',
      String(aberto)
    );

    const texto = botao.querySelector('span');
    const icone = botao.querySelector('i');

    if (texto) {
      texto.textContent = aberto ? 'Fechar' : 'Menu';
    }

    if (icone) {
      icone.className = aberto
        ? 'bi bi-x-lg'
        : 'bi bi-list';
    }
  });

  overlay?.addEventListener('click', fechar);

  document.addEventListener('keydown', evento => {
    if (evento.key === 'Escape') {
      fechar();
    }
  });
}

// ============================================================
// NAVEGAÇÃO
// ============================================================

function navigateTo(secao) {
  const destino = document.getElementById(
    `section-${secao}`
  );

  if (!destino) return;

  document
    .querySelectorAll('.dash-section')
    .forEach(elemento => {
      elemento.classList.remove('active');
    });

  destino.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });

  document
    .getElementById(`nav-${secao}`)
    ?.classList.add('active');

  document
    .getElementById('dash-sidebar')
    ?.classList.remove('is-open');

  document
    .getElementById('sidebar-overlay')
    ?.classList.remove('is-open');

  document.body.classList.remove('sidebar-open');

  const botaoMenu = document.getElementById(
    'btn-menu-toggle'
  );

  if (botaoMenu) {
    botaoMenu.setAttribute('aria-expanded', 'false');

    const texto = botaoMenu.querySelector('span');
    const icone = botaoMenu.querySelector('i');

    if (texto) texto.textContent = 'Menu';
    if (icone) icone.className = 'bi bi-list';
  }

  const titulos = {
    overview: 'Visão Geral',
    candidaturas: 'Minhas Candidaturas',
    recomendadas: 'Vagas Recomendadas',
    perfil:
      dashPanel === 'empresa'
        ? 'Perfil da Empresa'
        : 'Meu Perfil',
    vagas: 'Vagas Publicadas',
    candidatos: 'Candidatos — Ranking IA',
    'nova-vaga': 'Publicar Nova Vaga',
    configuracoes: 'Configurações'
  };

  setText('page-title', titulos[secao] || secao);
}

function initNavigation() {
  document
    .querySelectorAll('.nav-item[data-section]')
    .forEach(item => {
      item.addEventListener('click', evento => {
        evento.preventDefault();
        navigateTo(item.dataset.section);
      });
    });

  document
    .querySelectorAll('[data-section]')
    .forEach(elemento => {
      if (elemento.classList.contains('nav-item')) {
        return;
      }

      elemento.addEventListener('click', evento => {
        evento.preventDefault();
        navigateTo(elemento.dataset.section);
      });
    });

  document
    .getElementById('user-avatar')
    ?.addEventListener('click', () => {
      navigateTo('perfil');
    });

  [
    'btn-nova-vaga-header',
    'btn-nova-vaga-card',
    'btn-nova-vaga-section'
  ].forEach(id => {
    document
      .getElementById(id)
      ?.addEventListener('click', () => {
        navigateTo('nova-vaga');
      });
  });
}

// ============================================================
// TEMA
// ============================================================

function initThemeControl() {
  const botoes = document.querySelectorAll(
    '#btn-theme-toggle, .btn-theme-toggle, ' +
    '#header-theme-toggle, .theme-toggle'
  );

  if (!botoes.length) return;

  const aplicar = tema => {
    const escuro = tema === 'dark';

    if (escuro) {
      document.body.dataset.theme = 'dark';
    } else {
      delete document.body.dataset.theme;
    }

    botoes.forEach(botao => {
      botao.setAttribute(
        'aria-pressed',
        String(escuro)
      );

      const texto = botao.querySelector('span');

      if (texto) {
        texto.textContent = escuro
          ? 'Ativar modo claro'
          : 'Ativar modo escuro';
      }

      botao
        .querySelector('.theme-icon--sun')
        ?.toggleAttribute('hidden', !escuro);

      botao
        .querySelector('.theme-icon--moon')
        ?.toggleAttribute('hidden', escuro);
    });
  };

  aplicar(
    localStorage.getItem(
      'easyintern-dashboard-theme'
    ) || 'light'
  );

  botoes.forEach(botao => {
    botao.addEventListener('click', () => {
      const proximo =
        document.body.dataset.theme === 'dark'
          ? 'light'
          : 'dark';

      aplicar(proximo);

      localStorage.setItem(
        'easyintern-dashboard-theme',
        proximo
      );
    });
  });
}

// ============================================================
// DONUT CHART
// ============================================================

function animateDonut(score) {
  const progresso = document.getElementById(
    'donut-progress'
  );

  const rotulo = document.getElementById(
    'donut-score'
  );

  if (!progresso || !rotulo) return;

  if (
    score === null ||
    score === undefined ||
    !Number.isFinite(Number(score))
  ) {
    progresso.style.strokeDasharray = '0 326.73';
    rotulo.textContent = '—';
    return;
  }

  const numero = Math.max(
    0,
    Math.min(100, Number(score))
  );

  const circunferencia = 2 * Math.PI * 52;
  const preenchimento =
    (numero / 100) * circunferencia;

  progresso.style.stroke = obterCorScore({
    score: numero,
    avaliado: true
  });

  progresso.style.strokeDasharray =
    `${preenchimento} ${circunferencia - preenchimento}`;

  rotulo.textContent = `${Math.round(numero)}%`;
}

// ============================================================
// DASHBOARD DO CANDIDATO
// ============================================================

async function loadCandidatoDashboard() {
  await loadCandidatoStats();
  await carregarPerfilCandidato();
  await loadCandidaturas();
  await loadVagasRecomendadas();
}

async function loadCandidatoStats() {
  try {
    const stats = await apiFetch(API.stats_cand);

    if (!stats) {
      throw new Error('Dados não encontrados.');
    }

    // Valores vindos exclusivamente do MySQL.
    setText(
      'stat-total-c',
      stats.total_candidaturas
    );

    setText(
      'stat-aprovadas-v',
      stats.aprovadas
    );

    setText(
      'stat-analise-v',
      stats.em_analise
    );

    setText(
      'badge-candidaturas',
      stats.total_candidaturas
    );

    setText('stat-taxa-match', '—');

    setText(
      'header-nivel',
      stats.nivel === 'junior'
        ? 'Júnior'
        : 'Estagiário'
    );

    setText('perfil-nome', stats.nome);

    setText(
      'perfil-area',
      stats.area_interesse || 'Não informada'
    );

    setText(
      'perfil-nivel-tag',
      stats.nivel === 'junior'
        ? 'Júnior'
        : 'Estagiário'
    );

    const info = document.getElementById(
      'perfil-info-list'
    );

    if (info) {
      info.innerHTML = [
        stats.cidade && stats.estado
          ? `
            <div class="perfil-info-item">
              <i class="bi bi-geo-alt-fill"></i>
              ${escHtml(stats.cidade)},
              ${escHtml(stats.estado)}
            </div>
          `
          : '',

        `
          <div class="perfil-info-item">
            <i class="bi bi-send-fill"></i>
            ${Number(stats.total_candidaturas) || 0}
            candidatura(s)
          </div>
        `,

        `
          <div class="perfil-info-item">
            <i class="bi bi-check-circle-fill"></i>
            ${Number(stats.aprovadas) || 0}
            aprovação(ões)
          </div>
        `
      ].join('');
    }

    const links = document.getElementById(
      'perfil-links'
    );

    if (links) {
      links.innerHTML = [
        stats.linkedin
          ? `
            <a
              class="perfil-link-btn"
              href="${escHtml(stats.linkedin)}"
              target="_blank"
              rel="noopener noreferrer"
            >
              <i class="bi bi-linkedin"></i>
              LinkedIn
            </a>
          `
          : '',

        stats.github
          ? `
            <a
              class="perfil-link-btn"
              href="${escHtml(stats.github)}"
              target="_blank"
              rel="noopener noreferrer"
            >
              <i class="bi bi-github"></i>
              GitHub
            </a>
          `
          : ''
      ].join('');
    }

  } catch (erro) {
    console.warn(
      'Erro nas estatísticas:',
      erro.message
    );

    showToast(
      'Não foi possível carregar as estatísticas.',
      'error'
    );
  }
}

// ============================================================
// CANDIDATURAS REAIS
// ============================================================

async function loadCandidaturas() {
  try {
    const resultado = await apiFetch(
      API.candidaturas
    );

    if (!Array.isArray(resultado)) {
      throw new Error(
        'Formato inválido da lista de candidaturas.'
      );
    }

    allCandidaturas = resultado;

    renderCandidaturas('todos');
    renderTimeline();

    // Somente candidaturas realmente avaliadas pela IA
    // participam do cálculo da média.
    const avaliadas = allCandidaturas.filter(
      candidatura => scoreValido(candidatura.match)
    );

    const dica = document.getElementById('match-tip');

    if (avaliadas.length) {
      const soma = avaliadas.reduce(
        (total, candidatura) =>
          total + obterScore(candidatura.match),
        0
      );

      const media = soma / avaliadas.length;

      animateDonut(media);
      setText('stat-taxa-match', `${Math.round(media)}%`);

      if (dica) {
        dica.textContent =
          'Compatibilidade média das candidaturas avaliadas pela IA.';
      }
    } else {
      animateDonut(null);
      setText('stat-taxa-match', '—');

      if (dica) {
        dica.textContent =
          'Ainda não existem candidaturas avaliadas pela IA.';
      }
    }

  } catch (erro) {
    console.warn(
      'Erro nas candidaturas:',
      erro.message
    );

    const grid = document.getElementById(
      'candidaturas-grid'
    );

    if (grid) {
      grid.innerHTML = `
        <div class="empty-state">
          <h4>Erro ao carregar candidaturas</h4>
          <p>${escHtml(erro.message)}</p>
        </div>
      `;
    }

    const timeline = document.getElementById(
      'timeline-recente'
    );

    if (timeline) {
      timeline.textContent =
        'Não foi possível carregar a atividade recente.';
    }
  }
}

function renderCandidaturas(filtro = 'todos') {
  const grid = document.getElementById(
    'candidaturas-grid'
  );

  if (!grid) return;

  const filtradas = filtro === 'todos'
    ? allCandidaturas
    : allCandidaturas.filter(
        candidatura => candidatura.status === filtro
      );

  if (!filtradas.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <i
          class="bi bi-send"
          style="font-size:2rem;color:var(--violet-light)"
        ></i>

        <h4>Nenhuma candidatura encontrada.</h4>

        <p>
          Consulte as vagas disponíveis na seção
          "Vagas Recomendadas".
        </p>
      </div>
    `;

    return;
  }

  grid.innerHTML = filtradas.map(candidatura => {
    const match = candidatura.match || {};

    return `
      <div class="cand-card">

        <div style="
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          gap:8px;
        ">
          <div>
            <div style="
              font-size:.9375rem;
              font-weight:700;
              margin-bottom:2px;
            ">
              ${escHtml(candidatura.vaga_titulo)}
            </div>

            <div style="
              font-size:.75rem;
              color:var(--text-muted);
            ">
              ${escHtml(candidatura.empresa_nome)}
            </div>
          </div>

          ${matchBadgeHtml(match)}
        </div>

        <div class="vaga-meta">
          ${modalidadePill(candidatura.modalidade)}

          ${candidatura.cidade
            ? `
              <span class="meta-pill">
                <i class="bi bi-geo-alt"></i>
                ${escHtml(candidatura.cidade)}
                ${candidatura.estado
                  ? `, ${escHtml(candidatura.estado)}`
                  : ''}
              </span>
            `
            : ''}
        </div>

        <div style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          margin-top:4px;
        ">
          ${statusBadge(candidatura.status)}

          <span style="
            font-size:.6875rem;
            color:var(--text-muted);
          ">
            ${formatDate(candidatura.created_at)}
          </span>
        </div>

        ${match.veredicto
          ? `
            <div style="
              font-size:.75rem;
              color:var(--text-muted);
              padding:10px;
              border-radius:8px;
              line-height:1.5;
            ">
              ${escHtml(match.veredicto)}
            </div>
          `
          : ''}

      </div>
    `;
  }).join('');
}

function renderTimeline() {
  const elemento = document.getElementById(
    'timeline-recente'
  );

  if (!elemento) return;

  const recentes = allCandidaturas.slice(0, 5);

  if (!recentes.length) {
    elemento.innerHTML = `
      <p style="
        color:var(--text-muted);
        font-size:.875rem;
      ">
        Nenhuma atividade ainda.
      </p>
    `;
    return;
  }

  elemento.innerHTML = `
    <div class="timeline">

      ${recentes.map(candidatura => `
        <div class="timeline-item">

          <div
            class="timeline-dot"
            style="
              background:${obterCorScore(candidatura.match)};
            "
          ></div>

          <div class="timeline-content">

            <div class="timeline-title">
              ${escHtml(candidatura.vaga_titulo)}
            </div>

            <div class="timeline-sub">
              ${escHtml(candidatura.empresa_nome)}
              ·
              ${statusBadge(candidatura.status)}
              ·
              ${formatDate(candidatura.created_at)}
            </div>

          </div>
        </div>
      `).join('')}

    </div>
  `;
}

// ============================================================
// VAGAS REAIS DO MYSQL
// ============================================================

async function loadVagasRecomendadas() {
  try {
    const vagas = await apiFetch(API.recomendadas);

    if (!Array.isArray(vagas)) {
      throw new Error(
        'Formato inválido da lista de vagas.'
      );
    }

    allVagasRec = vagas;

    renderVagasRec('todos');
    renderTopVagas();

  } catch (erro) {
    console.warn(
      'Erro ao carregar vagas:',
      erro.message
    );

    const grid = document.getElementById(
      'vagas-recomendadas-grid'
    );

    if (grid) {
      grid.innerHTML = `
        <div class="empty-state">
          <h4>Não foi possível carregar as vagas.</h4>
          <p>${escHtml(erro.message)}</p>
        </div>
      `;
    }

    const top = document.getElementById(
      'top-vagas-list'
    );

    if (top) {
      top.textContent =
        'Não foi possível carregar as vagas disponíveis.';
    }
  }
}

function renderVagasRec(filtro = 'todos') {
  const grid = document.getElementById(
    'vagas-recomendadas-grid'
  );

  if (!grid) return;

  const vagas = filtro === 'todos'
    ? allVagasRec
    : allVagasRec.filter(
        vaga => vaga.modalidade === filtro
      );

  setText('rec-count', `${vagas.length} vagas`);

  if (!vagas.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <i
          class="bi bi-stars"
          style="font-size:2rem;color:var(--violet-light)"
        ></i>

        <h4>Nenhuma vaga encontrada.</h4>

        <p>
          Tente mudar o filtro ou aguarde novas vagas.
        </p>
      </div>
    `;
    return;
  }

  grid.innerHTML = vagas.map(vaga => {
    const tags = (vaga.tags || '')
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean)
      .slice(0, 4);

    const descricao = vaga.descricao
      ? `
        <p style="
          font-size:.8125rem;
          color:var(--text-muted);
          line-height:1.6;
          margin:8px 0;
        ">
          ${escHtml(vaga.descricao)}
        </p>
      `
      : '';

    const veredicto =
      scoreValido(vaga.match) &&
      vaga.match?.veredicto
        ? `
          <div style="
            font-size:.75rem;
            color:var(--text-muted);
            line-height:1.5;
          ">
            ${escHtml(vaga.match.veredicto)}
          </div>
        `
        : '';

    const acao = vaga.ja_candidatou
      ? `
        <span
          class="cand-status-badge status-em_analise"
          style="font-size:.7rem;"
        >
          <i class="bi bi-check-circle"></i>
          Já candidatou
        </span>
      `
      : CANDIDATURAS_HABILITADAS
        ? `
          <button
            type="button"
            class="btn btn-primary btn-sm"
            data-candidatar="${Number(vaga.id)}"
          >
            <i class="bi bi-send-fill"></i>
            Candidatar
          </button>
        `
        : `
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            disabled
            title="A API de candidaturas ainda está em desenvolvimento."
          >
            <i class="bi bi-clock-history"></i>
            Candidaturas em breve
          </button>
        `;

    return `
      <div class="vaga-card">

        <div class="vaga-card-header">

          <div>
            <div class="vaga-titulo">
              ${escHtml(vaga.titulo)}
            </div>

            <div class="vaga-empresa">
              ${escHtml(vaga.empresa)}
            </div>
          </div>

          ${matchBadgeHtml(vaga.match)}

        </div>

        <div class="vaga-meta">

          ${modalidadePill(vaga.modalidade)}

          <span class="meta-pill">
            <i class="bi bi-mortarboard"></i>
            ${vaga.nivel === 'junior'
              ? 'Júnior'
              : 'Estagiário'}
          </span>

          ${vaga.cidade
            ? `
              <span class="meta-pill">
                <i class="bi bi-geo-alt"></i>
                ${escHtml(vaga.cidade)}
                ${vaga.estado
                  ? `, ${escHtml(vaga.estado)}`
                  : ''}
              </span>
            `
            : ''}

          <span class="meta-pill">
            <i class="bi bi-cash-coin"></i>
            ${formatarMoeda(vaga.salario_min)}
          </span>

        </div>

        ${tags.length
          ? `
            <div class="vaga-tags">
              ${tags.map(tag => `
                <span class="tag-chip">
                  ${escHtml(tag)}
                </span>
              `).join('')}
            </div>
          `
          : ''}

        ${descricao}

        ${veredicto}

        <div class="vaga-card-footer">
          ${acao}
        </div>

      </div>
    `;
  }).join('');

  if (CANDIDATURAS_HABILITADAS) {
    grid
      .querySelectorAll('[data-candidatar]')
      .forEach(botao => {
        botao.addEventListener('click', () => {
          const id = Number(botao.dataset.candidatar);

          const vaga = allVagasRec.find(
            item => Number(item.id) === id
          );

          if (vaga) {
            abrirModalCandidatura(
              vaga.id,
              vaga.titulo,
              vaga.empresa
            );
          }
        });
      });
  }
}

function renderTopVagas() {
  const elemento = document.getElementById(
    'top-vagas-list'
  );

  if (!elemento) return;

  const vagas = allVagasRec.slice(0, 4);

  if (!vagas.length) {
    elemento.innerHTML = `
      <p style="
        color:var(--text-muted);
        font-size:.875rem;
      ">
        Nenhuma vaga disponível no momento.
      </p>
    `;
    return;
  }

  elemento.innerHTML = vagas.map((vaga, indice) => {
    const avaliado = scoreValido(vaga.match);

    return `
      <div style="
        display:flex;
        align-items:center;
        gap:12px;
        padding:10px 0;
        ${indice < vagas.length - 1
          ? 'border-bottom:1px solid rgba(128,128,128,.15);'
          : ''}
      ">

        <span style="
          font-weight:800;
          color:${obterCorScore(vaga.match)};
          font-size:${avaliado ? '1.1rem' : '.8rem'};
          min-width:60px;
          text-align:center;
        ">
          ${avaliado
            ? scoreTexto(vaga.match)
            : 'Não avaliado'}
        </span>

        <div style="flex:1;min-width:0;">

          <div style="
            font-size:.875rem;
            font-weight:600;
          ">
            ${escHtml(vaga.titulo)}
          </div>

          <div style="
            font-size:.75rem;
            color:var(--text-muted);
          ">
            ${escHtml(vaga.empresa)}
            ·
            ${escHtml(vaga.modalidade)}
          </div>

        </div>

      </div>
    `;
  }).join('');
}

// ============================================================
// MODAL DE CANDIDATURA
// ============================================================

function abrirModalCandidatura(
  vagaId,
  titulo,
  empresa
) {
  if (!CANDIDATURAS_HABILITADAS) {
    showToast(
      'O envio de candidaturas ainda está em desenvolvimento.',
      'info'
    );
    return;
  }

  _pendingVagaId = vagaId;

  const modal = document.getElementById(
    'modal-candidatura'
  );

  const info = document.getElementById(
    'modal-vaga-info'
  );

  if (!modal) return;

  if (info) {
    info.innerHTML = `
      <div style="font-weight:700;">
        ${escHtml(titulo)}
      </div>

      <div style="
        color:var(--text-muted);
        margin-top:4px;
      ">
        ${escHtml(empresa)}
      </div>
    `;
  }

  const mensagem = document.getElementById(
    'cand-mensagem'
  );

  if (mensagem) mensagem.value = '';

  modal.hidden = false;
}

function initCandidaturaModal() {
  const modal = document.getElementById(
    'modal-candidatura'
  );

  const fechar = () => {
    if (modal) modal.hidden = true;
    _pendingVagaId = null;
  };

  document
    .getElementById('modal-cand-close')
    ?.addEventListener('click', fechar);

  document
    .getElementById('btn-cand-cancel')
    ?.addEventListener('click', fechar);

  const confirmar = document.getElementById(
    'btn-cand-confirm'
  );

  confirmar?.addEventListener('click', async () => {
    if (!CANDIDATURAS_HABILITADAS) {
      showToast(
        'O envio de candidaturas ainda não está disponível.',
        'info'
      );
      return;
    }

    if (!_pendingVagaId) return;

    confirmar.disabled = true;

    try {
      await apiFetch(
        API.candidatar,
        {
          id_vaga: _pendingVagaId,
        },
        'POST'
      );

      fechar();

      showToast(
        'Candidatura enviada com sucesso!',
        'success'
      );

      // O MySQL é a fonte oficial dos indicadores.
      await loadCandidatoStats();
      await loadCandidaturas();
      await loadVagasRecomendadas();

    } catch (erro) {
      showToast(
        erro.message || 'Erro ao enviar candidatura.',
        'error'
      );
    } finally {
      confirmar.disabled = false;
    }
  });
}

// ============================================================
// DASHBOARD DA EMPRESA
// ============================================================

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
    setText('badge-vagas', stats.total_vagas);

    const saudacao = document.getElementById(
      'dash-greeting'
    );

    if (saudacao) {
      saudacao.textContent =
        `${stats.empresa} · ${stats.setor || 'Recrutamento'}`;
    }

  } catch (erro) {
    console.warn(
      'Erro nas estatísticas da empresa:',
      erro.message
    );
  }
}

async function loadEmpresaVagas() {
  try {
    const vagas = await apiFetch(API.vagas_emp);

    if (!Array.isArray(vagas)) {
      throw new Error('Lista de vagas inválida.');
    }

    allVagasEmp = vagas;

    setText('badge-vagas', vagas.length);

    renderVagasEmpresaTable(vagas);
    renderVagasEmpresaGrid('todas');
    populateVagaSelector();

  } catch (erro) {
    console.warn(
      'Erro nas vagas da empresa:',
      erro.message
    );
  }
}

function renderVagasEmpresaTable(vagas) {
  const container = document.getElementById(
    'vagas-table-wrap'
  );

  if (!container) return;

  if (!vagas.length) {
    container.innerHTML = `
      <div class="empty-state-small">
        Nenhuma vaga publicada ainda.
      </div>
    `;
    return;
  }

  container.innerHTML = `
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
        ${vagas.slice(0, 8).map(vaga => `
          <tr>
            <td>
              <strong>
                ${escHtml(vaga.titulo)}
              </strong>
            </td>

            <td>
              ${vaga.nivel === 'junior'
                ? 'Júnior'
                : 'Estagiário'}
            </td>

            <td>
              ${modalidadePill(vaga.modalidade)}
            </td>

            <td>
              ${statusBadge(
                vaga.status === 'aberta'
                  ? 'aprovado'
                  : 'reprovado'
              )}
            </td>

            <td>
              ${Number(vaga.total_candidatos) || 0}
            </td>

            <td>
              <button
                class="btn btn-primary btn-sm"
                data-abrir-ranking="${Number(vaga.id)}"
              >
                Ver Ranking
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container
    .querySelectorAll('[data-abrir-ranking]')
    .forEach(botao => {
      botao.addEventListener('click', () => {
        const id = Number(
          botao.dataset.abrirRanking
        );

        const vaga = allVagasEmp.find(
          item => Number(item.id) === id
        );

        loadCandidatosVaga(
          id,
          vaga?.titulo || ''
        );
      });
    });
}

function renderVagasEmpresaGrid(filtro = 'todas') {
  const grid = document.getElementById(
    'vagas-empresa-grid'
  );

  if (!grid) return;

  const vagas = filtro === 'todas'
    ? allVagasEmp
    : allVagasEmp.filter(
        vaga => vaga.status === filtro
      );

  if (!vagas.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <h4>Nenhuma vaga encontrada.</h4>
      </div>
    `;
    return;
  }

  grid.innerHTML = vagas.map(vaga => `
    <div class="vaga-card">

      <div class="vaga-card-header">
        <div>
          <div class="vaga-titulo">
            ${escHtml(vaga.titulo)}
          </div>

          <div class="vaga-empresa">
            ${vaga.nivel === 'junior'
              ? 'Júnior'
              : 'Estagiário'}
            · ${escHtml(vaga.modalidade)}
          </div>
        </div>

        <span class="cand-status-badge">
          ${escHtml(vaga.status)}
        </span>
      </div>

      <div class="vaga-meta">
        <span class="meta-pill">
          <i class="bi bi-people-fill"></i>
          ${Number(vaga.total_candidatos) || 0}
          candidato(s)
        </span>
      </div>

      <div class="vaga-card-footer">
        <button
          class="btn btn-primary btn-sm"
          data-ranking="${Number(vaga.id)}"
        >
          <i class="bi bi-cpu"></i>
          Ranking IA
        </button>
      </div>

    </div>
  `).join('');

  grid
    .querySelectorAll('[data-ranking]')
    .forEach(botao => {
      botao.addEventListener('click', () => {
        const id = Number(botao.dataset.ranking);

        const vaga = allVagasEmp.find(
          item => Number(item.id) === id
        );

        loadCandidatosVaga(
          id,
          vaga?.titulo || ''
        );
      });
    });
}

function populateVagaSelector() {
  const seletor = document.getElementById(
    'select-vaga-cands'
  );

  if (!seletor) return;

  seletor.innerHTML = `
    <option value="">
      — Selecione uma vaga —
    </option>
  ` + allVagasEmp.map(vaga => `
    <option value="${Number(vaga.id)}">
      ${escHtml(vaga.titulo)}
      (${Number(vaga.total_candidatos) || 0} candidatos)
    </option>
  `).join('');

  seletor.onchange = () => {
    if (seletor.value) {
      loadCandidatosVaga(
        Number(seletor.value),
        seletor.selectedOptions[0]?.text || ''
      );
    }
  };
}

async function loadCandidatosVaga(
  vagaId,
  titulo = ''
) {
  currentVagaIdCandidatos = vagaId;

  navigateTo('candidatos');

  const seletor = document.getElementById(
    'select-vaga-cands'
  );

  if (seletor) {
    seletor.value = String(vagaId);
  }

  const ranking = document.getElementById(
    'candidatos-ranking'
  );

  const overview = document.getElementById(
    'top-candidatos-overview'
  );

  if (ranking) {
    ranking.textContent = 'Carregando candidatos...';
  }

  try {
    const candidatos = await apiFetch(
      API.candidatos_vaga(vagaId)
    );

    if (!Array.isArray(candidatos)) {
      throw new Error(
        'Lista de candidatos inválida.'
      );
    }

    if (!candidatos.length) {
      if (ranking) {
        ranking.innerHTML = `
          <div class="empty-state">
            <h4>Nenhum candidato inscrito ainda.</h4>
          </div>
        `;
      }

      if (overview) {
        overview.textContent =
          `Nenhum candidato para ${titulo}.`;
      }

      return;
    }

    if (ranking) {
      ranking.innerHTML = candidatos.map(
        (candidato, indice) => `
          <div class="ranking-card"
               data-candidato-indice="${indice}">

            <span class="ranking-pos">
              ${indice + 1}°
            </span>

            <div class="ranking-avatar">
              <i class="bi bi-person-fill"></i>
            </div>

            <div class="ranking-info">
              <div class="ranking-nome">
                ${escHtml(candidato.nome)}
              </div>

              <div class="ranking-sub">
                ${escHtml(
                  candidato.area_interesse ||
                  'Não informado'
                )}
                · ${statusBadge(candidato.status)}
              </div>
            </div>

            <div class="ranking-score-wrap">
              ${scoreBarHtml(
                obterScore(candidato.match),
                obterCorScore(candidato.match)
              )}
            </div>
          </div>
        `
      ).join('');

      ranking
        .querySelectorAll('[data-candidato-indice]')
        .forEach(card => {
          card.addEventListener('click', () => {
            const indice = Number(
              card.dataset.candidatoIndice
            );

            const candidato = candidatos[indice];

            abrirDetalhesCandidato(
              candidato,
              candidato.candidatura_id
            );
          });
        });
    }

    if (overview) {
      overview.innerHTML = candidatos
        .slice(0, 5)
        .map(candidato => `
          <div style="padding:8px 0;">
            <strong>
              ${escHtml(candidato.nome)}
            </strong>
            · ${scoreTexto(candidato.match)}
          </div>
        `).join('');
    }

    animateScoreBars();

  } catch (erro) {
    if (ranking) {
      ranking.textContent =
        'Não foi possível carregar o ranking.';
    }

    showToast(erro.message, 'error');
  }
}

// ============================================================
// DETALHES DO CANDIDATO — EMPRESA
// ============================================================

function abrirDetalhesCandidato(
  candidato,
  candidaturaId
) {
  currentCandidaturaId = candidaturaId;

  const modal = document.getElementById(
    'modal-candidato'
  );

  const corpo = document.getElementById(
    'modal-candidato-body'
  );

  const seletor = document.getElementById(
    'select-status-cand'
  );

  if (!modal || !corpo) return;

  if (seletor) {
    seletor.value = candidato.status || 'pendente';
  }

  const match = candidato.match || {};

  corpo.innerHTML = `
    <div class="ranking-card">
      <div class="ranking-avatar">
        <i class="bi bi-person-fill"></i>
      </div>

      <div class="ranking-info">
        <div class="ranking-nome">
          ${escHtml(candidato.nome)}
        </div>

        <div class="ranking-sub">
          ${escHtml(
            candidato.area_interesse ||
            'Não informado'
          )}
        </div>

        <div>
          ${statusBadge(candidato.status)}
        </div>
      </div>

      <div class="ranking-score-wrap">
        ${scoreTexto(match)}
      </div>
    </div>

    ${match.veredicto
      ? `
        <div style="margin-top:16px;">
          <strong>Veredito da IA</strong>
          <p>${escHtml(match.veredicto)}</p>
        </div>
      `
      : ''}
  `;

  modal.hidden = false;
}

function initCandidatoModal() {
  const modal = document.getElementById(
    'modal-candidato'
  );

  document
    .getElementById('modal-cand-close')
    ?.addEventListener('click', () => {
      if (modal) modal.hidden = true;
    });

  const salvar = document.getElementById(
    'btn-salvar-status'
  );

  const seletor = document.getElementById(
    'select-status-cand'
  );

  salvar?.addEventListener('click', async () => {
    if (!currentCandidaturaId || !seletor) return;

    salvar.disabled = true;

    try {
      await apiFetch(
        API.update_status(currentCandidaturaId),
        { status: seletor.value },
        'PATCH'
      );

      showToast(
        'Status atualizado com sucesso!',
        'success'
      );

      if (modal) modal.hidden = true;

      if (currentVagaIdCandidatos) {
        await loadCandidatosVaga(
          currentVagaIdCandidatos
        );
      }

    } catch (erro) {
      showToast(erro.message, 'error');
    } finally {
      salvar.disabled = false;
    }
  });
}

// ============================================================
// CRIAÇÃO DE VAGAS — EMPRESA
// ============================================================

function initFormNovaVaga() {
  const formulario = document.getElementById(
    'form-nova-vaga'
  );

  const feedback = document.getElementById(
    'form-vaga-feedback'
  );

  document
    .getElementById('btn-cancelar-vaga')
    ?.addEventListener('click', () => {
      navigateTo('vagas');
    });

  formulario?.addEventListener('submit', async evento => {
    evento.preventDefault();

    const botao = document.getElementById(
      'btn-publicar-vaga'
    );

    if (botao) botao.disabled = true;
    if (feedback) feedback.hidden = true;

    const valor = id =>
      document.getElementById(id)?.value?.trim() || '';

    const bolsa = valor('vaga-salario-min');

    const dados = {
      titulo: valor('vaga-titulo'),
      descricao: valor('vaga-descricao'),
      requisitos: valor('vaga-requisitos') || null,
      beneficios: valor('vaga-beneficios') || null,
      tags: valor('vaga-tags') || null,
      nivel: valor('vaga-nivel'),
      modalidade: valor('vaga-modalidade'),
      cidade: valor('vaga-cidade') || null,
      estado:
        valor('vaga-estado').toUpperCase() || null,
      salario_min:
        bolsa ? Number(bolsa) : null
    };

    try {
      await apiFetch(
        API.criar_vaga,
        dados,
        'POST'
      );

      showToast(
        'Vaga publicada com sucesso!',
        'success'
      );

      formulario.reset();

      await loadEmpresaStats();
      await loadEmpresaVagas();

      navigateTo('vagas');

    } catch (erro) {
      if (feedback) {
        feedback.hidden = false;
        feedback.className = 'form-feedback error';
        feedback.textContent = erro.message;
      }
    } finally {
      if (botao) botao.disabled = false;
    }
  });
}

async function fecharVaga(vagaId) {
  if (!confirm(
    'Tem certeza que deseja encerrar esta vaga?'
  )) {
    return;
  }

  try {
    await apiFetch(
      API.fechar_vaga(vagaId),
      null,
      'DELETE'
    );

    showToast('Vaga encerrada.', 'success');

    await loadEmpresaStats();
    await loadEmpresaVagas();

  } catch (erro) {
    showToast(erro.message, 'error');
  }
}

// ============================================================
// FILTROS
// ============================================================

function initFilters() {
  document
    .querySelectorAll('.filter-btn[data-filter]')
    .forEach(botao => {
      botao.addEventListener('click', () => {
        document
          .querySelectorAll('.filter-btn[data-filter]')
          .forEach(item => {
            item.classList.remove('active');
          });

        botao.classList.add('active');

        renderCandidaturas(
          botao.dataset.filter
        );
      });
    });

  document
    .querySelectorAll('.filter-btn[data-rec-filter]')
    .forEach(botao => {
      botao.addEventListener('click', () => {
        document
          .querySelectorAll('.filter-btn[data-rec-filter]')
          .forEach(item => {
            item.classList.remove('active');
          });

        botao.classList.add('active');

        renderVagasRec(
          botao.dataset.recFilter
        );
      });
    });

  document
    .querySelectorAll('.filter-btn[data-vaga-filter]')
    .forEach(botao => {
      botao.addEventListener('click', () => {
        document
          .querySelectorAll('.filter-btn[data-vaga-filter]')
          .forEach(item => {
            item.classList.remove('active');
          });

        botao.classList.add('active');

        renderVagasEmpresaGrid(
          botao.dataset.vagaFilter
        );
      });
    });
}

// ============================================================
// PERSONALIZAÇÃO DO DASHBOARD
// ============================================================

function getProfileStorageKey(prefixo) {
  let identificador = dashPanel || 'candidato';

  try {
    const usuario = JSON.parse(
      localStorage.getItem('easyintern_user') ||
      localStorage.getItem('ag_user') ||
      'null'
    );

    if (usuario?.email) {
      identificador = usuario.email
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_');
    }
  } catch {
    // Usa o tipo de painel como identificador.
  }

  return `${prefixo}_${identificador}`;
}

function getDynamicStats() {
  // Indicadores reais nunca são sobrescritos
  // por valores fictícios do localStorage.
  return {};
}

function saveDynamicStats() {
  // Mantida apenas para compatibilidade.
  // Não grava estatísticas profissionais locais.
}

function incrementCandidateDynamicStats() {
  // Não incrementa contadores fictícios.
  // As estatísticas devem ser recarregadas da API.
  return loadCandidatoStats();
}

function incrementEmpresaDynamicStats() {
  return loadEmpresaStats();
}

function initNumberFlowStats() {
  document
    .querySelectorAll('[data-number-flow-stat]')
    .forEach(container => {
      const flow = container.querySelector(
        'number-flow'
      );

      if (!flow) return;

      flow.format = {
        maximumFractionDigits: 0
      };

      flow.animated = true;
    });
}

function initDashboardDragAndDrop() {
  const chave = getProfileStorageKey(
    'easyintern_order'
  );

  try {
    const salvo = JSON.parse(
      localStorage.getItem(chave) || '{}'
    );

    Object.entries(salvo).forEach(
      ([idContainer, ids]) => {
        const container = document.getElementById(
          idContainer
        );

        if (!container || !Array.isArray(ids)) {
          return;
        }

        ids.forEach(id => {
          const elemento = document.getElementById(id);

          if (
            elemento &&
            elemento.parentElement === container
          ) {
            container.appendChild(elemento);
          }
        });
      }
    );
  } catch {
    // Mantém a ordem original.
  }

  const salvarOrdem = () => {
    const dados = {};

    [
      'stats-grid',
      'dash-widgets-grid',
      'section-overview'
    ].forEach(id => {
      const container = document.getElementById(id);

      if (!container) return;

      dados[id] = Array.from(
        container.children
      )
        .filter(item =>
          item.classList.contains('draggable-card')
        )
        .map(item => item.id);
    });

    localStorage.setItem(
      chave,
      JSON.stringify(dados)
    );
  };

  let arrastando = null;

  document
    .querySelectorAll('.draggable-card')
    .forEach(card => {
      card.draggable = true;

      card.addEventListener('dragstart', evento => {
        arrastando = card;
        card.classList.add('is-dragging');
        evento.dataTransfer.effectAllowed = 'move';
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        arrastando = null;
        salvarOrdem();
      });

      card.addEventListener('dragover', evento => {
        evento.preventDefault();
      });

      card.addEventListener('drop', evento => {
        evento.preventDefault();

        if (
          !arrastando ||
          arrastando === card ||
          arrastando.parentElement !== card.parentElement
        ) {
          return;
        }

        const metade =
          card.getBoundingClientRect().height / 2;

        const depois =
          evento.clientY -
          card.getBoundingClientRect().top >
          metade;

        if (depois) {
          card.parentElement.insertBefore(
            arrastando,
            card.nextSibling
          );
        } else {
          card.parentElement.insertBefore(
            arrastando,
            card
          );
        }

        salvarOrdem();
      });
    });
}

// ============================================================
// CARROSSEL DOS INDICADORES
// ============================================================

function setupDashboardCarousel(
  modo = 'grid',
  modelo = 'panoramic',
  autoplay = false
) {
  const grid = document.getElementById(
    'stats-grid'
  );

  if (!grid) return;

  if (_dashCarouselAutoplayTimer) {
    clearInterval(_dashCarouselAutoplayTimer);
    _dashCarouselAutoplayTimer = null;
  }

  let wrapper = document.querySelector(
    '.stats-carousel-wrapper'
  );

  if (modo === 'grid') {
    if (wrapper) {
      wrapper
        .querySelectorAll('.stat-card')
        .forEach(card => {
          grid.appendChild(card);
        });

      wrapper.remove();
    }

    grid.style.display = 'grid';
    return;
  }

  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'stats-carousel-wrapper';

    wrapper.innerHTML = `
      <div class="stats-carousel-header">
        <span class="stats-carousel-title">
          Indicadores em Carrossel
        </span>
      </div>

      <div class="stats-carousel-container">
        <div
          class="stats-carousel-track"
          id="dash-carousel-track"
        ></div>
      </div>

      <div class="carousel-controls">
        <button
          type="button"
          class="carousel-nav-btn prev"
          id="carousel-btn-prev"
        >
          <i class="bi bi-chevron-left"></i>
        </button>

        <div
          class="carousel-dots"
          id="carousel-dots-container"
        ></div>

        <button
          type="button"
          class="carousel-nav-btn next"
          id="carousel-btn-next"
        >
          <i class="bi bi-chevron-right"></i>
        </button>
      </div>
    `;

    grid.parentElement.insertBefore(
      wrapper,
      grid
    );
  }

  grid.style.display = 'none';

  const track = wrapper.querySelector(
    '#dash-carousel-track'
  );

  track.className =
    `stats-carousel-track mode-${modelo}`;

  grid.querySelectorAll('.stat-card').forEach(card => {
    track.appendChild(card);
  });

  const cards = Array.from(
    track.querySelectorAll('.stat-card')
  );

  const anterior = wrapper.querySelector(
    '#carousel-btn-prev'
  );

  const proximo = wrapper.querySelector(
    '#carousel-btn-next'
  );

  const pontos = wrapper.querySelector(
    '#carousel-dots-container'
  );

  let indice = 0;

  const maximo = () =>
    Math.max(0, cards.length - 1);

  const mostrar = novoIndice => {
    indice = Math.max(
      0,
      Math.min(novoIndice, maximo())
    );

    const card = cards[indice];

    if (card) {
      track.style.transform =
        `translateX(-${card.offsetLeft}px)`;
    }

    if (anterior) {
      anterior.disabled = indice === 0;
    }

    if (proximo) {
      proximo.disabled = indice === maximo();
    }

    if (pontos) {
      pontos.innerHTML = '';

      cards.forEach((_, posicao) => {
        const ponto = document.createElement('button');

        ponto.type = 'button';
        ponto.className =
          'carousel-dot' +
          (posicao === indice ? ' active' : '');

        ponto.addEventListener('click', () => {
          mostrar(posicao);
        });

        pontos.appendChild(ponto);
      });
    }
  };

  if (anterior) {
    anterior.onclick = () => mostrar(indice - 1);
  }

  if (proximo) {
    proximo.onclick = () => mostrar(indice + 1);
  }

  if (autoplay && cards.length > 1) {
    _dashCarouselAutoplayTimer = setInterval(() => {
      mostrar(
        indice >= maximo()
          ? 0
          : indice + 1
      );
    }, 4000);
  }

  mostrar(0);
}

function initEditDashboardsPanel() {
  const chaveVisibilidade = getProfileStorageKey(
    'easyintern_visibility'
  );

  const chaveModo = getProfileStorageKey(
    'easyintern_dash_mode'
  );

  const chaveModelo = getProfileStorageKey(
    'easyintern_carousel_model'
  );

  const chaveAutoplay = getProfileStorageKey(
    'easyintern_carousel_autoplay'
  );

  let visibilidade = {};

  try {
    visibilidade = JSON.parse(
      localStorage.getItem(chaveVisibilidade) || '{}'
    );
  } catch {
    visibilidade = {};
  }

  document
    .querySelectorAll(
      '.edit-dash-switch input[data-target-widget]'
    )
    .forEach(toggle => {
      const id = toggle.dataset.targetWidget;
      const elemento = document.getElementById(id);

      if (visibilidade[id] !== undefined) {
        toggle.checked = visibilidade[id];

        if (elemento) {
          elemento.style.display =
            toggle.checked ? '' : 'none';
        }
      }

      toggle.addEventListener('change', () => {
        visibilidade[id] = toggle.checked;

        if (elemento) {
          elemento.style.display =
            toggle.checked ? '' : 'none';
        }

        localStorage.setItem(
          chaveVisibilidade,
          JSON.stringify(visibilidade)
        );
      });
    });

  let modo = localStorage.getItem(chaveModo) ||
    'grid';

  let modelo = localStorage.getItem(chaveModelo) ||
    'panoramic';

  let autoplay =
    localStorage.getItem(chaveAutoplay) === 'true';

  const aplicar = () => {
    document
      .querySelectorAll(
        '.edit-dash-mode-card[data-mode]'
      )
      .forEach(card => {
        card.classList.toggle(
          'active',
          card.dataset.mode === modo
        );
      });

    document
      .querySelectorAll(
        '.carousel-chip[data-carousel-model]'
      )
      .forEach(chip => {
        chip.classList.toggle(
          'active',
          chip.dataset.carouselModel === modelo
        );
      });

    const subopcoes = document.getElementById(
      'carousel-suboptions'
    );

    if (subopcoes) {
      subopcoes.style.display =
        modo === 'carousel' ? 'flex' : 'none';
    }

    const toggle = document.getElementById(
      'toggle-carousel-autoplay'
    );

    if (toggle) toggle.checked = autoplay;

    setupDashboardCarousel(
      modo,
      modelo,
      autoplay
    );
  };

  document
    .querySelectorAll(
      '.edit-dash-mode-card[data-mode]'
    )
    .forEach(card => {
      card.addEventListener('click', () => {
        modo = card.dataset.mode;

        localStorage.setItem(
          chaveModo,
          modo
        );

        aplicar();
      });
    });

  document
    .querySelectorAll(
      '.carousel-chip[data-carousel-model]'
    )
    .forEach(chip => {
      chip.addEventListener('click', () => {
        modelo = chip.dataset.carouselModel;

        localStorage.setItem(
          chaveModelo,
          modelo
        );

        aplicar();
      });
    });

  document
    .getElementById('toggle-carousel-autoplay')
    ?.addEventListener('change', evento => {
      autoplay = evento.target.checked;

      localStorage.setItem(
        chaveAutoplay,
        String(autoplay)
      );

      aplicar();
    });

  document
    .getElementById('btn-reset-dash-order')
    ?.addEventListener('click', () => {
      [
        chaveVisibilidade,
        chaveModo,
        chaveModelo,
        chaveAutoplay,
        getProfileStorageKey('easyintern_order'),
        getProfileStorageKey('easyintern_dyn_stats')
      ].forEach(chave => {
        localStorage.removeItem(chave);
      });

      showToast(
        'Configurações restauradas.',
        'success'
      );

      window.location.reload();
    });

  aplicar();
}

// ============================================================
// MODAL DE ACESSO MOBILE
// ============================================================

function initMobileModal() {
  const botao = document.getElementById(
    'btn-mobile-modal'
  );

  const modal = document.getElementById(
    'modal-mobile'
  );

  if (!botao || !modal) return;

  botao.addEventListener('click', async () => {
    modal.hidden = false;

    try {
      const dados = await fetch('/api/network-info');

      if (!dados.ok) return;

      const info = await dados.json();

      const texto = document.getElementById(
        'mobile-url-text'
      );

      if (texto) {
        texto.textContent =
          info.access_url ||
          info.mobile_network_url ||
          '';
      }

      const imagem = document.getElementById(
        'qr-code-img'
      );

      if (imagem && info.qr_code_url) {
        imagem.src = info.qr_code_url;
      }

    } catch (erro) {
      console.warn(
        'Informações de rede indisponíveis:',
        erro.message
      );
    }
  });

  [
    'modal-mob-close',
    'btn-mob-ok'
  ].forEach(id => {
    document
      .getElementById(id)
      ?.addEventListener('click', () => {
        modal.hidden = true;
      });
  });

  document
    .getElementById('btn-copy-mobile-link')
    ?.addEventListener('click', async () => {
      const link = document
        .getElementById('mobile-url-text')
        ?.textContent?.trim();

      if (!link) return;

      try {
        await navigator.clipboard.writeText(link);

        showToast(
          'Link copiado com sucesso!',
          'success'
        );
      } catch {
        showToast(
          'Não foi possível copiar o link.',
          'error'
        );
      }
    });
}

// ============================================================
// INICIALIZAÇÃO PRINCIPAL
// ============================================================

async function init() {
  const autenticado = await authGuard();

  if (!autenticado) return;

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

  initNumberFlowStats();
  initDashboardDragAndDrop();
  initEditDashboardsPanel();
}

document.addEventListener(
  'DOMContentLoaded',
  init
);

// ============================================================
// PERFIL EDITÁVEL DO CANDIDATO
// GET e PATCH /dashboard/api/candidato/perfil
// ============================================================

let perfilCandidatoAtual = null;
let salvandoPerfilCandidato = false;

function campoPerfil(id) {
  return document.getElementById(id);
}

function feedbackPerfil(mensagem, erro = false) {
  const feedback = campoPerfil('perfil-feedback');

  if (!feedback) return;

  feedback.textContent = mensagem;
  feedback.style.color = erro
    ? '#ef6464'
    : '#20b479';
}

// Preenche o formulário com os dados do banco.
function preencherFormularioPerfil(perfil) {
  const campos = {
    'edit-nome': perfil.nome_completo,
    'edit-telefone': perfil.telefone,
    'edit-cidade': perfil.cidade,
    'edit-uf': perfil.uf,
    'edit-nivel': perfil.nivel_carreira,
    'edit-linkedin': perfil.linkedin_url,
    'edit-github': perfil.github_url,
    'edit-biografia': perfil.biografia
  };

  Object.entries(campos).forEach(([id, valor]) => {
    const elemento = campoPerfil(id);

    if (elemento) {
      elemento.value = valor ?? '';
    }
  });
}

// Atualiza a visualização do perfil.
function exibirDadosPerfil(perfil) {
  setText(
    'perfil-nome',
    perfil.nome_completo || 'Nome não informado'
  );

  const nivel = perfil.nivel_carreira || 'Não informado';

  setText('perfil-nivel-tag', nivel);
  setText('header-nivel', nivel);

  const links = campoPerfil('perfil-links');

  if (links) {
    links.replaceChildren();

    const adicionarLink = (url, nome, icone) => {
      if (!url) return;

      let destino;

      try {
        destino = new URL(url);
      } catch {
        return;
      }

      if (!['http:', 'https:'].includes(destino.protocol)) {
        return;
      }

      const link = document.createElement('a');
      link.className = 'perfil-link-btn';
      link.href = destino.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';

      const simbolo = document.createElement('i');
      simbolo.className = `bi ${icone}`;

      link.appendChild(simbolo);
      link.appendChild(document.createTextNode(` ${nome}`));

      links.appendChild(link);
    };

    adicionarLink(
      perfil.linkedin_url,
      'LinkedIn',
      'bi-linkedin'
    );

    adicionarLink(
      perfil.github_url,
      'GitHub',
      'bi-github'
    );
  }
}

// Consulta o perfil autenticado no banco.
async function carregarPerfilCandidato() {
  const perfil = await apiFetch(API.perfil_cand);

  if (!perfil || !perfil.id_candidato) {
    throw new Error('Não foi possível carregar o perfil.');
  }

  perfilCandidatoAtual = perfil;

  exibirDadosPerfil(perfil);

  return perfil;
}

// Abre o formulário de edição.
async function abrirEdicaoPerfil() {
  const botao = campoPerfil('btn-editar-perfil');
  const formulario = campoPerfil('form-editar-perfil');

  if (!botao || !formulario) return;

  botao.disabled = true;
  feedbackPerfil('Carregando informações...');

  try {
    const perfil = await carregarPerfilCandidato();

    preencherFormularioPerfil(perfil);

    formulario.hidden = false;
    botao.hidden = true;

    feedbackPerfil('');
  } catch (erro) {
    feedbackPerfil(
      erro.message || 'Erro ao carregar o perfil.',
      true
    );
  } finally {
    botao.disabled = false;
  }
}

// Fecha o formulário sem salvar.
function cancelarEdicaoPerfil() {
  const formulario = campoPerfil('form-editar-perfil');
  const botao = campoPerfil('btn-editar-perfil');

  if (salvandoPerfilCandidato) return;

  if (formulario) formulario.hidden = true;
  if (botao) botao.hidden = false;

  feedbackPerfil('');
}

// Monta os dados para a API PATCH.
function coletarDadosPerfil() {
  const valor = (id) =>
    campoPerfil(id)?.value.trim() ?? '';

  const nome = valor('edit-nome');
  const nivel = valor('edit-nivel');

  if (nome.length < 3) {
    throw new Error(
      'Informe um nome com pelo menos 3 caracteres.'
    );
  }

  const uf = valor('edit-uf').toUpperCase();

  if (uf && !/^[A-Z]{2}$/.test(uf)) {
    throw new Error('Informe uma UF válida.');
  }

  const dados = {
    nome_completo: nome,
    telefone: valor('edit-telefone') || null,
    cidade: valor('edit-cidade') || null,
    uf: uf || null,
    nivel_carreira: nivel || null,
    linkedin_url: valor('edit-linkedin') || null,
    github_url: valor('edit-github') || null,
    biografia: valor('edit-biografia') || null
  };

  // Envia apenas os campos que mudaram.
  if (perfilCandidatoAtual) {
    Object.keys(dados).forEach((campo) => {
      const anterior = perfilCandidatoAtual[campo] ?? null;
      const novo = dados[campo];

      if (anterior === novo) {
        delete dados[campo];
      }
    });
  }

  return dados;
}

// Envia as alterações para o MySQL.
async function salvarEdicaoPerfil(evento) {
  evento.preventDefault();

  if (salvandoPerfilCandidato) return;

  const formulario = campoPerfil('form-editar-perfil');
  const botaoSalvar = campoPerfil('btn-salvar-perfil');

  if (!formulario?.reportValidity()) return;

  let dados;

  try {
    dados = coletarDadosPerfil();
  } catch (erro) {
    feedbackPerfil(erro.message, true);
    return;
  }

  if (Object.keys(dados).length === 0) {
    feedbackPerfil('Nenhuma alteração foi realizada.');
    return;
  }

  salvandoPerfilCandidato = true;

  if (botaoSalvar) {
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = 'Salvando...';
  }

  feedbackPerfil('Salvando alterações...');

  try {
    await apiFetch(
      API.perfil_cand,
      dados,
      'PATCH'
    );

    // Busca os valores realmente salvos no banco.
    await carregarPerfilCandidato();

    // Recarrega indicadores e informações do dashboard.
    await loadCandidatoStats();

    // Garante os dados atuais do perfil após os indicadores.
    exibirDadosPerfil(perfilCandidatoAtual);

    formulario.hidden = true;

    const botaoEditar = campoPerfil('btn-editar-perfil');
    if (botaoEditar) botaoEditar.hidden = false;

    feedbackPerfil('');

    showToast('Perfil atualizado com sucesso!');
  } catch (erro) {
    feedbackPerfil(
      erro.message || 'Erro ao salvar o perfil.',
      true
    );
  } finally {
    salvandoPerfilCandidato = false;

    if (botaoSalvar) {
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = 'Salvar alterações';
    }
  }
}

// Registra os eventos do formulário.
function iniciarEdicaoPerfilCandidato() {
  if (document.body.dataset.panel !== 'candidato') {
    return;
  }

  const botaoEditar = campoPerfil('btn-editar-perfil');
  const botaoCancelar = campoPerfil('btn-cancelar-perfil');
  const formulario = campoPerfil('form-editar-perfil');

  if (!botaoEditar || !botaoCancelar || !formulario) {
    return;
  }

  botaoEditar.addEventListener(
    'click',
    abrirEdicaoPerfil
  );

  botaoCancelar.addEventListener(
    'click',
    cancelarEdicaoPerfil
  );

  formulario.addEventListener(
    'submit',
    salvarEdicaoPerfil
  );
}

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    iniciarEdicaoPerfilCandidato
  );
} else {
  iniciarEdicaoPerfilCandidato();
}