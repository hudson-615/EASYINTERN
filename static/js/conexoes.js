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
    if (!atendeFiltrosPessoas(p)) return false;

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
    // EI2-STUDENT-PHOTO
    const foto = p.url_foto || p.foto_perfil || '';

    if (foto) {
      try {
        const url = new URL(foto, location.origin);

        if (['http:', 'https:'].includes(url.protocol)) {
          const imagem = document.createElement('img');

          imagem.src = url.href;
          imagem.alt = '';
          imagem.loading = 'lazy';

          imagem.addEventListener('error', () => {
            imagem.remove();
          });

          avatar.append(imagem);
        }
      } catch {}
    }


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
    atualizarFiltrosPessoas();
    filtrar();
  } catch (erro) {
    if (numero !== buscaAtual) return;
    pessoas = [];
    filtrar();
    aviso(erro.message);
  }
}


// EI2-PUBLIC-PROFILE

let consultaPerfil = 0;

async function abrirPerfil(id) {
  const consulta = ++consultaPerfil;

  try {
    const p = await api(`/api/social/candidatos/${id}`);

    if (consulta !== consultaPerfil) return;

    let pagina = $('ei2PublicProfile');

    if (!pagina) {
      pagina = criar('section', 'ei2-public-profile');
      pagina.id = 'ei2PublicProfile';
      document.querySelector('.discover').after(pagina);
    }

    pagina.replaceChildren();

    const voltar = criar(
      'button', 'ei2-profile-back', '\u2190 Voltar para Pessoas'
    );

    voltar.type = 'button';

    voltar.onclick = () => {
      consultaPerfil++;
      pagina.hidden = true;
      document.body.classList.remove('ei2-viewing-profile');
      voltarParaTopo();
    };

    function voltarParaTopo() {
      if (window.parent !== window) {
        window.frameElement?.scrollIntoView({block: 'start'});
      } else {
        window.scrollTo(0, 0);
      }
    }

    const card = criar('article', 'ei2-profile-card');
    const capa = criar('div', 'ei2-profile-cover');
    const info = criar('div', 'ei2-profile-info');

    const iniciais = String(p.nome || '?')
      .trim().split(/\s+/).slice(0, 2)
      .map(x => x.charAt(0)).join('').toUpperCase();

    const avatar = criar(
      'div', 'ei2-public-avatar', iniciais
    );

    const foto = p.url_foto || p.foto_perfil;

    if (foto) {
      try {
        const url = new URL(foto, location.origin);

        if (['http:', 'https:'].includes(url.protocol)) {
          const img = document.createElement('img');
          img.src = url.href;
          img.alt = '';
          img.onerror = () => img.remove();
          avatar.append(img);
        }
      } catch {}
    }

    const nome = criar('h1', '', p.nome);
    const curso = criar(
      'p', 'ei2-profile-course',
      p.formacao || p.nivel_carreira || 'Estudante'
    );

    const local = criar(
      'p', 'ei2-profile-location',
      [p.cidade, p.uf].filter(Boolean).join(', ')
    );

    const acoes = criar('div', 'ei2-profile-actions');

    const seguir = criar('button', 'ei2-follow-btn', '\u002b Seguir');
    const mensagem = criar(
      'button', 'ei2-message-btn', '\u2709 Mensagem'
    );

    [seguir, mensagem].forEach(btn => {
      btn.type = 'button';
      btn.disabled = true;
      btn.title = 'Funcionalidade em desenvolvimento';
    });

    acoes.append(seguir, mensagem);

    info.append(avatar, nome, curso, local, acoes);
    card.append(capa, info);

    const abas = criar('div', 'ei2-profile-tabs');
    const conteudo = criar('div', 'ei2-profile-content');

    function exibirAba(aba) {
      conteudo.replaceChildren();

      abas.querySelectorAll('button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === aba);
      });

      if (aba === 'Sobre') {
        const sobre = criar('article', 'ei2-profile-card ei2-profile-block');

        sobre.append(
          criar('h2', '', 'Sobre mim'),
          criar('p', '', p.biografia || 'Sem apresentacao cadastrada.')
        );

        const skills = criar('article', 'ei2-profile-card ei2-profile-block');
        skills.append(criar('h2', '', 'Habilidades'));

        const tags = criar('div', 'tags');

        habilidades(p).forEach(h => {
          tags.append(criar('span', 'tag', h));
        });

        if (!tags.children.length) {
          skills.append(criar('p', '', 'Nenhuma habilidade cadastrada.'));
        } else {
          skills.append(tags);
        }

        conteudo.append(sobre, skills);
      }

      if (aba === 'Projetos') {
        const bloco = criar('article', 'ei2-profile-card ei2-profile-block');
        bloco.append(
          criar('h2', '', 'Projetos'),
          criar('p', '', 'Portfolio em desenvolvimento.')
        );
        conteudo.append(bloco);
      }

      if (aba === 'Formacao') {
        const bloco = criar('article', 'ei2-profile-card ei2-profile-block');

        bloco.append(
          criar('h2', '', 'Forma\u00e7\u00e3o acad\u00eamica'),
          criar('p', '', p.formacao || 'Nenhuma formacao cadastrada.')
        );

        conteudo.append(bloco);
      }
    }

    ['Sobre', 'Projetos', 'Formacao'].forEach(aba => {
      const btn = criar(
        'button', '',
        aba === 'Formacao' ? 'Forma\u00e7\u00e3o' : aba
      );

      btn.type = 'button';
      btn.dataset.view = aba;
      btn.onclick = () => exibirAba(aba);
      abas.append(btn);
    });

    pagina.append(voltar, card, abas, conteudo);
    pagina.hidden = false;

    document.body.classList.add('ei2-viewing-profile');

    exibirAba('Sobre');
    voltarParaTopo();

  } catch (erro) {
    if (consulta === consultaPerfil) aviso(erro.message);
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


// EI2-EMBEDDED-THEME
if (new URLSearchParams(location.search).get('embedded') === '1'
    && window.parent !== window) {

    function sincronizar() {
        const tema = window.parent.document.body.dataset.theme;
        document.documentElement.dataset.theme =
            tema === 'dark' ? 'dark' : 'light';
    }

    sincronizar();

    new MutationObserver(sincronizar).observe(
        window.parent.document.body,
        { attributes: true, attributeFilter: ['data-theme'] }
    );
}


// EI2-PEOPLE-DYNAMIC-FILTERS

function atualizarFiltrosPessoas() {
  const filtros = {
    filterCourse: pessoas.flatMap(p =>
      String(p.formacao || '').split(',')
    ),
    filterSkill: pessoas.flatMap(p => habilidades(p)),
    filterLocation: pessoas.map(p =>
      [p.cidade, p.uf].filter(Boolean).join(', ')
    )
  };

  Object.entries(filtros).forEach(([id, valores]) => {
    const select = $(id);
    if (!select) return;

    const selecionado = select.value;

    const opcoes = [...new Set(
      valores.map(v => v.trim()).filter(Boolean)
    )].sort((a,b) => a.localeCompare(b, 'pt-BR'));

    select.options.length = 1;

    opcoes.forEach(valor => {
      select.add(new Option(valor, valor));
    });

    if (selecionado && !opcoes.includes(selecionado)) {
      select.add(new Option(selecionado, selecionado));
    }

    select.value = selecionado;
  });
}

function atendeFiltrosPessoas(p) {
  const curso = $('filterCourse')?.value || '';
  const habilidade = $('filterSkill')?.value || '';
  const local = $('filterLocation')?.value || '';

  const cursos = String(p.formacao || '')
    .split(',').map(v => v.trim());

  const localPessoa = [p.cidade, p.uf]
    .filter(Boolean).join(', ');

  return (!curso || cursos.includes(curso))
      && (!habilidade || habilidades(p).includes(habilidade))
      && (!local || localPessoa === local);
}

['filterCourse', 'filterSkill', 'filterLocation']
  .forEach(id => {
    $(id)?.addEventListener('change', filtrar);
  });

$('clearPeopleFilters')?.addEventListener('click', () => {
  ['filterCourse', 'filterSkill', 'filterLocation', 'areaFilter']
    .forEach(id => {
      if ($(id)) $(id).value = '';
    });

  filtrar();
});



// EI2-PUBLIC-PROFILE-HEADING

if (window.parent !== window) {
    function atualizarTituloPerfil() {
        const titulo = window.parent.document.querySelector(
            '.ei2-people-heading'
        );

        if (titulo) {
            titulo.hidden = document.body.classList.contains(
                'ei2-viewing-profile'
            );
        }
    }

    new MutationObserver(atualizarTituloPerfil).observe(
        document.body,
        {
            attributes: true,
            attributeFilter: ['class']
        }
    );

    atualizarTituloPerfil();
}
