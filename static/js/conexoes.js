const $ = id => document.getElementById(id);

let pessoas = [];
let aba = "discover";
let buscaAtual = 0;
const salvos = new Set();

const token = () =>
  localStorage.getItem("easyintern_token") ||
  localStorage.getItem("ag_token");

async function api(url, options = {}) {
  if (!token()) {
    throw new Error("Faça login no EasyIntern para acessar Conexões.");
  }

  const resposta = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {})
    }
  });

  const dados = await resposta.json().catch(() => ({}));

  if (resposta.status === 401)
    throw new Error("Sessão expirada. Faça login novamente.");

  if (!resposta.ok)
    throw new Error(
      typeof dados.detail === "string"
        ? dados.detail
        : "Não foi possível carregar os dados."
    );

  return dados;
}

function aviso(mensagem) {
  const elemento = $("toast");
  elemento.textContent = mensagem;
  elemento.classList.add("visible");
  clearTimeout(aviso.timer);
  aviso.timer = setTimeout(
    () => elemento.classList.remove("visible"),
    4000
  );
}

function criar(tag, classe = "", texto = "") {
  const elemento = document.createElement(tag);
  elemento.className = classe;
  elemento.textContent = texto;
  return elemento;
}

function habilidades(p) {
  return (p.habilidades || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

function filtrar() {
  const area = $("areaFilter").value;

  const lista = pessoas.filter(p => {
    if (aba === "saved" && !salvos.has(p.id_candidato))
      return false;

    if (!area) return true;

    const conteudo = (
      (p.formacao || "") + " " +
      (p.habilidades || "")
    ).toLowerCase();

    const termos = {
      desenvolvimento: ["desenvolv", "software", "python", "java"],
      design: ["design", "figma", "ux", "ui"],
      dados: ["dados", "data", "pandas", "power bi"]
    };

    return (termos[area] || []).some(
      termo => conteudo.includes(termo)
    );
  });

  const grid = $("peopleGrid");
  grid.replaceChildren();

  lista.forEach(p => {
    const card = criar("article", "person");
    const cabecalho = criar("div", "person-head");

    const avatar = criar(
      "div",
      "avatar",
      (p.nome || "?")
        .split(" ")
        .slice(0, 2)
        .map(x => x[0])
        .join("")
        .toUpperCase()
    );

    avatar.style.setProperty("--avatar", "#7134db");

    const dados = criar("div");
    dados.append(
      criar("h3", "", p.nome),
      criar("div", "course", p.formacao || p.nivel_carreira || "Estudante")
    );

    cabecalho.append(avatar, dados);

    const tags = criar("div", "tags");
    habilidades(p).forEach(h =>
      tags.append(criar("span", "tag", h))
    );

    const local = [p.cidade, p.uf].filter(Boolean).join(", ");

    const acoes = criar("div", "actions");

    const ver = criar("button", "primary", "Ver perfil");
    ver.type = "button";
    ver.onclick = () => abrirPerfil(p.id_candidato);

    const salvar = criar(
      "button",
      "outline",
      salvos.has(p.id_candidato) ? "★ Salvo" : "☆ Salvar"
    );

    salvar.type = "button";
    salvar.onclick = () => {
      if (salvos.has(p.id_candidato))
        salvos.delete(p.id_candidato);
      else
        salvos.add(p.id_candidato);

      filtrar();
    };

    acoes.append(ver, salvar);

    card.append(
      cabecalho,
      criar("p", "about", p.biografia || "Estudante EasyIntern."),
      tags,
      criar("div", "meta", local),
      acoes
    );

    grid.append(card);
  });

  $("resultCount").textContent = `${lista.length} perfis`;
  $("savedCount").textContent = salvos.size;
  $("emptyState").hidden = lista.length > 0;
}

async function pesquisar() {
  const numero = ++buscaAtual;
  $("resultCount").textContent = "Buscando...";

  try {
    const busca = encodeURIComponent(
      $("searchPeople").value.trim()
    );

    const resultado = await api(
      `/api/social/candidatos?busca=${busca}`
    );

    if (numero !== buscaAtual) return;

    pessoas = resultado.items || [];
    filtrar();
  } catch (erro) {
    if (numero !== buscaAtual) return;
    pessoas = [];
    filtrar();
    aviso(erro.message);
  }
}

async function abrirPerfil(id) {
  try {
    const p = await api(`/api/social/candidatos/${id}`);
    const conteudo = $("dialogContent");
    conteudo.replaceChildren();

    conteudo.append(
      criar("h2", "", p.nome),
      criar("p", "", p.formacao || "Estudante"),
      criar("p", "", p.biografia || "Sem apresentação."),
      criar("p", "", [p.cidade, p.uf].filter(Boolean).join(", "))
    );

    const tags = criar("div", "tags");
    habilidades(p).forEach(h =>
      tags.append(criar("span", "tag", h))
    );

    conteudo.append(tags);
    $("profileDialog").showModal();
  } catch (erro) {
    aviso(erro.message);
  }
}

async function carregarPrivacidade() {
  const botao = $("profileVisibility");

  try {
    const resultado = await api(
      "/api/social/meu-perfil/visibilidade"
    );

    botao.dataset.publico = String(resultado.perfil_publico);
    botao.textContent = resultado.perfil_publico
      ? "Meu perfil: público"
      : "Meu perfil: privado";
  } catch (erro) {
    botao.textContent = "Privacidade indisponível";
    botao.disabled = true;
    aviso(erro.message);
  }
}

async function alterarPrivacidade() {
  const botao = $("profileVisibility");
  const publico = botao.dataset.publico !== "true";

  botao.disabled = true;

  try {
    const resultado = await api(
      "/api/social/meu-perfil/visibilidade",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfil_publico: publico })
      }
    );

    botao.dataset.publico = String(resultado.perfil_publico);
    botao.textContent = resultado.perfil_publico
      ? "Meu perfil: público"
      : "Meu perfil: privado";

    aviso("Privacidade atualizada com sucesso.");
  } catch (erro) {
    aviso(erro.message);
  } finally {
    botao.disabled = false;
  }
}

$("searchPeople").addEventListener("input", () => {
  clearTimeout(pesquisar.timer);
  pesquisar.timer = setTimeout(pesquisar, 300);
});

$("areaFilter").addEventListener("change", filtrar);

document.querySelectorAll("[data-tab]").forEach(botao => {
  botao.addEventListener("click", () => {
    aba = botao.dataset.tab;

    document.querySelectorAll("[data-tab]").forEach(b => {
      const ativo = b === botao;
      b.classList.toggle("active", ativo);
      b.setAttribute("aria-selected", String(ativo));
    });

    filtrar();
  });
});

$("themeToggle").addEventListener("click", () => {
  const claro = document.documentElement.dataset.theme !== "light";
  document.documentElement.dataset.theme = claro ? "light" : "dark";
  $("themeToggle").textContent = claro
    ? "🌙 Modo escuro"
    : "☀️ Modo claro";
});

$("closeDialog").onclick = () =>
  $("profileDialog").close();

$("profileDialog").addEventListener("click", e => {
  if (e.target === $("profileDialog"))
    $("profileDialog").close();
});

$("profileVisibility").onclick = alterarPrivacidade;

carregarPrivacidade();
pesquisar();
