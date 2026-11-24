/* EasyIntern — M-04, M-05, M-06 | Integração do perfil do candidato.
 * Usa as APIs existentes, sem modificar os backends de Murilo e Marco.
 */
(() => {
  'use strict';
  if (document.body.dataset.panel !== 'candidato') return;
  const $ = id => document.getElementById(id);
  const BASE = '/dashboard/api';
  const levels = ['Básico', 'Intermediário', 'Avançado'];
  const statuses = ['Cursando', 'Concluído', 'Trancado'];
  let skillsCatalog = [];
  let formationsCatalog = [];
  let busy = false;

  function status(text, error = false) {
    const el = $('ei-perfil-educacao-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = error ? 'var(--danger, #c92a2a)' : '';
  }
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  function select(options, value) {
    const node = el('select');
    for (const [v, title] of options) {
      const opt = el('option', title);
      opt.value = String(v);
      node.append(opt);
    }
    if (value !== undefined && value !== null) node.value = String(value);
    return node;
  }
  function action(text, callback, danger = false) {
    const button = el('button', text, danger ? 'btn btn-ghost' : 'btn btn-primary');
    button.type = 'button';
    button.addEventListener('click', callback);
    return button;
  }
  function row(text) { return el('div', text, 'ei-education-row'); }
  async function request(path, data, method = 'GET') {
    // Reutiliza o JWT, tratamento de erros e URL relativa do dashboard existente.
    return apiFetch(BASE + path, data === undefined ? null : data, method);
  }
  async function mutate(fn) {
    if (busy) return;
    busy = true;
    status('Salvando...');
    try {
      await fn();
      await reload();
      status('Alterações salvas.');
    } catch (error) {
      status(error.message || 'Não foi possível salvar.', true);
    } finally {
      busy = false;
    }
  }
  function renderSkills(items) {
    const host = $('ei-lista-habilidades');
    host.replaceChildren();
    if (!items.length) host.append(row('Você ainda não cadastrou habilidades.'));
    for (const item of items) {
      const r = row('');
      const name = el('span', `${item.nome} (${item.categoria})`);
      const level = select(levels.map(v => [v, v]), item.nivel);
      level.setAttribute('aria-label', `Nível de ${item.nome}`);
      level.addEventListener('change', () => mutate(() => request(`/candidato/habilidades/${item.id_tag}`, { nivel: level.value }, 'PATCH')));
      const del = action('Remover', () => {
        if (window.confirm(`Remover ${item.nome} do perfil?`)) {
          mutate(() => request(`/candidato/habilidades/${item.id_tag}`, undefined, 'DELETE'));
        }
      }, true);
      r.append(name, level, del);
      host.append(r);
    }
  }
  function renderFormations(items) {
    const host = $('ei-lista-formacoes');
    host.replaceChildren();
    if (!items.length) host.append(row('Você ainda não cadastrou formações.'));
    for (const item of items) {
      const r = row('');
      const name = el('span', `${item.nome_curso} — ${item.tipo}`);
      const form = el('form');
      form.className = 'ei-inline-form';
      const state = select(statuses.map(v => [v, v]), item.status);
      state.setAttribute('aria-label', `Situação de ${item.nome_curso}`);
      const semester = el('input');
      semester.type = 'number'; semester.min = '1'; semester.max = '12';
      semester.placeholder = 'Semestre'; semester.title = 'Semestre atual';
      semester.value = item.semestre_atual ?? '';
      const year = el('input');
      year.type = 'number'; year.min = '1901'; year.max = '2155';
      year.placeholder = 'Ano'; year.title = 'Ano de conclusão';
      year.value = item.ano_conclusao ?? '';
      const save = el('button', 'Atualizar', 'btn btn-primary');
      save.type = 'submit';
      form.addEventListener('submit', ev => {
        ev.preventDefault();
        const payload = { status: state.value,
          semestre_atual: semester.value ? Number(semester.value) : null,
          ano_conclusao: year.value ? Number(year.value) : null };
        if (payload.status === 'Concluído' && !payload.ano_conclusao) {
          status('Informe o ano de conclusão.', true); return;
        }
        mutate(() => request(`/candidato/formacoes/${item.id_formacao}`, payload, 'PATCH'));
      });
      form.append(state, semester, year, save);
      const del = action('Remover', () => {
        if (window.confirm(`Remover ${item.nome_curso} do perfil?`)) {
          mutate(() => request(`/candidato/formacoes/${item.id_formacao}`, undefined, 'DELETE'));
        }
      }, true);
      r.append(name, form, del);
      host.append(r);
    }
  }
  async function reload() {
    const [sk, fm] = await Promise.all([
      request('/candidato/habilidades'),
      request('/candidato/formacoes')
    ]);
    renderSkills(sk.habilidades || []);
    renderFormations(fm.formacoes || []);
  }
  function setupCatalogs() {
    const skillSelect = $('ei-habilidade-catalogo');
    const formationSelect = $('ei-formacao-catalogo');
    skillSelect.replaceChildren();
    formationSelect.replaceChildren();
    for (const s of skillsCatalog) {
      const opt = el('option', `${s.nome} (${s.categoria})`);
      opt.value = s.id_tag;
      skillSelect.append(opt);
    }
    for (const f of formationsCatalog) {
      const opt = el('option', `${f.nome_curso} — ${f.tipo}`);
      opt.value = f.id_formacao;
      formationSelect.append(opt);
    }
    $('ei-form-habilidade').querySelector('button').disabled = !skillsCatalog.length;
    $('ei-form-formacao').querySelector('button').disabled = !formationsCatalog.length;
  }
  function bindForms() {
    $('ei-form-habilidade').addEventListener('submit', e => {
      e.preventDefault();
      const id = Number($('ei-habilidade-catalogo').value);
      if (!id) return;
      mutate(() => request('/candidato/habilidades', { id_tag: id,
        nivel: $('ei-nivel-habilidade').value }, 'POST'));
    });
    $('ei-form-formacao').addEventListener('submit', e => {
      e.preventDefault();
      const id = Number($('ei-formacao-catalogo').value);
      if (!id) return;
      const payload = { id_formacao: id,
        status: $('ei-status-formacao').value,
        semestre_atual: $('ei-semestre-formacao').value ? Number($('ei-semestre-formacao').value) : null,
        ano_conclusao: $('ei-ano-formacao').value ? Number($('ei-ano-formacao').value) : null };
      if (payload.status === 'Concluído' && !payload.ano_conclusao) {
        status('Informe o ano de conclusão.', true); return;
      }
      mutate(() => request('/candidato/formacoes', payload, 'POST'));
    });
    $('ei-atualizar-educacao').addEventListener('click', () => {
      status('Atualizando...');
      reload().then(() => status('Dados atualizados.'))
        .catch(error => status(error.message, true));
    });
  }
  async function init() {
    if (!$('ei-form-habilidade') || !$('ei-form-formacao')) return;
    bindForms();
    status('Carregando habilidades e formações...');
    try {
      const [sc, fc] = await Promise.all([
        request('/habilidades/catalogo'),
        request('/formacoes/catalogo')
      ]);
      skillsCatalog = sc.habilidades || [];
      formationsCatalog = fc.formacoes || [];
      setupCatalogs();
      await reload();
      status('');
    } catch (error) {
      status(error.message || 'Falha ao carregar dados. Faça login novamente.', true);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
