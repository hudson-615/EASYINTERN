/**
 * zero-g-auth.js — SPA de autenticação: Fetch API + validação em tempo real.
 *
 * Responsabilidades:
 *  - Troca de painéis (Login ↔ Candidato ↔ Empresa)
 *  - Validação de campos em tempo real
 *  - Password strength meter
 *  - Comunicação com a API FastAPI
 *  - Armazenamento do JWT no localStorage
 *  - Sistema seguro de toasts
 *  - Integração com o menu Rotary via evento ag:navigate
 */

(function ZeroGAuth() {
  'use strict';

  /* ── Configuração da API ───────────────────────────────────────────── */

  const API = {
    login: '/api/auth/login',
    registerCandidato: '/api/auth/register/candidato',
    registerEmpresa: '/api/auth/register/empresa',
    me: '/api/auth/me',
    dataAreas: '/api/data/areas-de-interesse',
    dataEixos: '/api/data/eixos',
    dataDestaques: '/api/data/destaques',
  };

  const TOKEN_KEY = 'easyintern_token';
  const TOKEN_KEY_LEGACY = 'ag_token';
  const USER_KEY = 'easyintern_user';

  /* ── Helpers de storage ────────────────────────────────────────────── */

  const store = {
    setToken(token) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_KEY_LEGACY, token);
    },

    getToken() {
      return (
        localStorage.getItem(TOKEN_KEY) ||
        localStorage.getItem(TOKEN_KEY_LEGACY)
      );
    },

    clearToken() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY_LEGACY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem('ag_user');
    },

    setUser(user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    },

    getUser() {
      try {
        const user =
          localStorage.getItem(USER_KEY) ||
          localStorage.getItem('ag_user');

        return user ? JSON.parse(user) : null;
      } catch {
        return null;
      }
    },
  };

  /* ── Comunicação com a API ─────────────────────────────────────────── */

  async function apiFetch(url, body = null, method = 'POST') {
    const headers = {
      Accept: 'application/json',
    };

    if (body !== null && body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const token = store.getToken();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response;

    try {
      response = await fetch(url, {
        method,
        headers,
        body:
          body !== null && body !== undefined
            ? JSON.stringify(body)
            : undefined,
      });
    } catch {
      throw new Error(
        'Não foi possível conectar ao servidor. Verifique se o backend está funcionando.'
      );
    }

    const contentType = response.headers.get('content-type') || '';

    let data = {};

    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch {
        throw new Error('O servidor retornou uma resposta inválida.');
      }
    } else {
      const responseText = await response.text();

      if (responseText) {
        data = {
          detail: responseText,
        };
      }
    }

    if (!response.ok) {
      const detail = data?.detail || data?.message;

      let message = `Erro ${response.status} ao comunicar com o servidor.`;

      if (typeof detail === 'string') {
        message = detail;
      } else if (Array.isArray(detail)) {
        message = detail
          .map(item => item.msg || 'Dados inválidos.')
          .join(' · ');
      }

      throw new Error(message);
    }

    return data;
  }

  /* ════════════════════════════════════════════════════════════════════
     SISTEMA DE PAINÉIS
  ════════════════════════════════════════════════════════════════════ */

  const panels = {
    login: document.getElementById('panel-login'),
    candidato: document.getElementById('panel-candidato'),
    empresa: document.getElementById('panel-empresa'),
  };

  const tabs = {
    login: document.getElementById('tab-login'),
    candidato: document.getElementById('tab-candidato'),
    empresa: document.getElementById('tab-empresa'),
  };

  let activePanel = 'login';

  function switchPanel(name) {
    if (!panels[name] || name === activePanel) return;

    const current = panels[activePanel];

    if (current) {
      current.style.opacity = '0';
      current.style.transform = 'translateY(12px) scale(0.98)';
      current.style.transition =
        'opacity 200ms ease, transform 200ms ease';

      setTimeout(() => {
        current.hidden = true;
        current.style.opacity = '';
        current.style.transform = '';
        current.style.transition = '';
      }, 200);
    }

    setTimeout(() => {
      const next = panels[name];

      next.hidden = false;
      next.style.opacity = '0';
      next.style.transform = 'translateY(20px) scale(0.97)';
      next.style.transition =
        'opacity 350ms cubic-bezier(0.34,1.56,0.64,1), transform 350ms cubic-bezier(0.34,1.56,0.64,1)';

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          next.style.opacity = '1';
          next.style.transform = 'translateY(0) scale(1)';
        });
      });

      setTimeout(() => {
        next.style.transition = '';
        next.style.opacity = '';
        next.style.transform = '';
      }, 400);
    }, 180);

    Object.entries(tabs).forEach(([key, tab]) => {
      if (!tab) return;

      const isActive = key === name;

      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });

    activePanel = name;

    setTimeout(() => {
      const firstInput = panels[name]?.querySelector('input');
      firstInput?.focus();
    }, 380);
  }

  Object.entries(tabs).forEach(([name, tab]) => {
    tab?.addEventListener('click', () => switchPanel(name));
  });

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-goto]');

    if (btn) {
      switchPanel(btn.dataset.goto);
    }
  });

  document.addEventListener('ag:navigate', e => {
    const panel = e.detail?.panel;

    if (panels[panel]) {
      switchPanel(panel);
    }
  });

  /* ════════════════════════════════════════════════════════════════════
     VALIDAÇÃO EM TEMPO REAL
  ════════════════════════════════════════════════════════════════════ */

  const validators = {
    email(val) {
      const clean = (val || '').trim();

      return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(clean);
    },

    notEmpty(val) {
      return (val || '').trim().length > 0;
    },

    cnpj(val) {
      const clean = (val || '').trim();

      return (
        clean === '' ||
        /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(clean)
      );
    },
  };

  function setFieldState(input, state, message = '') {
    if (!input) return;

    const group = input.closest('.field-group');

    if (!group) return;

    group.classList.remove('is-valid', 'is-invalid');

    if (state) {
      group.classList.add(state);
    }

    const errEl = group.querySelector('.field-error');

    if (errEl) {
      errEl.textContent = message;
    }
  }

  function showFieldError(input, errorElement, message) {
    if (errorElement) {
      errorElement.textContent = message;
    }

    if (input) {
      setFieldState(input, 'is-invalid', message);
      input.focus();
    }
  }

  function validateField(input) {
    const val =
      input.type === 'password'
        ? input.value
        : (input.value || '').trim();

    const type = input.type;
    const name = input.name;
    const id = input.id;
    const required = input.required;

    if (!val) {
      if (required) {
        setFieldState(input, 'is-invalid', 'Este campo é obrigatório.');
        return false;
      }

      setFieldState(input, null);
      return true;
    }

    if (type === 'email' || name === 'email') {
      if (!validators.email(val)) {
        setFieldState(
          input,
          'is-invalid',
          'Digite um e-mail válido (ex: nome@exemplo.com).'
        );

        return false;
      }
    }

    if (id === 'login-password') {
      if (val.length < 1) {
        setFieldState(input, 'is-invalid', 'Informe sua senha.');
        return false;
      }
    } else if (id === 'c-password' || id === 'e-password') {
      if (val.length < 8) {
        setFieldState(
          input,
          'is-invalid',
          'A senha deve ter no mínimo 8 caracteres.'
        );

        return false;
      }

      if (!/[A-Z]/.test(val)) {
        setFieldState(
          input,
          'is-invalid',
          'Inclua ao menos uma letra maiúscula (ex: A, B).'
        );

        return false;
      }

      if (!/[0-9]/.test(val)) {
        setFieldState(
          input,
          'is-invalid',
          'Inclua ao menos um número (ex: 1, 2, 3).'
        );

        return false;
      }
    }

    if (name === 'cnpj' && !validators.cnpj(val)) {
      setFieldState(
        input,
        'is-invalid',
        'Formato inválido: 00.000.000/0001-00'
      );

      return false;
    }

    if (name === 'nome_completo' && val.length < 2) {
      setFieldState(input, 'is-invalid', 'Nome muito curto.');
      return false;
    }

    setFieldState(input, 'is-valid');

    return true;
  }

  document.querySelectorAll('.field-input').forEach(input => {
    input.addEventListener('blur', () => validateField(input));

    input.addEventListener('input', () => {
      const group = input.closest('.field-group');

      if (
        group &&
        (
          group.classList.contains('is-invalid') ||
          group.classList.contains('is-valid')
        )
      ) {
        validateField(input);
      }

      if (input.type === 'password') {
        updateStrength(input);
      }
    });
  });

  /* ── Máscara de CNPJ ───────────────────────────────────────────────── */

  const cnpjInput = document.getElementById('e-cnpj');

  if (cnpjInput) {
    cnpjInput.addEventListener('input', () => {
      let v = cnpjInput.value.replace(/\D/g, '').slice(0, 14);

      if (v.length > 12) {
        v = v.replace(
          /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
          '$1.$2.$3/$4-$5'
        );
      } else if (v.length > 8) {
        v = v.replace(
          /^(\d{2})(\d{3})(\d{3})(\d+)$/,
          '$1.$2.$3/$4'
        );
      } else if (v.length > 5) {
        v = v.replace(
          /^(\d{2})(\d{3})(\d+)$/,
          '$1.$2.$3'
        );
      } else if (v.length > 2) {
        v = v.replace(
          /^(\d{2})(\d+)$/,
          '$1.$2'
        );
      }

      cnpjInput.value = v;
    });
  }

  /* ── Password strength meter ──────────────────────────────────────── */

  const STRENGTH_LABELS = ['', 'Fraca', 'Razoável', 'Boa', 'Forte'];

  const STRENGTH_COLORS = [
    '',
    '#f43f5e',
    '#f59e0b',
    '#06b6d4',
    '#10b981',
  ];

  function calcStrength(password) {
    let score = 0;

    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    return Math.min(4, Math.ceil(score * 4 / 5));
  }

  function updateStrength(input) {
    const isCandidate = input.id === 'c-password';

    const wrapperId = isCandidate
      ? 'c-password-strength'
      : 'e-password-strength';

    const fillId = isCandidate
      ? 'c-strength-fill'
      : 'e-strength-fill';

    const labelId = isCandidate
      ? 'c-strength-label'
      : 'e-strength-label';

    const wrapper = document.getElementById(wrapperId);
    const fill = document.getElementById(fillId);
    const label = document.getElementById(labelId);

    if (!wrapper || !fill || !label) return;

    const val = input.value;

    if (!val) {
      wrapper.classList.remove('visible');
      return;
    }

    const level = calcStrength(val);

    wrapper.classList.add('visible');
    fill.setAttribute('data-level', level);
    fill.style.background = STRENGTH_COLORS[level];

    label.textContent = STRENGTH_LABELS[level];
    label.style.color = STRENGTH_COLORS[level];
  }

  /* ── Mostrar/ocultar senha ────────────────────────────────────────── */

  document.querySelectorAll('.field-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);

      if (!input) return;

      const isPassword = input.type === 'password';

      input.type = isPassword ? 'text' : 'password';

      const icon = btn.querySelector('.bi');

      if (icon) {
        icon.className = isPassword
          ? 'bi bi-eye-slash'
          : 'bi bi-eye';
      }
    });
  });

  /* ════════════════════════════════════════════════════════════════════
     AUTOCOMPLETE E SUGESTÕES DE FORMAÇÕES
  ════════════════════════════════════════════════════════════════════ */

  function initAreaAutocomplete() {
    const input = document.getElementById('c-area');
    const dropdown = document.getElementById('area-suggestions');
    const clearBtn = document.getElementById('btn-clear-area');
    const quickChips = document.querySelectorAll('.area-chip');

    if (!input || !dropdown) return;

    let debounceTimer = null;
    let activeIndex = -1;
    let cachedItems = [];
    let currentTypeFilter = 'todos';

    async function fetchSuggestions(query = '') {
      try {
        dropdown.hidden = false;
        input.setAttribute('aria-expanded', 'true');

        dropdown.innerHTML = `
          <div class="autocomplete-loading">
            <i class="bi bi-arrow-repeat spin"></i>
            <span>Buscando formações disponíveis...</span>
          </div>
        `;

        const typeParam =
          currentTypeFilter !== 'todos'
            ? `&tipo=${encodeURIComponent(currentTypeFilter)}`
            : '';

        const url =
          `${API.dataAreas}?q=${encodeURIComponent(query.trim())}${typeParam}&limit=35`;

        const data = await apiFetch(url, null, 'GET');

        if (!Array.isArray(data)) {
          throw new Error('Formato de resposta inválido.');
        }

        cachedItems = data;

        renderSuggestions(cachedItems, query.trim());
      } catch (err) {
        dropdown.innerHTML = `
          <div class="autocomplete-empty">
            <i class="bi bi-exclamation-circle"></i>
            <span>Não foi possível carregar sugestões no momento.</span>
          </div>
        `;
      }
    }

    function renderSuggestions(items, query) {
      const filterBarHtml = `
        <div class="autocomplete-filter-bar">
          <button type="button"
            class="filter-pill ${currentTypeFilter === 'todos' ? 'is-active' : ''}"
            data-type="todos">
            ✨ Todos
          </button>

          <button type="button"
            class="filter-pill ${currentTypeFilter === 'tecnico' ? 'is-active' : ''}"
            data-type="tecnico">
            🎓 Formações Técnicas (ETEC)
          </button>

          <button type="button"
            class="filter-pill ${currentTypeFilter === 'bacharelado' ? 'is-active' : ''}"
            data-type="bacharelado">
            🏛️ Bacharelados
          </button>
        </div>
      `;

      if (!items || items.length === 0) {
        dropdown.innerHTML = `
          ${filterBarHtml}
          <div class="autocomplete-empty">
            <i class="bi bi-search"></i>
            <span>Nenhum curso encontrado para "${escapeHtml(query)}".</span>
          </div>
        `;

        bindFilterPills();

        return;
      }

      const groups = {};

      items.forEach(item => {
        const key = item.eixo || 'Outras Áreas';

        if (!groups[key]) {
          groups[key] = [];
        }

        groups[key].push(item);
      });

      let html = filterBarHtml;
      let globalIndex = 0;

      Object.entries(groups).forEach(([eixo, groupItems]) => {
        html += `
          <div class="autocomplete-header">
            <i class="bi bi-bookmark-star"></i>
            ${escapeHtml(eixo)}
          </div>
        `;

        html += `
          <ul class="autocomplete-list"
            role="group"
            aria-label="${escapeHtml(eixo)}">
        `;

        groupItems.forEach(item => {
          const isTecnico = item.tipo_code === 'tecnico';
          const isBacharelado = item.tipo_code === 'bacharelado';

          let badgeClass = 'badge--superior';
          let badgeIcon = '🎓 Graduação';

          if (isTecnico) {
            badgeClass = 'badge--tecnico';
            badgeIcon = '🎓 Formação Técnica (ETEC)';
          } else if (isBacharelado) {
            badgeClass = 'badge--bacharelado';
            badgeIcon = '🏛️ Bacharelado (MEC)';
          } else if (item.tipo_code === 'tecnologo') {
            badgeClass = 'badge--tecnologo';
            badgeIcon = '⚡ Tecnólogo';
          }

          const highlightedName = highlightMatch(item.nome, query);

          html += `
            <li
              class="autocomplete-item"
              role="option"
              data-index="${globalIndex}"
              data-value="${escapeHtml(item.nome)}"
              id="ac-opt-${globalIndex}"
            >
              <div class="autocomplete-item-top">
                <span class="autocomplete-item-title">
                  ${highlightedName}
                </span>

                <span class="autocomplete-item-badge ${badgeClass}">
                  ${badgeIcon}
                </span>
              </div>

              <div class="autocomplete-item-sub">
                <i class="bi bi-layers"></i>
                ${escapeHtml(item.area || item.eixo || '')}
              </div>
            </li>
          `;

          globalIndex++;
        });

        html += '</ul>';
      });

      dropdown.innerHTML = html;

      activeIndex = -1;

      bindFilterPills();
    }

    function bindFilterPills() {
      dropdown.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', e => {
          e.stopPropagation();

          currentTypeFilter = pill.dataset.type || 'todos';

          fetchSuggestions(input.value);
        });
      });
    }

    function highlightMatch(text, query) {
      if (!query) {
        return escapeHtml(text);
      }

      const regex = new RegExp(
        `(${escapeRegex(query)})`,
        'gi'
      );

      return escapeHtml(text).replace(
        regex,
        '<mark class="autocomplete-match">$1</mark>'
      );
    }

    function escapeHtml(str) {
      if (str === null || str === undefined) return '';

      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function escapeRegex(str) {
      return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function selectItem(value) {
      input.value = value;

      closeDropdown();
      updateClearBtn();

      setFieldState(input, 'is-valid');

      quickChips.forEach(chip => {
        chip.classList.toggle(
          'is-selected',
          chip.dataset.value === value
        );
      });
    }

    function closeDropdown() {
      dropdown.hidden = true;

      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');

      activeIndex = -1;
    }

    function updateClearBtn() {
      if (clearBtn) {
        clearBtn.hidden = !input.value;
      }
    }

    input.addEventListener('focus', () => {
      fetchSuggestions(input.value);
      updateClearBtn();
    });

    input.addEventListener('input', () => {
      updateClearBtn();

      clearTimeout(debounceTimer);

      debounceTimer = setTimeout(() => {
        fetchSuggestions(input.value);
      }, 180);
    });

    input.addEventListener('keydown', e => {
      const items = dropdown.querySelectorAll('.autocomplete-item');

      if (!items.length || dropdown.hidden) {
        if (e.key === 'ArrowDown' && dropdown.hidden) {
          fetchSuggestions(input.value);
          e.preventDefault();
        }

        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();

        activeIndex = (activeIndex + 1) % items.length;

        updateActiveItem(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();

        activeIndex =
          (activeIndex - 1 + items.length) % items.length;

        updateActiveItem(items);
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0 && items[activeIndex]) {
          e.preventDefault();

          selectItem(items[activeIndex].dataset.value);
        }
      } else if (e.key === 'Escape') {
        closeDropdown();
      }
    });

    function updateActiveItem(items) {
      items.forEach((item, idx) => {
        const isActive = idx === activeIndex;

        item.classList.toggle('is-active', isActive);

        if (isActive) {
          item.scrollIntoView({ block: 'nearest' });

          input.setAttribute(
            'aria-activedescendant',
            item.id
          );
        }
      });
    }

    dropdown.addEventListener('click', e => {
      const item = e.target.closest('.autocomplete-item');

      if (item && item.dataset.value) {
        selectItem(item.dataset.value);
      }
    });

    quickChips.forEach(chip => {
      chip.addEventListener('click', () => {
        selectItem(chip.dataset.value);
        input.focus();
      });
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';

        updateClearBtn();

        setFieldState(input, null);

        quickChips.forEach(chip => {
          chip.classList.remove('is-selected');
        });

        input.focus();

        fetchSuggestions('');
      });
    }

    document.addEventListener('click', e => {
      if (
        !input.contains(e.target) &&
        !dropdown.contains(e.target) &&
        !clearBtn?.contains(e.target)
      ) {
        closeDropdown();
      }
    });
  }

  /* ════════════════════════════════════════════════════════════════════
     SISTEMA DE TOASTS
  ════════════════════════════════════════════════════════════════════ */

  const toastContainer = document.getElementById('ag-toast-container');

  function showToast(message, type = 'info', duration = 4000) {
    if (!toastContainer) return;

    const icons = {
      success: 'bi-check-circle-fill',
      error: 'bi-x-circle-fill',
      info: 'bi-info-circle-fill',
    };

    const safeType = Object.hasOwn(icons, type) ? type : 'info';

    const toast = document.createElement('div');

    toast.className = `ag-toast ag-toast--${safeType}`;

    toast.setAttribute(
      'role',
      safeType === 'error' ? 'alert' : 'status'
    );

    const icon = document.createElement('i');

    icon.className = `bi ${icons[safeType]}`;
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');

    text.textContent = String(message ?? '');

    toast.appendChild(icon);
    toast.appendChild(text);

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');

      toast.addEventListener(
        'animationend',
        () => toast.remove(),
        { once: true }
      );

      setTimeout(() => {
        toast.remove();
      }, 500);
    }, Math.max(0, Number(duration) || 0));
  }

  /* ════════════════════════════════════════════════════════════════════
     BOTÃO LOADING E VALIDAÇÃO DE FORMULÁRIOS
  ════════════════════════════════════════════════════════════════════ */

  function setLoading(btn, loading) {
    if (!btn) return;

    btn.disabled = loading;
    btn.classList.toggle('loading', loading);
  }

  function validateForm(form) {
    let valid = true;
    let firstInvalid = null;

    form.querySelectorAll('.field-input').forEach(input => {
      if (!validateField(input)) {
        valid = false;

        if (!firstInvalid) {
          firstInvalid = input;
        }
      }
    });

    if (firstInvalid) {
      firstInvalid.focus();

      firstInvalid.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }

    return valid;
  }

  /* ════════════════════════════════════════════════════════════════════
     FORMULÁRIO DE LOGIN
  ════════════════════════════════════════════════════════════════════ */

  const formLogin = document.getElementById('form-login');
  const btnLogin = document.getElementById('btn-login');

  document
    .querySelectorAll('[data-demo-email][data-demo-password]')
    .forEach(button => {
      button.addEventListener('click', () => {
        const emailInput = document.getElementById('login-email');
        const passwordInput = document.getElementById('login-password');

        if (!emailInput || !passwordInput || !formLogin) return;

        emailInput.value = button.dataset.demoEmail || '';
        passwordInput.value = button.dataset.demoPassword || '';

        setFieldState(emailInput, 'is-valid');
        setFieldState(passwordInput, 'is-valid');

        formLogin.requestSubmit();
      });
    });

  formLogin?.addEventListener('submit', async e => {
    e.preventDefault();

    if (!validateForm(formLogin)) return;

    const rawData = Object.fromEntries(
      new FormData(formLogin)
    );

    const data = {
      email: (rawData.email || '').trim().toLowerCase(),
      password: rawData.password || '',
    };

    setLoading(btnLogin, true);

    try {
      const res = await apiFetch(API.login, data);

      if (!res.access_token || !res.tipo_usuario) {
        throw new Error('Resposta de autenticação inválida.');
      }

      store.setToken(res.access_token);

      store.setUser({
        nome: res.nome,
        tipo: res.tipo_usuario,
      });

      showToast(
        `🛸 Bem-vindo de volta, ${res.nome}! Redirecionando...`,
        'success',
        2000
      );

      setTimeout(() => {
        const isStatic =
          window.location.protocol === 'file:' ||
          window.location.pathname.endsWith('.html');

        if (res.tipo_usuario === 'candidato') {
          window.location.href = isStatic
            ? 'candidato_dashboard.html'
            : '/dashboard/candidato';
        } else if (res.tipo_usuario === 'empresa') {
          window.location.href = isStatic
            ? 'recrutador_painel.html'
            : '/dashboard/empresa';
        }
      }, 500);

    } catch (err) {
      showToast(err.message, 'error');

      const emailInput = document.getElementById('login-email');
      const pwdInput = document.getElementById('login-password');

      if (emailInput && pwdInput) {
        setFieldState(emailInput, 'is-invalid');
        setFieldState(pwdInput, 'is-invalid', err.message);
      }
    } finally {
      setLoading(btnLogin, false);
    }
  });

  /* ════════════════════════════════════════════════════════════════════
     FORMULÁRIO DE CADASTRO CANDIDATO
  ════════════════════════════════════════════════════════════════════ */

  const formCandidato = document.getElementById('form-candidato');
  const btnCandidato = document.getElementById('btn-candidato');

  formCandidato?.addEventListener('submit', async e => {
    e.preventDefault();

    if (!validateForm(formCandidato)) return;

    const rawData = Object.fromEntries(
      new FormData(formCandidato)
    );

    const data = {
      ...rawData,
      email: (rawData.email || '').trim().toLowerCase(),
      nome_completo: (rawData.nome_completo || '').trim(),
      area_interesse: (rawData.area_interesse || '').trim() || null,
      password: rawData.password || '',
    };

    setLoading(btnCandidato, true);

    try {
      const res = await apiFetch(
        API.registerCandidato,
        data
      );

      if (!res.access_token || !res.tipo_usuario) {
        throw new Error('Resposta de cadastro inválida.');
      }

      store.setToken(res.access_token);

      store.setUser({
        nome: res.nome,
        tipo: res.tipo_usuario,
      });

      showToast(
        `🚀 Conta criada com sucesso! Bem-vindo(a), ${res.nome}!`,
        'success',
        2500
      );

      formCandidato.reset();

      setTimeout(() => {
        const isStatic =
          window.location.protocol === 'file:' ||
          window.location.pathname.endsWith('.html');

        window.location.href = isStatic
          ? 'candidato_dashboard.html'
          : '/dashboard/candidato';
      }, 700);

    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(btnCandidato, false);
    }
  });

  /* ════════════════════════════════════════════════════════════════════
     FORMULÁRIO DE CADASTRO EMPRESA
  ════════════════════════════════════════════════════════════════════ */

  const formEmpresa = document.getElementById('form-empresa');
  const btnEmpresa = document.getElementById('btn-empresa');

  formEmpresa?.addEventListener('submit', async e => {
    e.preventDefault();

    if (!validateForm(formEmpresa)) return;

    const rawData = Object.fromEntries(
      new FormData(formEmpresa)
    );

    const data = {
      ...rawData,
      email: (rawData.email || '').trim().toLowerCase(),
      razao_social: (rawData.razao_social || '').trim(),
      password: rawData.password || '',
    };

    if (!data.cnpj) delete data.cnpj;
    if (!data.nome_fantasia) delete data.nome_fantasia;
    if (!data.setor) delete data.setor;

    setLoading(btnEmpresa, true);

    try {
      const res = await apiFetch(
        API.registerEmpresa,
        data
      );

      if (!res.access_token || !res.tipo_usuario) {
        throw new Error('Resposta de cadastro inválida.');
      }

      store.setToken(res.access_token);

      store.setUser({
        nome: res.nome,
        tipo: res.tipo_usuario,
      });

      showToast(
        `🏢 Empresa cadastrada com sucesso! Bem-vindo(a), ${res.nome}!`,
        'success',
        2500
      );

      formEmpresa.reset();

      setTimeout(() => {
        const isStatic =
          window.location.protocol === 'file:' ||
          window.location.pathname.endsWith('.html');

        window.location.href = isStatic
          ? 'recrutador_painel.html'
          : '/dashboard/empresa';
      }, 700);

    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(btnEmpresa, false);
    }
  });

  /* ════════════════════════════════════════════════════════════════════
     VERIFICAÇÃO DE SESSÃO EXISTENTE
  ════════════════════════════════════════════════════════════════════ */

  async function checkExistingSession() {
    const token = store.getToken();

    if (!token) return;

    try {
      const user = await apiFetch(API.me, null, 'GET');

      if (
        !user ||
        !user.nome ||
        !['candidato', 'empresa'].includes(user.tipo)
      ) {
        throw new Error('Dados de usuário inválidos.');
      }

      store.setUser({
        nome: user.nome,
        tipo: user.tipo,
      });

      const isStatic =
        window.location.protocol === 'file:' ||
        window.location.pathname.endsWith('.html');

      const target = isStatic
        ? (
            user.tipo === 'candidato'
              ? 'candidato_dashboard.html'
              : 'recrutador_painel.html'
          )
        : (
            user.tipo === 'candidato'
              ? '/dashboard/candidato'
              : '/dashboard/empresa'
          );

      window.location.replace(target);

    } catch {
      store.clearToken();
    }
  }

  /* ── Inicializações ────────────────────────────────────────────────── */

  initAreaAutocomplete();
  checkExistingSession();
  initRecoveryModals();
  checkUrlForResetToken();
  initMobileModal();

  /* ════════════════════════════════════════════════════════════════════
     RECUPERAÇÃO DE SENHA — MODAIS
  ════════════════════════════════════════════════════════════════════ */

  function initRecoveryModals() {
    const btnForgot = document.getElementById('btn-forgot-pwd');
    const modalRec = document.getElementById('modal-recovery');
    const modalRst = document.getElementById('modal-reset');

    const btnRecClose = document.getElementById('modal-rec-close');
    const btnRecCancel = document.getElementById('btn-rec-cancel');
    const btnRecSend = document.getElementById('btn-rec-send');

    const btnRstClose = document.getElementById('modal-rst-close');
    const btnRstCancel = document.getElementById('btn-rst-cancel');
    const btnRstSave = document.getElementById('btn-rst-save');

    if (!modalRec || !modalRst) return;

    btnForgot?.addEventListener('click', () => {
      const emailInput = document.getElementById('rec-email');
      const feedback = document.getElementById('rec-feedback');

      if (emailInput) emailInput.value = '';

      if (feedback) {
        feedback.hidden = true;
        feedback.textContent = '';
      }

      modalRec.hidden = false;
    });

    [btnRecClose, btnRecCancel].forEach(el => {
      el?.addEventListener('click', () => {
        modalRec.hidden = true;
      });
    });

    btnRecSend?.addEventListener('click', async () => {
      const emailInput = document.getElementById('rec-email');
      const emailError = document.getElementById('rec-email-err');
      const feedback = document.getElementById('rec-feedback');

      const email = emailInput?.value?.trim().toLowerCase();

      if (!email || !validators.email(email)) {
        showFieldError(
          emailInput,
          emailError,
          'Informe um e-mail válido.'
        );

        return;
      }

      setLoading(btnRecSend, true);

      if (feedback) {
        feedback.hidden = true;
        feedback.textContent = '';
      }

      try {
        const res = await apiFetch(
          '/api/auth/recuperar-senha',
          { email }
        );

        if (feedback) {
          feedback.hidden = false;
          feedback.className = 'form-feedback-modal success';
          feedback.textContent =
            res.mensagem || 'Link enviado! Verifique seu e-mail.';
        }

        showToast(
          'Link de recuperação enviado!',
          'success'
        );

      } catch (err) {
        if (feedback) {
          feedback.hidden = false;
          feedback.className = 'form-feedback-modal error';
          feedback.textContent = err.message;
        }
      } finally {
        setLoading(btnRecSend, false);
      }
    });

    [btnRstClose, btnRstCancel].forEach(el => {
      el?.addEventListener('click', () => {
        modalRst.hidden = true;
      });
    });

    btnRstSave?.addEventListener('click', async () => {
      const token = document.getElementById('rst-token')?.value;
      const pwd = document.getElementById('rst-pwd')?.value;
      const pwdConf = document.getElementById('rst-pwd-confirm')?.value;

      const feedback = document.getElementById('rst-feedback');
      const pwdErr = document.getElementById('rst-pwd-err');
      const confErr = document.getElementById('rst-pwd-confirm-err');

      if (pwdErr) pwdErr.textContent = '';
      if (confErr) confErr.textContent = '';

      if (!pwd || pwd.length < 8) {
        if (pwdErr) {
          pwdErr.textContent =
            'A senha deve ter ao menos 8 caracteres.';
        }

        return;
      }

      if (pwd !== pwdConf) {
        if (confErr) {
          confErr.textContent = 'As senhas não conferem.';
        }

        return;
      }

      if (!token) {
        showToast(
          'Token de redefinição não encontrado.',
          'error'
        );

        return;
      }

      setLoading(btnRstSave, true);

      if (feedback) {
        feedback.hidden = true;
        feedback.textContent = '';
      }

      try {
        const res = await apiFetch(
          '/api/auth/redefinir-senha',
          {
            token,
            nova_senha: pwd,
          }
        );

        if (feedback) {
          feedback.hidden = false;
          feedback.className = 'form-feedback-modal success';
          feedback.textContent =
            res.mensagem || 'Senha redefinida com sucesso!';
        }

        showToast(
          'Senha redefinida! Faça login agora.',
          'success'
        );

        setTimeout(() => {
          modalRst.hidden = true;
        }, 2500);

      } catch (err) {
        if (feedback) {
          feedback.hidden = false;
          feedback.className = 'form-feedback-modal error';
          feedback.textContent = err.message;
        }
      } finally {
        setLoading(btnRstSave, false);
      }
    });
  }

  /* ── Validação do token de redefinição ─────────────────────────────── */

  function checkUrlForResetToken() {
    const params = new URLSearchParams(window.location.search);

    const modo = params.get('modo');
    const token = params.get('token');

    if (modo !== 'redefinir' || !token) return;

    apiFetch(
      `/api/auth/validar-token/${encodeURIComponent(token)}`,
      null,
      'GET'
    )
      .then(res => {
        if (res.valido) {
          const tokenInput = document.getElementById('rst-token');
          const modal = document.getElementById('modal-reset');

          if (tokenInput) {
            tokenInput.value = token;
          }

          if (modal) {
            modal.hidden = false;
          }

          window.history.replaceState(
            {},
            '',
            window.location.pathname
          );

        } else {
          showToast(
            'Link de redefinição inválido ou expirado. Solicite um novo.',
            'error',
            5000
          );
        }
      })
      .catch(() => {
        showToast(
          'Não foi possível validar o token.',
          'error'
        );
      });
  }

  /* ════════════════════════════════════════════════════════════════════
     MODAL ACESSO MOBILE / QR CODE
  ════════════════════════════════════════════════════════════════════ */

  function initMobileModal() {
    const btn = document.getElementById('btn-mobile-modal');
    const modal = document.getElementById('modal-mobile');
    const close = document.getElementById('modal-mob-close');
    const ok = document.getElementById('btn-mob-ok');
    const copy = document.getElementById('btn-copy-mobile-link');

    const urlText = document.getElementById('mobile-url-text');
    const qrImg = document.getElementById('qr-code-img');

    if (!btn || !modal) return;

    async function updateNetworkInfo() {
      try {
        const res = await fetch('/api/network-info');

        if (!res.ok) {
          throw new Error('Não foi possível obter os dados da rede.');
        }

        const data = await res.json();

        if (urlText) {
          urlText.textContent =
            data.access_url || data.mobile_network_url || '';
        }

        if (qrImg && data.qr_code_url) {
          qrImg.src = data.qr_code_url;
        }

      } catch (error) {
        console.warn(
          'Não foi possível carregar as informações de rede:',
          error
        );
      }
    }

    btn.addEventListener('click', () => {
      modal.hidden = false;
      updateNetworkInfo();
    });

    [close, ok].forEach(el => {
      el?.addEventListener('click', () => {
        modal.hidden = true;
      });
    });

    copy?.addEventListener('click', async () => {
      const url =
        urlText?.textContent || window.location.origin;

      try {
        if (!navigator.clipboard?.writeText) {
          throw new Error('Área de transferência indisponível.');
        }

        await navigator.clipboard.writeText(url);

        showToast(
          'Link copiado para a área de transferência! 📱',
          'success'
        );

      } catch {
        showToast(
          'Não foi possível copiar o link: ' + url,
          'info'
        );
      }
    });
  }

  /* ════════════════════════════════════════════════════════════════════
     CONSOLE BRANDING
  ════════════════════════════════════════════════════════════════════ */

  console.log(
    '%c🛸 EasyIntern Platform %cv1.0.0 ',
    'background: linear-gradient(90deg, #7c3aed, #06b6d4); color: white; padding: 4px 12px; border-radius: 4px 0 0 4px; font-weight: bold;',
    'background: #10b981; color: white; padding: 4px 12px; border-radius: 0 4px 4px 0; font-weight: bold;'
  );

  console.log(
    '%cGravidade: 0.0 | Status: Zero-G nominal',
    'color: #a855f7; font-style: italic;'
  );

})();