import os
from datetime import date, timedelta
from getpass import getpass

from database.connection import conectar
from pwdlib import PasswordHash

# Protecao contra execucao em servidor remoto.
if os.getenv("DB_HOST") not in ("localhost", "127.0.0.1", "::1"):
    raise SystemExit("Execute apenas no banco local de desenvolvimento.")

senha = getpass("Escolha uma senha para as contas de demonstracao: ")

if len(senha) < 10:
    raise SystemExit("Utilize uma senha com pelo menos 10 caracteres.")

hasher = PasswordHash.recommended()

pessoas = [
    ("Ana Beatriz Souza", "Python,MySQL,Git", "desenvolvimento de sistemas"),
    ("Lucas Oliveira", "Java,Spring Boot,SQL", "programacao backend"),
    ("Mariana Santos", "Figma,UI Design,UX", "design digital"),
    ("Pedro Henrique Lima", "HTML,CSS,JavaScript", "desenvolvimento frontend"),
    ("Julia Rodrigues", "Python,Power BI,Excel", "analise de dados"),
    ("Rafael Almeida", "C#,Git,MySQL", "engenharia de software"),
    ("Camila Ferreira", "React,JavaScript,CSS", "desenvolvimento web"),
    ("Gustavo Ribeiro", "Linux,Redes,Docker", "infraestrutura"),
    ("Isabela Martins", "Excel,PowerPoint,Comunicacao", "administracao"),
    ("Bruno Costa", "Python,FastAPI,Docker", "desenvolvimento backend"),
    ("Larissa Gomes", "SQL,Power BI,Python", "ciencia de dados"),
    ("Felipe Carvalho", "React,TypeScript,Git", "desenvolvimento full stack"),
]

empresas = [
    ("NovaByte Tecnologia", "Tecnologia", "Desenvolvimento Backend"),
    ("PixelFlow Studio", "Design", "Design UX/UI"),
    ("DataWave Analytics", "Dados", "Analise de Dados"),
    ("CloudNova Sistemas", "Tecnologia", "Infraestrutura Cloud"),
    ("CodeBridge Solutions", "Tecnologia", "Desenvolvimento Frontend"),
    ("Nexo Digital", "Marketing", "Marketing Digital"),
    ("InovaTech Labs", "Tecnologia", "Desenvolvimento de Software"),
    ("Orbit Solutions", "Tecnologia", "Suporte Tecnico"),
    ("VisionData", "Dados", "Business Intelligence"),
    ("AlfaConnect", "Telecomunicacoes", "Redes de Computadores"),
    ("PrimeWork Consultoria", "Administracao", "Administracao"),
    ("FutureStack", "Tecnologia", "Desenvolvimento Full Stack"),
]

cidades = [
    "Sao Paulo", "Osasco", "Guarulhos",
    "Santo Andre", "Sao Bernardo do Campo", "Barueri"
]

con = conectar()
cur = con.cursor()

def buscar(sql, parametros=()):
    cur.execute(sql, parametros)
    return cur.fetchone()

def criar_usuario(email, tipo):
    registro = buscar(
        "SELECT id_usuario, tipo_usuario FROM usuarios WHERE email=%s",
        (email,)
    )

    if registro:
        if registro[1] != tipo:
            raise RuntimeError("Conta existente com tipo diferente: " + email)
        return registro[0], False

    cur.execute(
        """
        INSERT INTO usuarios (email, senha_hash, tipo_usuario)
        VALUES (%s, %s, %s)
        """,
        (email, hasher.hash(senha), tipo)
    )

    return cur.lastrowid, True

ids_candidatos = []
ids_empresas = []
ids_vagas = []

try:
    cur.execute("SELECT DATABASE()")
    banco = cur.fetchone()[0]

    if banco != "eazyintern":
        raise RuntimeError("Banco inesperado: " + str(banco))

    cur.execute("SELECT id_formacao, nome_curso FROM catalogo_formacoes ORDER BY id_formacao")
    formacoes = cur.fetchall()

    print("\n--- CADASTRANDO CANDIDATOS ---")

    for i, (nome, habilidades, area) in enumerate(pessoas, 1):

        email = f"demo.candidato{i:02d}@example.com"
        uid, novo = criar_usuario(email, "Candidato")

        nivel = "Estagi\u00e1rio" if i <= 9 else "J\u00fanior"
        cidade = cidades[(i-1) % len(cidades)]

        if novo:
            cur.execute(
                """
                INSERT INTO candidatos
                (id_usuario, nome_completo, nivel_carreira,
                 cidade, uf, biografia, perfil_publico)
                VALUES (%s,%s,%s,%s,'SP',%s,1)
                """,
                (
                    uid, nome, nivel, cidade,
                    f"Perfil ficticio de demonstracao. Interesse em {area}, projetos colaborativos e novas oportunidades."
                )
            )

            cid = cur.lastrowid

            for habilidade in habilidades.split(","):
                tag = buscar(
                    "SELECT id_tag FROM tags_conhecimento WHERE nome=%s",
                    (habilidade,)
                )

                if tag:
                    tid = tag[0]
                else:
                    cur.execute(
                        "INSERT INTO tags_conhecimento (nome,categoria) VALUES (%s,'Hard Skill')",
                        (habilidade,)
                    )
                    tid = cur.lastrowid

                cur.execute(
                    "INSERT INTO candidato_tags (id_candidato,id_tag) VALUES (%s,%s)",
                    (cid, tid)
                )

            palavras = (
                ["design"] if i == 3 else
                ["administra"] if i == 9 else
                ["dados", "estat"] if i in (5, 11) else
                ["redes", "infraestrutura"] if i == 8 else
                ["sistemas", "computa", "software", "inform"]
            )

            curso = next(
                (f for f in formacoes
                 if any(p in f[1].lower() for p in palavras)),
                None
            )

            if curso:
                cur.execute(
                    "INSERT INTO candidato_formacao (id_candidato,id_formacao,status) VALUES (%s,%s,'Cursando')",
                    (cid, curso[0])
                )

        else:
            perfil = buscar(
                "SELECT id_candidato FROM candidatos WHERE id_usuario=%s",
                (uid,)
            )
            if not perfil:
                raise RuntimeError("Conta sem perfil: " + email)
            cid = perfil[0]

        ids_candidatos.append(cid)
        print("[OK]", nome, "-", "Criado" if novo else "Existente")

    print("\n--- CADASTRANDO EMPRESAS ---")

    for i, (nome, setor, cargo) in enumerate(empresas, 1):

        email = f"demo.empresa{i:02d}@example.com"
        uid, novo = criar_usuario(email, "Empresa")
        cidade = cidades[(i-1) % len(cidades)]

        if novo:
            cur.execute(
                """
                INSERT INTO empresas
                (id_usuario,razao_social,nome_fantasia,setor,cidade,uf,descricao)
                VALUES (%s,%s,%s,%s,%s,'SP',%s)
                """,
                (
                    uid, nome + " LTDA", nome, setor, cidade,
                    f"Empresa ficticia de demonstracao especializada em {setor}."
                )
            )
            eid = cur.lastrowid

        else:
            perfil = buscar(
                "SELECT id_empresa FROM empresas WHERE id_usuario=%s",
                (uid,)
            )
            if not perfil:
                raise RuntimeError("Empresa sem perfil: " + email)
            eid = perfil[0]

        ids_empresas.append(eid)
        print("[OK]", nome, "-", "Criada" if novo else "Existente")

        for j in range(2):

            junior = j == 1 and i <= 6
            nivel = "J\u00fanior" if junior else "Estagi\u00e1rio"

            titulo = (
                cargo + " Junior"
                if junior else
                "Estagio em " + cargo + (" II" if j else "")
            )

            vaga = buscar(
                "SELECT id_vaga FROM vagas WHERE id_empresa=%s AND titulo=%s",
                (eid, titulo)
            )

            if vaga:
                vid = vaga[0]
            else:
                modalidade = ["Presencial", "Remoto", "H\u00edbrido"][(i+j) % 3]

                cur.execute(
                    """
                    INSERT INTO vagas
                    (id_empresa,titulo,nivel,descricao,requisitos,
                     beneficios,modalidade,cidade,uf,bolsa,
                     prazo_encerramento,status)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'SP',%s,%s,'Aberta')
                    """,
                    (
                        eid, titulo, nivel,
                        f"Oportunidade ficticia para atuar na area de {cargo}.",
                        "Conhecimentos basicos na area e vontade de aprender.",
                        "Vale-transporte e vale-alimentacao",
                        modalidade, cidade,
                        3000 if junior else 1000 + i*50,
                        date.today() + timedelta(days=60)
                    )
                )

                vid = cur.lastrowid

            ids_vagas.append((vid, junior))

    print("\n--- GERANDO CANDIDATURAS ---")

    status_lista = [
        "Pendente", "Em An\u00e1lise",
        "Entrevista", "Aprovado", "Reprovado"
    ]

    for i in range(30):
        posicao = i % 12
        cid = ids_candidatos[posicao]
        junior = posicao >= 9

        opcoes = [vid for vid, j in ids_vagas if j == junior]

        vid = opcoes[(posicao + i//12) % len(opcoes)]

        existe = buscar(
            "SELECT id_candidatura FROM candidaturas WHERE id_vaga=%s AND id_candidato=%s",
            (vid,cid)
        )

        if not existe:
            cur.execute(
                """
                INSERT INTO candidaturas (id_vaga,id_candidato,status)
                VALUES (%s,%s,%s)
                """,
                (vid,cid,status_lista[i % len(status_lista)])
            )

    con.commit()

    print("\n[SUCESSO] Banco de demonstracao preparado!")

    for tabela in ["usuarios","candidatos","empresas","vagas","candidaturas"]:
        cur.execute(f"SELECT COUNT(*) FROM `{tabela}`")
        print(tabela + ":", cur.fetchone()[0])

except Exception:
    con.rollback()
    print("[ERRO] Alteracoes desta execucao canceladas.")
    raise

finally:
    cur.close()
    con.close()
