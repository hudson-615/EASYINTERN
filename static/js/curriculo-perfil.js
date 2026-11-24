/* EasyIntern — M-08: interface de currículo privado do candidato. */
(() => {
  'use strict';
  const API = '/dashboard/api/candidato/curriculo';
  const MAX_BYTES = 5 * 1024 * 1024;
  let ocupado = false;
  let carregando = false;

  const el = id => document.getElementById(id);
  function token() {
    return localStorage.getItem('easyintern_token') || localStorage.getItem('ag_token');
  }
  function mensagem(texto, tipo = '') {
    const aviso = el('curriculo-mensagem');
    if (!aviso) return;
    aviso.textContent = texto;
    aviso.dataset.tipo = tipo;
  }
  function exibir(enviado) {
    el('curriculo-situacao').textContent = enviado ? 'Currículo PDF cadastrado.' : 'Nenhum currículo enviado.';
    el('curriculo-visualizar').hidden = !enviado;
    el('curriculo-baixar').hidden = !enviado;
    el('curriculo-excluir').hidden = !enviado;
  }
  function bloqueio(ativar) {
    ocupado = ativar;
    for (const id of ['curriculo-enviar', 'curriculo-visualizar', 'curriculo-baixar', 'curriculo-excluir']) {
      const btn = el(id);
      if (btn) btn.disabled = ativar;
    }
  }
  async function requisicao(caminho, opcoes = {}) {
    const jwt = token();
    if (!jwt) throw new Error('Sua sessão expirou. Faça login novamente.');
    let response;
    try {
      response = await fetch(caminho, {
        ...opcoes,
        cache: 'no-store',
        headers: { ...(opcoes.headers || {}), Authorization: `Bearer ${jwt}` }
      });
    } catch {
      throw new Error('Não foi possível conectar ao servidor.');
    }
    if (!response.ok) {
      let detail = '';
      try {
        const payload = await response.json();
        detail = typeof payload.detail === 'string' ? payload.detail : '';
      } catch { /* resposta sem JSON */ }
      throw new Error(detail || `Erro ${response.status} ao processar o currículo.`);
    }
    return response;
  }
  async function consultar() {
    if (ocupado || carregando || !el('curriculo-situacao')) return;
    carregando = true;
    mensagem('Consultando currículo...');
    try {
      const response = await requisicao(API);
      const dados = await response.json();
      exibir(Boolean(dados.enviado));
      mensagem('');
    } catch (error) {
      exibir(false);
      el('curriculo-situacao').textContent = 'Não foi possível consultar o currículo.';
      mensagem(error.message, 'erro');
    } finally {
      carregando = false;
    }
  }
  async function enviar(event) {
    event.preventDefault();
    if (ocupado) return;
    const input = el('curriculo-arquivo');
    const arquivo = input?.files?.[0];
    if (!arquivo) return mensagem('Selecione um PDF antes de enviar.', 'erro');
    if (!arquivo.name.toLowerCase().endsWith('.pdf') || arquivo.type !== 'application/pdf') {
      return mensagem('Escolha um arquivo PDF válido.', 'erro');
    }
    if (arquivo.size > MAX_BYTES) return mensagem('O arquivo deve ter até 5 MB.', 'erro');
    bloqueio(true);
    mensagem('Enviando currículo...');
    try {
      const dados = new FormData();
      dados.append('arquivo', arquivo, arquivo.name);
      await requisicao(API, { method: 'POST', body: dados });
      input.value = '';
      exibir(true);
      mensagem('Currículo enviado com sucesso.', 'sucesso');
    } catch (error) {
      mensagem(error.message, 'erro');
    } finally {
      bloqueio(false);
    }
  }
  async function obterArquivo(visualizar) {
    if (ocupado) return;
    // Abrir janela no clique para evitar bloqueador de pop-ups após a requisição.
    const janela = visualizar ? window.open('about:blank', '_blank') : null;
    if (janela) {
      janela.document.title = 'Carregando currículo...';
      janela.opener = null;
    }
    bloqueio(true);
    mensagem('Preparando PDF...');
    try {
      const response = await requisicao(`${API}/arquivo`);
      const arquivo = await response.blob();
      if (!arquivo.type.includes('pdf')) throw new Error('Resposta não é um PDF.');
      const url = URL.createObjectURL(arquivo);
      if (visualizar && janela) {
        janela.location.replace(url);
        // Liberar o objeto depois de um prazo amplo para o visualizador carregar.
        setTimeout(() => URL.revokeObjectURL(url), 120000);
      } else {
        if (janela) janela.close();
        const link = document.createElement('a');
        link.href = url;
        link.download = 'curriculo.pdf';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
      mensagem('');
    } catch (error) {
      if (janela) janela.close();
      mensagem(error.message, 'erro');
    } finally {
      bloqueio(false);
    }
  }
  async function excluir() {
    if (ocupado || !confirm('Excluir seu currículo? Esta ação não pode ser desfeita.')) return;
    bloqueio(true);
    mensagem('Excluindo currículo...');
    try {
      await requisicao(API, { method: 'DELETE' });
      exibir(false);
      el('curriculo-arquivo').value = '';
      mensagem('Currículo excluído.', 'sucesso');
    } catch (error) {
      mensagem(error.message, 'erro');
    } finally {
      bloqueio(false);
    }
  }
  function iniciar() {
    if (!el('curriculo-form')) return;
    el('curriculo-form').addEventListener('submit', enviar);
    el('curriculo-visualizar').addEventListener('click', () => obterArquivo(true));
    el('curriculo-baixar').addEventListener('click', () => obterArquivo(false));
    el('curriculo-excluir').addEventListener('click', excluir);
    // Atualiza ao navegar para o perfil. Evita dados antigos após mudança de conta.
    document.querySelectorAll('[data-section="perfil"]').forEach(botao => {
      botao.addEventListener('click', () => setTimeout(consultar, 0));
    });
    consultar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
