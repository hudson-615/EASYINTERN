from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from mysql.connector import Error
from pydantic import BaseModel, Field, field_validator


from database.connection import conectar
from usuarios.routes import obter_usuario_autenticado

from datetime import date

import json


router = APIRouter(
    prefix="/dashboard/api/empresa",
    tags=["Dashboard Empresa"]
)

# MARCO_P2_HABILIDADES_V1
class HabilidadeVaga(BaseModel):
    nome: str = Field(min_length=1, max_length=50)
    obrigatorio: bool = False
    peso: int = Field(default=1, ge=1, le=5)

    @field_validator("nome")
    @classmethod
    def validar_nome(cls, valor: str):
        valor = valor.strip()
        if not valor:
            raise ValueError("Habilidade vazia.")
        return valor


def preparar_habilidades(dados: "NovaVaga") -> list[dict]:
    if dados.habilidades is not None:
        if dados.tags and dados.tags.strip():
            raise HTTPException(422, "Envie habilidades ou tags, não ambos.")
        itens = [
            {"nome": h.nome, "obrigatorio": h.obrigatorio, "peso": h.peso}
            for h in dados.habilidades
        ]
    else:
        itens = []
        for nome in (dados.tags or "").split(","):
            nome = nome.strip()
            if not nome:
                continue
            if len(nome) > 50:
                raise HTTPException(422, "Cada habilidade deve ter no máximo 50 caracteres.")
            itens.append({"nome": nome, "obrigatorio": False, "peso": 1})
    encontrados = set()
    for item in itens:
        chave = item["nome"].casefold()
        if chave in encontrados:
            raise HTTPException(422, "Habilidades duplicadas não são permitidas.")
        encontrados.add(chave)
    if len(itens) > 20:
        raise HTTPException(422, "Informe no máximo 20 habilidades.")
    return itens


from pydantic import model_validator
from dashboard.geolocalizacao import validar_coordenadas


UFS_VALIDAS = frozenset(
    "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE "
    "PI RJ RN RS RO RR SC SP SE TO".split()
)


class NovaVaga(BaseModel):
    titulo: str = Field(min_length=3, max_length=150)
    descricao: str = Field(min_length=10, max_length=5000)
    nivel: Literal["estagiario", "junior"]
    modalidade: Literal["presencial", "remoto", "hibrido"]

    requisitos: str | None = Field(default=None, max_length=5000)
    beneficios: str | None = Field(default=None, max_length=2000)
    tags: str | None = Field(default=None, max_length=1020)
    habilidades: list[HabilidadeVaga] | None = Field(default=None, max_length=20)
    cidade: str | None = Field(default=None, max_length=100)
    estado: str | None = Field(default=None, max_length=2)
    salario_min: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)

    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @field_validator("cidade", "requisitos", "beneficios", mode="before")
    @classmethod
    def normalizar_opcionais(cls, valor):
        if isinstance(valor, str):
            return valor.strip() or None
        return valor

    @field_validator("estado", mode="before")
    @classmethod
    def validar_estado(cls, valor):
        if valor is None:
            return None
        if not isinstance(valor, str):
            raise ValueError("UF invalida.")
        valor = valor.strip().upper()
        if not valor:
            return None
        if valor not in UFS_VALIDAS:
            raise ValueError("UF brasileira invalida.")
        return valor

    @model_validator(mode="after")
    def validar_localizacao(self):
        validar_coordenadas(self.latitude, self.longitude)
        return self

    prazo_encerramento: date

    @field_validator("titulo", "descricao", mode="before")
    @classmethod
    def validar_texto(cls, valor: str):
        if not isinstance(valor, str):
            raise ValueError("Informe um texto valido.")

        valor = valor.strip()

        if not valor:
            raise ValueError("O campo não pode estar vazio.")

        return valor

    @field_validator("prazo_encerramento")
    @classmethod
    def validar_prazo(cls, valor: date):
        if valor < date.today():
            raise ValueError(
                "O prazo de encerramento não pode estar no passado."
            )

        return valor

class AtualizarStatusCandidatura(BaseModel):
    status: Literal[
        "pendente",
        "em_analise",
        "entrevista",
        "aprovado",
        "reprovado"
    ]


# MARCO_P2_PERFIL_EMPRESA_V1
class EdicaoPerfilEmpresa(BaseModel):
    nome_fantasia: str = Field(min_length=2, max_length=150)
    setor: str | None = Field(default=None, max_length=100)
    cidade: str | None = Field(default=None, max_length=100)
    uf: str | None = Field(default=None, max_length=2)
    descricao: str | None = Field(default=None, max_length=2000)

    @field_validator("nome_fantasia", "setor", "cidade", "uf", "descricao")
    @classmethod
    def normalizar(cls, valor):
        if valor is None:
            return None
        return valor.strip() or None

    @field_validator("uf")
    @classmethod
    def validar_uf(cls, valor):
        if valor is not None and (len(valor) != 2 or not valor.isalpha()):
            raise ValueError("A UF precisa ter duas letras.")
        return valor.upper() if valor else None


@router.patch("/perfil")
def editar_perfil_empresa(
    dados: EdicaoPerfilEmpresa,
    token: dict = Depends(obter_usuario_autenticado)
):
    try:
        id_usuario = int(token["sub"])
    except (KeyError, TypeError, ValueError) as erro:
        raise HTTPException(status_code=401, detail="Identificação inválida.") from erro

    conexao = None
    cursor = None
    try:
        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)
        cursor.execute(
            """SELECT u.tipo_usuario, u.ativo, u.deletado_em, e.id_empresa
               FROM usuarios u
               LEFT JOIN empresas e ON e.id_usuario = u.id_usuario
               WHERE u.id_usuario = %s FOR UPDATE""",
            (id_usuario,)
        )
        empresa = cursor.fetchone()
        if not empresa or not empresa["ativo"] or empresa["deletado_em"] is not None:
            raise HTTPException(401, "Conta inexistente ou indisponível.")
        if empresa["tipo_usuario"] != "Empresa":
            raise HTTPException(403, "Acesso permitido apenas para empresas.")
        if empresa["id_empresa"] is None:
            raise HTTPException(404, "Perfil empresarial não encontrado.")
        cursor.execute(
            """UPDATE empresas SET nome_fantasia=%s, setor=%s, cidade=%s,
               uf=%s, descricao=%s WHERE id_empresa=%s AND id_usuario=%s""",
            (dados.nome_fantasia, dados.setor, dados.cidade,
             dados.uf, dados.descricao, empresa["id_empresa"], id_usuario)
        )
        conexao.commit()
        return {"mensagem": "Perfil empresarial atualizado com sucesso."}
    except HTTPException:
        if conexao is not None:
            conexao.rollback()
        raise
    except (Error, RuntimeError) as erro:
        if conexao is not None:
            conexao.rollback()
        raise HTTPException(503, "Não foi possível atualizar o perfil empresarial.") from erro
    finally:
        if cursor is not None:
            cursor.close()
        if conexao is not None:
            conexao.close()


@router.get("/stats")
def estatisticas_empresa(
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    try:
        try:
            id_usuario = int(token["sub"])
        except (ValueError, TypeError, KeyError) as erro:
            raise HTTPException(
                status_code=401,
                detail="Identificação de usuário inválida."
            ) from erro

        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)

        # Verifica a conta e identifica a empresa.
        cursor.execute(
            """
            SELECT
                e.id_empresa,
                e.razao_social,
                e.nome_fantasia,
                e.setor,
                e.cnpj,
                e.cidade,
                e.uf,
                e.descricao,
                u.email,
                u.tipo_usuario,
                u.ativo,
                u.deletado_em
            FROM empresas AS e
            JOIN usuarios AS u
                ON u.id_usuario = e.id_usuario
            WHERE u.id_usuario = %s
            """,
            (id_usuario,)
        )

        empresa = cursor.fetchone()

        if not empresa:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Empresa não encontrada."
            )

        if (
            not empresa["ativo"]
            or empresa["deletado_em"] is not None
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Conta inexistente ou indisponível."
            )

        if empresa["tipo_usuario"] != "Empresa":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso permitido apenas para empresas."
            )

        id_empresa = empresa["id_empresa"]

        # Conta vagas publicadas e vagas abertas
        # que ainda estão dentro do prazo.
        cursor.execute(
            """
            SELECT
                COUNT(*) AS total_vagas,

                COALESCE(
                    SUM(
                        status = 'Aberta'
                        AND (
                            prazo_encerramento IS NULL
                            OR prazo_encerramento >= CURDATE()
                        )
                    ),
                    0
                ) AS vagas_abertas

            FROM vagas
            WHERE id_empresa = %s
            """,
            (id_empresa,)
        )

        indicadores_vagas = cursor.fetchone()

        # Conta candidatos distintos inscritos nas
        # vagas da empresa e candidaturas aprovadas.
        cursor.execute(
            """
            SELECT
                COUNT(
                    DISTINCT CASE WHEN uc.id_usuario IS NOT NULL THEN ca.id_candidato END
                ) AS total_candidatos,

                COALESCE(
                    SUM(
                        ca.status = 'Aprovado' AND uc.id_usuario IS NOT NULL
                    ),
                    0
                ) AS aprovados

            FROM vagas AS v
            LEFT JOIN candidaturas AS ca
                ON ca.id_vaga = v.id_vaga
            LEFT JOIN candidatos AS cand
                ON cand.id_candidato = ca.id_candidato
            LEFT JOIN usuarios AS uc
                ON uc.id_usuario = cand.id_usuario
                AND uc.ativo = 1
                AND uc.deletado_em IS NULL

            WHERE v.id_empresa = %s
            """,
            (id_empresa,)
        )

        indicadores_candidatos = cursor.fetchone()

        nome_empresa = (
            empresa["nome_fantasia"]
            or empresa["razao_social"]
        )

        return {
            "empresa": nome_empresa,
            "setor": empresa["setor"],
            "cnpj": empresa["cnpj"],
            "email": empresa["email"],
            "cidade": empresa["cidade"],
            "uf": empresa["uf"],
            "descricao": empresa["descricao"],
            "total_vagas": int(
                indicadores_vagas["total_vagas"]
            ),
            "vagas_abertas": int(
                indicadores_vagas["vagas_abertas"]
            ),
            "total_candidatos": int(
                indicadores_candidatos["total_candidatos"]
            ),
            "aprovados": int(
                indicadores_candidatos["aprovados"]
            )
        }

    except HTTPException:
        raise

    except (ValueError, TypeError, KeyError) as erro:
        raise HTTPException(
            status_code=500,
            detail="Ocorreu um erro interno ao processar a solicitação."
        ) from erro

    except (Error, RuntimeError) as erro:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível consultar as estatísticas da empresa."
        ) from erro

    finally:
        if cursor is not None:
            cursor.close()

        if conexao is not None:
            conexao.close()


# ============================================================
# LISTAR VAGAS DA EMPRESA AUTENTICADA
# GET /dashboard/api/empresa/vagas
# ============================================================

@router.get("/vagas")
def listar_vagas_empresa(
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    try:
        try:
            id_usuario = int(token["sub"])
        except (ValueError, TypeError, KeyError) as erro:
            raise HTTPException(
                status_code=401,
                detail="Identificação de usuário inválida."
            ) from erro

        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)

        # Verifica o usuário autenticado.
        cursor.execute(
            """
            SELECT tipo_usuario, ativo, deletado_em
            FROM usuarios
            WHERE id_usuario = %s
            """,
            (id_usuario,)
        )

        usuario = cursor.fetchone()

        if (
            not usuario
            or not usuario["ativo"]
            or usuario["deletado_em"] is not None
        ):
            raise HTTPException(
                status_code=401,
                detail="Conta inexistente ou indisponível."
            )

        if usuario["tipo_usuario"] != "Empresa":
            raise HTTPException(
                status_code=403,
                detail="Acesso permitido apenas para empresas."
            )

        # Identifica a empresa do usuário.
        cursor.execute(
            """
            SELECT id_empresa
            FROM empresas
            WHERE id_usuario = %s
            """,
            (id_usuario,)
        )

        empresa = cursor.fetchone()

        if not empresa:
            raise HTTPException(
                status_code=404,
                detail="Perfil empresarial não encontrado."
            )

        # Lista somente as vagas desta empresa.
        cursor.execute(
            """
            SELECT
                v.id_vaga AS id,
                v.titulo,
                v.nivel,
                v.modalidade,
                v.status,
                v.prazo_encerramento,
                (
                    SELECT COUNT(*)
                    FROM candidaturas AS c
                    JOIN candidatos AS cand
                        ON cand.id_candidato = c.id_candidato
                    JOIN usuarios AS uc
                        ON uc.id_usuario = cand.id_usuario
                        AND uc.ativo = 1
                        AND uc.deletado_em IS NULL
                    WHERE c.id_vaga = v.id_vaga
                ) AS total_candidatos
            FROM vagas AS v
            WHERE v.id_empresa = %s
            ORDER BY v.criado_em DESC, v.id_vaga DESC
            """,
            (empresa["id_empresa"],)
        )

        registros = cursor.fetchall()

        vagas = []

        for vaga in registros:
            prazo = vaga["prazo_encerramento"]

            status_vaga = (vaga["status"] or "").lower()

            # Uma vaga aberta com prazo vencido
            # não deve ser exibida como disponível.
            if (
                status_vaga == "aberta"
                and prazo is not None
                and prazo < date.today()
            ):
                status_vaga = "encerrada"

            vagas.append({
                "id": vaga["id"],
                "titulo": vaga["titulo"],
                "nivel": (vaga["nivel"] or "").lower(),
                "modalidade": vaga["modalidade"],
                "status": status_vaga,
                "total_candidatos": int(
                    vaga["total_candidatos"]
                )
            })

        return vagas

    except HTTPException:
        raise

    except (ValueError, TypeError, KeyError) as erro:
        raise HTTPException(
            status_code=500,
            detail="Ocorreu um erro interno ao processar a solicitação."
        ) from erro

    except (Error, RuntimeError) as erro:
        raise HTTPException(
            status_code=503,
            detail="Não foi possível consultar as vagas."
        ) from erro

    finally:
        if cursor is not None:
            cursor.close()

        if conexao is not None:
            conexao.close()

# ============================================================
# LISTAR VAGAS EMPRESARIAIS COM PAGINACAO E FILTROS
# GET /dashboard/api/empresa/vagas/paginadas
# ============================================================

@router.get("/vagas/paginadas")
def listar_vagas_empresa_paginadas(
    pagina: int = Query(default=1, ge=1),
    limite: int = Query(default=10, ge=1, le=100),
    status_vaga: Literal[
        "aberta", "pausada", "encerrada"
    ] | None = Query(default=None, alias="status"),
    modalidade: Literal[
        "presencial", "remoto", "hibrido"
    ] | None = Query(default=None),
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    try:
        try:
            id_usuario = int(token["sub"])
        except (ValueError, TypeError, KeyError) as erro:
            raise HTTPException(
                status_code=401,
                detail="Identificação de usuário inválida."
            ) from erro

        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)

        # Verifica se o usuario esta ativo.
        cursor.execute(
            """
            SELECT tipo_usuario, ativo, deletado_em
            FROM usuarios
            WHERE id_usuario = %s
            """,
            (id_usuario,)
        )

        usuario = cursor.fetchone()

        if (
            not usuario
            or not usuario["ativo"]
            or usuario["deletado_em"] is not None
        ):
            raise HTTPException(
                status_code=401,
                detail="Conta inexistente ou indisponível."
            )

        if usuario["tipo_usuario"] != "Empresa":
            raise HTTPException(
                status_code=403,
                detail="Acesso permitido apenas para empresas."
            )

        # Identifica a empresa autenticada.
        cursor.execute(
            """
            SELECT id_empresa
            FROM empresas
            WHERE id_usuario = %s
            """,
            (id_usuario,)
        )

        empresa = cursor.fetchone()

        if not empresa:
            raise HTTPException(
                status_code=404,
                detail="Perfil empresarial não encontrado."
            )

        id_empresa = empresa["id_empresa"]

        # Considera vagas abertas com prazo vencido
        # como encerradas na listagem.
        status_calculado = """
            CASE
                WHEN LOWER(v.status) = 'aberta'
                 AND v.prazo_encerramento IS NOT NULL
                 AND v.prazo_encerramento < CURDATE()
                THEN 'encerrada'
                ELSE LOWER(v.status)
            END
        """

        filtros = ["v.id_empresa = %s"]
        parametros = [id_empresa]

        if status_vaga is not None:
            filtros.append(
                f"({status_calculado}) = %s"
            )
            parametros.append(status_vaga)

        if modalidade is not None:
            filtros.append(
                "LOWER(v.modalidade) = %s"
            )
            parametros.append(modalidade)

        condicoes = " AND ".join(filtros)

        # Calcula o total de vagas filtradas.
        cursor.execute(
            f"""
            SELECT COUNT(*) AS total
            FROM vagas AS v
            WHERE {condicoes}
            """,
            tuple(parametros)
        )

        total = int(cursor.fetchone()["total"])
        total_paginas = (
            (total + limite - 1) // limite
        )

        offset = (pagina - 1) * limite

        # Consulta apenas a pagina solicitada.
        cursor.execute(
            f"""
            SELECT
                v.id_vaga AS id,
                v.titulo,
                v.nivel,
                v.modalidade,
                ({status_calculado}) AS status_exibicao,
                (
                    SELECT COUNT(*)
                    FROM candidaturas AS c
                    JOIN candidatos AS cand
                        ON cand.id_candidato = c.id_candidato
                    JOIN usuarios AS uc
                        ON uc.id_usuario = cand.id_usuario
                        AND uc.ativo = 1
                        AND uc.deletado_em IS NULL
                    WHERE c.id_vaga = v.id_vaga
                ) AS total_candidatos
            FROM vagas AS v
            WHERE {condicoes}
            ORDER BY
                v.criado_em DESC,
                v.id_vaga DESC
            LIMIT %s OFFSET %s
            """,
            tuple(parametros + [limite, offset])
        )

        registros = cursor.fetchall()

        vagas = []

        for vaga in registros:
            vagas.append({
                "id": vaga["id"],
                "titulo": vaga["titulo"],
                "nivel": (
                    vaga["nivel"] or ""
                ).lower(),
                "modalidade": vaga["modalidade"],
                "status": vaga["status_exibicao"],
                "total_candidatos": int(
                    vaga["total_candidatos"]
                )
            })

        return {
            "vagas": vagas,
            "pagina": pagina,
            "limite": limite,
            "total": total,
            "total_paginas": total_paginas
        }

    except HTTPException:
        raise

    except (ValueError, TypeError, KeyError) as erro:
        raise HTTPException(
            status_code=500,
            detail="Ocorreu um erro interno ao processar a solicitação."
        ) from erro

    except (Error, RuntimeError) as erro:
        raise HTTPException(
            status_code=503,
            detail="Não foi possível consultar as vagas."
        ) from erro

    finally:
        if cursor is not None:
            cursor.close()

        if conexao is not None:
            conexao.close()

# ============================================================
# PUBLICAR VAGA DA EMPRESA
# POST /dashboard/api/empresa/vagas
# ============================================================

@router.post("/vagas", status_code=status.HTTP_201_CREATED)
def publicar_vaga_empresa(
    dados: NovaVaga,
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    try:

        try:
            id_usuario = int(token["sub"])
        except (ValueError, TypeError, KeyError) as erro:
            raise HTTPException(
                status_code=401,
                detail="Identificação de usuário inválida."
            ) from erro


        # Prepara as habilidades antes de gravar no banco.
        tags = []
        nomes_encontrados = set()

        if dados.tags:
            for nome in dados.tags.split(","):
                nome = nome.strip()

                if not nome:
                    continue

                if len(nome) > 50:
                    raise HTTPException(
                        status_code=422,
                        detail="Cada habilidade deve ter no máximo 50 caracteres."
                    )

                chave = nome.casefold()

                if chave not in nomes_encontrados:
                    nomes_encontrados.add(chave)
                    tags.append(nome)

        if len(tags) > 20:
            raise HTTPException(
                status_code=422,
                detail="Informe no máximo 20 habilidades."
            )

        habilidades_normalizadas = preparar_habilidades(dados)

        titulo = dados.titulo.strip()
        descricao = dados.descricao.strip()

        if len(titulo) < 3 or len(descricao) < 10:
            raise HTTPException(
                status_code=422,
                detail="Título ou descrição muito curtos."
            )

        # Conserva os requisitos livres na descrição.
        if dados.requisitos and dados.requisitos.strip():
            descricao += (
                "\n\nRequisitos / Habilidades:\n"
                + dados.requisitos.strip()
            )

        estado = (
            dados.estado.strip().upper()
            if dados.estado
            else None
        )

        cidade = (
            dados.cidade.strip()
            if dados.cidade
            else None
        )

        if estado and len(estado) != 2:
            raise HTTPException(
                status_code=422,
                detail="A UF deve conter 2 caracteres."
            )

        modalidades = {
            "presencial": "Presencial",
            "remoto": "Remoto",
            "hibrido": "Híbrido"
        }

        conexao = conectar()
        conexao.start_transaction()
        cursor = conexao.cursor(dictionary=True)

        # Valida a conta e identifica a empresa.
        cursor.execute(
            """
            SELECT
                e.id_empresa,
                u.tipo_usuario,
                u.ativo,
                u.deletado_em
            FROM usuarios AS u
            LEFT JOIN empresas AS e
                ON e.id_usuario = u.id_usuario
            WHERE u.id_usuario = %s
            FOR UPDATE
            """,
            (id_usuario,)
        )

        empresa = cursor.fetchone()

        if (
            not empresa
            or not empresa["ativo"]
            or empresa["deletado_em"] is not None
        ):
            raise HTTPException(
                status_code=401,
                detail="Conta inexistente ou indisponível."
            )

        if empresa["tipo_usuario"] != "Empresa":
            raise HTTPException(
                status_code=403,
                detail="Acesso permitido apenas para empresas."
            )

        if empresa["id_empresa"] is None:
            raise HTTPException(
                status_code=404,
                detail="Perfil empresarial não encontrado."
            )

        # Cria a vaga vinculada à empresa autenticada.
        cursor.execute(
            """
            INSERT INTO vagas (
                id_empresa,
                titulo,
                nivel,
                descricao,
                beneficios,
                modalidade,
                cidade,
                uf,
                latitude,
                longitude,
                bolsa,
                prazo_encerramento,
                status
            )
            VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, 'Aberta'
            )
            """,
            (
                empresa["id_empresa"],
                titulo,
                dados.nivel,
                descricao,
                dados.beneficios,
                modalidades[dados.modalidade],
                cidade,
                estado,
                dados.latitude,
                dados.longitude,
                dados.salario_min,
                dados.prazo_encerramento
            )
        )

        id_vaga = cursor.lastrowid

        # Cadastra ou recupera cada habilidade.
        for habilidade in habilidades_normalizadas:
            nome = habilidade["nome"]
            cursor.execute(
                """
                INSERT INTO tags_conhecimento (
                    nome,
                    categoria
                )
                VALUES (%s, 'Hard Skill')
                ON DUPLICATE KEY UPDATE
                    id_tag = LAST_INSERT_ID(id_tag)
                """,
                (nome,)
            )

            id_tag = cursor.lastrowid

            cursor.execute(
                """
                INSERT INTO vaga_tags (
                    id_vaga,
                    id_tag,
                    obrigatorio,
                    peso
                )
                VALUES (%s, %s, %s, %s)
                """,
                (id_vaga, id_tag, int(habilidade["obrigatorio"]), habilidade["peso"])
            )

        # Só confirma se todas as operações funcionaram.
        conexao.commit()

        return {
            "mensagem": "Vaga publicada com sucesso!",
            "id_vaga": id_vaga,
            "status": "Aberta"
        }

    except HTTPException:
        if conexao is not None:
            conexao.rollback()
        raise

    except (ValueError, TypeError, KeyError) as erro:
        if conexao is not None:
            conexao.rollback()

        raise HTTPException(
            status_code=500,
            detail="Ocorreu um erro interno ao processar a vaga."
        ) from erro


    except (Error, RuntimeError) as erro:
        if conexao is not None:
            conexao.rollback()

        raise HTTPException(
            status_code=503,
            detail="Não foi possível publicar a vaga."
        ) from erro

    finally:
        if cursor is not None:
            cursor.close()

        if conexao is not None:
            conexao.close()

# ============================================================
# CONSULTAR DETALHES DE UMA VAGA DA EMPRESA
# GET /dashboard/api/empresa/vagas/{id_vaga}
# ============================================================

@router.get("/vagas/{id_vaga}")
def detalhes_vaga_empresa(
    id_vaga: int,
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    try:
        try:
            id_usuario = int(token["sub"])
        except (ValueError, TypeError, KeyError) as erro:
            raise HTTPException(
                status_code=401,
                detail="Identificação de usuário inválida."
            ) from erro

        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)

        # Identifica a empresa autenticada.
        cursor.execute(
            """
            SELECT
                u.tipo_usuario,
                u.ativo,
                u.deletado_em,
                e.id_empresa
            FROM usuarios AS u
            LEFT JOIN empresas AS e
                ON e.id_usuario = u.id_usuario
            WHERE u.id_usuario = %s
            """,
            (id_usuario,)
        )

        empresa = cursor.fetchone()

        if (
            not empresa
            or not empresa["ativo"]
            or empresa["deletado_em"] is not None
        ):
            raise HTTPException(
                status_code=401,
                detail="Conta inexistente ou indisponível."
            )

        if empresa["tipo_usuario"] != "Empresa":
            raise HTTPException(
                status_code=403,
                detail="Acesso permitido apenas para empresas."
            )

        if empresa["id_empresa"] is None:
            raise HTTPException(
                status_code=404,
                detail="Perfil empresarial não encontrado."
            )

        # Só busca vagas pertencentes à empresa autenticada.
        cursor.execute(
            """
            SELECT
                id_vaga,
                titulo,
                descricao,
                beneficios,
                nivel,
                modalidade,
                cidade,
                uf,
                latitude,
                longitude,
                bolsa,
                prazo_encerramento,
                status
            FROM vagas
            WHERE id_vaga = %s
              AND id_empresa = %s
            """,
            (id_vaga, empresa["id_empresa"])
        )

        vaga = cursor.fetchone()

        if not vaga:
            raise HTTPException(
                status_code=404,
                detail="Vaga não encontrada."
            )

        cursor.execute(
            """
            SELECT t.nome, vt.obrigatorio, vt.peso
            FROM vaga_tags AS vt
            JOIN tags_conhecimento AS t
                ON t.id_tag = vt.id_tag
            WHERE vt.id_vaga = %s
            ORDER BY t.nome
            """,
            (id_vaga,)
        )

        habilidades_vaga = [
            {
                "nome": item["nome"],
                "obrigatorio": bool(item["obrigatorio"]),
                "peso": int(item["peso"] or 1),
            }
            for item in cursor.fetchall()
        ]
        tags = [item["nome"] for item in habilidades_vaga]

        descricao = vaga["descricao"] or ""
        requisitos = ""

        separador = "\n\nRequisitos / Habilidades:\n"

        if separador in descricao:
            descricao, _, requisitos = descricao.rpartition(
                separador
            )

        return {
            "id": vaga["id_vaga"],
            "titulo": vaga["titulo"],
            "descricao": descricao,
            "requisitos": requisitos,
            "beneficios": vaga["beneficios"],
            "nivel": (vaga["nivel"] or "").lower(),
            "modalidade": vaga["modalidade"],
            "cidade": vaga["cidade"],
            "estado": vaga["uf"],
            "latitude": (
                float(vaga["latitude"])
                if vaga.get("latitude") is not None else None
            ),
            "longitude": (
                float(vaga["longitude"])
                if vaga.get("longitude") is not None else None
            ),
            "salario_min": (
                float(vaga["bolsa"])
                if vaga["bolsa"] is not None
                else None
            ),
            "prazo_encerramento": (
                vaga["prazo_encerramento"].isoformat()
                if vaga["prazo_encerramento"]
                else None
            ),
            "status": vaga["status"],
            "tags": ", ".join(tags),
            "habilidades": habilidades_vaga
        }

    except HTTPException:
        raise

    except (Error, RuntimeError) as erro:
        raise HTTPException(
            status_code=503,
            detail="Não foi possível consultar a vaga."
        ) from erro

    finally:
        if cursor is not None:
            cursor.close()

        if conexao is not None:
            conexao.close()

# ============================================================
# EDITAR VAGA DA EMPRESA
# PATCH /dashboard/api/empresa/vagas/{id_vaga}
# ============================================================

@router.patch("/vagas/{id_vaga}")
def editar_vaga_empresa(
    id_vaga: int,
    dados: NovaVaga,
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    try:
        try:
            id_usuario = int(token["sub"])
        except (ValueError, TypeError, KeyError) as erro:
            raise HTTPException(
                status_code=401,
                detail="Identificação de usuário inválida."
            ) from erro

        if id_vaga <= 0:
            raise HTTPException(
                status_code=404,
                detail="Vaga não encontrada."
            )

        # Prepara e valida as tags antes da transação.
        tags = []
        nomes_encontrados = set()

        if dados.tags:
            for nome in dados.tags.split(","):
                nome = nome.strip()

                if not nome:
                    continue

                if len(nome) > 50:
                    raise HTTPException(
                        status_code=422,
                        detail="Cada habilidade deve ter no máximo 50 caracteres."
                    )

                chave = nome.casefold()

                if chave not in nomes_encontrados:
                    nomes_encontrados.add(chave)
                    tags.append(nome)

        if len(tags) > 20:
            raise HTTPException(
                status_code=422,
                detail="Informe no máximo 20 habilidades."
            )

        habilidades_normalizadas = preparar_habilidades(dados)

        titulo = dados.titulo.strip()
        descricao = dados.descricao.strip()

        if len(titulo) < 3 or len(descricao) < 10:
            raise HTTPException(
                status_code=422,
                detail="Título ou descrição muito curtos."
            )

        # Preserva os requisitos dentro da descrição.
        if dados.requisitos and dados.requisitos.strip():
            descricao += (
                "\n\nRequisitos / Habilidades:\n"
                + dados.requisitos.strip()
            )

        cidade = dados.cidade.strip() if dados.cidade else None
        estado = dados.estado.strip().upper() if dados.estado else None

        if estado and len(estado) != 2:
            raise HTTPException(
                status_code=422,
                detail="A UF deve conter 2 caracteres."
            )

        modalidades = {
            "presencial": "Presencial",
            "remoto": "Remoto",
            "hibrido": "Híbrido"
        }

        conexao = conectar()
        conexao.start_transaction()
        cursor = conexao.cursor(dictionary=True)

        # Identifica a empresa autenticada.
        cursor.execute(
            """
            SELECT
                u.tipo_usuario,
                u.ativo,
                u.deletado_em,
                e.id_empresa
            FROM usuarios AS u
            LEFT JOIN empresas AS e
                ON e.id_usuario = u.id_usuario
            WHERE u.id_usuario = %s
            """,
            (id_usuario,)
        )

        empresa = cursor.fetchone()

        if (
            not empresa
            or not empresa["ativo"]
            or empresa["deletado_em"] is not None
        ):
            raise HTTPException(
                status_code=401,
                detail="Conta inexistente ou indisponível."
            )

        if empresa["tipo_usuario"] != "Empresa":
            raise HTTPException(
                status_code=403,
                detail="Acesso permitido apenas para empresas."
            )

        if empresa["id_empresa"] is None:
            raise HTTPException(
                status_code=404,
                detail="Perfil empresarial não encontrado."
            )

        # Bloqueia a vaga e verifica sua propriedade.
        cursor.execute(
            """
            SELECT id_vaga, titulo, descricao, modalidade, bolsa
            FROM vagas
            WHERE id_vaga = %s
              AND id_empresa = %s
            FOR UPDATE
            """,
            (id_vaga, empresa["id_empresa"])
        )

        vaga_anterior = cursor.fetchone()
        if not vaga_anterior:
            raise HTTPException(
                status_code=404,
                detail="Vaga não encontrada."
            )

        cursor.execute(
            """
            SELECT t.nome, vt.obrigatorio, vt.peso
            FROM vaga_tags AS vt
            JOIN tags_conhecimento AS t
                ON t.id_tag = vt.id_tag
            WHERE vt.id_vaga = %s
            """,
            (id_vaga,)
        )

        habilidades_anteriores = {
            (h["nome"].casefold(), bool(h["obrigatorio"]), int(h["peso"]))
            for h in cursor.fetchall()
        }

        habilidades_novas = {
            (h["nome"].casefold(), bool(h["obrigatorio"]), int(h["peso"]))
            for h in habilidades_normalizadas
        }

        alterou_avaliacao = (
            vaga_anterior["titulo"] != titulo
            or vaga_anterior["descricao"] != descricao
            or vaga_anterior["modalidade"] != modalidades[dados.modalidade]
            or vaga_anterior["bolsa"] != dados.salario_min
            or habilidades_anteriores != habilidades_novas
        )

        # Atualiza apenas os campos permitidos.
        # O status da vaga permanece inalterado.
        cursor.execute(
            """
            UPDATE vagas
            SET
                titulo = %s,
                nivel = %s,
                descricao = %s,
                beneficios = %s,
                modalidade = %s,
                latitude = CASE
                    WHEN %s THEN %s
                    WHEN NOT (cidade <=> %s AND uf <=> %s) THEN NULL
                    ELSE latitude
                END,
                longitude = CASE
                    WHEN %s THEN %s
                    WHEN NOT (cidade <=> %s AND uf <=> %s) THEN NULL
                    ELSE longitude
                END,
                cidade = %s,
                uf = %s,
                bolsa = %s,
                prazo_encerramento = %s
            WHERE id_vaga = %s
              AND id_empresa = %s
            """,
            (
                titulo,
                dados.nivel,
                descricao,
                dados.beneficios,
                modalidades[dados.modalidade],
                bool({"latitude", "longitude"} & dados.model_fields_set),
                dados.latitude,
                cidade,
                estado,
                bool({"latitude", "longitude"} & dados.model_fields_set),
                dados.longitude,
                cidade,
                estado,
                cidade,
                estado,
                dados.salario_min,
                dados.prazo_encerramento,
                id_vaga,
                empresa["id_empresa"]
            )
        )

        # Substitui apenas as associações de tags da vaga.
        cursor.execute(
            """
            DELETE FROM vaga_tags
            WHERE id_vaga = %s
            """,
            (id_vaga,)
        )

        for habilidade in habilidades_normalizadas:
            nome = habilidade["nome"]
            cursor.execute(
                """
                INSERT INTO tags_conhecimento (
                    nome, categoria
                )
                VALUES (%s, 'Hard Skill')
                ON DUPLICATE KEY UPDATE
                    id_tag = LAST_INSERT_ID(id_tag)
                """,
                (nome,)
            )

            id_tag = cursor.lastrowid

            cursor.execute(
                """
                INSERT INTO vaga_tags (
                    id_vaga, id_tag, obrigatorio, peso
                )
                VALUES (%s, %s, %s, %s)
                """,
                (id_vaga, id_tag, int(habilidade["obrigatorio"]), habilidade["peso"])
            )

        if alterou_avaliacao:
            cursor.execute(
                """
                UPDATE vagas
                SET versao_avaliacao = versao_avaliacao + 1
                WHERE id_vaga = %s
                  AND id_empresa = %s
                """,
                (id_vaga, empresa["id_empresa"])
            )

            cursor.execute(
                """
                DELETE a FROM avaliacoes_ia AS a
                JOIN candidaturas AS c
                    ON c.id_candidatura = a.id_candidatura
                WHERE c.id_vaga = %s
                """,
                (id_vaga,)
            )

            cursor.execute(
                """
                DELETE ct FROM controle_avaliacoes_ia AS ct
                JOIN candidaturas AS c
                    ON c.id_candidatura = ct.id_candidatura
                WHERE c.id_vaga = %s
                """,
                (id_vaga,)
            )

        conexao.commit()

        return {
            "mensagem": "Vaga atualizada com sucesso!",
            "id_vaga": id_vaga
        }

    except HTTPException:
        if conexao is not None:
            conexao.rollback()
        raise

    except (Error, RuntimeError) as erro:
        if conexao is not None:
            conexao.rollback()

        raise HTTPException(
            status_code=503,
            detail="Não foi possível atualizar a vaga."
        ) from erro

    finally:
        if cursor is not None:
            cursor.close()

        if conexao is not None:
            conexao.close()

# ============================================================
# PATCH /dashboard/api/empresa/vagas/{id_vaga}/encerrar
# ============================================================

@router.patch("/vagas/{id_vaga}/encerrar")
def encerrar_vaga_empresa(
    id_vaga: int,
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    try:
        try:
            id_usuario = int(token["sub"])
        except (ValueError, TypeError, KeyError) as erro:
            raise HTTPException(
                status_code=401,
                detail="Identificação de usuário inválida."
            ) from erro

        if id_vaga <= 0:
            raise HTTPException(
                status_code=404,
                detail="Vaga não encontrada."
            )

        conexao = conectar()
        conexao.start_transaction()
        cursor = conexao.cursor(dictionary=True)

        # Verifica se o usuário possui uma empresa ativa.
        cursor.execute(
            """
            SELECT
                u.tipo_usuario,
                u.ativo,
                u.deletado_em,
                e.id_empresa
            FROM usuarios AS u
            LEFT JOIN empresas AS e
                ON e.id_usuario = u.id_usuario
            WHERE u.id_usuario = %s
            """,
            (id_usuario,)
        )

        empresa = cursor.fetchone()

        if (
            not empresa
            or not empresa["ativo"]
            or empresa["deletado_em"] is not None
        ):
            raise HTTPException(
                status_code=401,
                detail="Conta inexistente ou indisponível."
            )

        if empresa["tipo_usuario"] != "Empresa":
            raise HTTPException(
                status_code=403,
                detail="Acesso permitido apenas para empresas."
            )

        if empresa["id_empresa"] is None:
            raise HTTPException(
                status_code=404,
                detail="Perfil empresarial não encontrado."
            )

        # Bloqueia o registro e verifica a propriedade da vaga.
        cursor.execute(
            """
            SELECT id_vaga, status
            FROM vagas
            WHERE id_vaga = %s
              AND id_empresa = %s
            FOR UPDATE
            """,
            (id_vaga, empresa["id_empresa"])
        )

        vaga = cursor.fetchone()

        if not vaga:
            raise HTTPException(
                status_code=404,
                detail="Vaga não encontrada."
            )

        if vaga["status"] == "Encerrada":
            raise HTTPException(
                status_code=409,
                detail="Esta vaga já está encerrada."
            )

        if vaga["status"] != "Aberta":
            raise HTTPException(
                status_code=409,
                detail="Somente vagas abertas podem ser encerradas."
            )

        # Reabertura da vaga pausada, sem excluir registros.
        cursor.execute(
            """
            UPDATE vagas
            SET status = 'Encerrada'
            WHERE id_vaga = %s
              AND id_empresa = %s
              AND status = 'Aberta'
            """,
            (id_vaga, empresa["id_empresa"])
        )

        if cursor.rowcount != 1:
            raise HTTPException(
                status_code=409,
                detail="Não foi possível encerrar a vaga."
            )

        conexao.commit()

        return {
            "mensagem": "Vaga encerrada com sucesso!",
            "id_vaga": id_vaga,
            "status": "Encerrada"
        }

    except HTTPException:
        if conexao is not None:
            conexao.rollback()
        raise

    except (Error, RuntimeError) as erro:
        if conexao is not None:
            conexao.rollback()

        raise HTTPException(
            status_code=503,
            detail="Não foi possível encerrar a vaga."
        ) from erro

    finally:
        if cursor is not None:
            cursor.close()

        if conexao is not None:
            conexao.close()


@router.patch("/vagas/{id_vaga}/pausar")
def pausar_vaga_empresa(

    id_vaga: int,
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    try:
        try:
            id_usuario = int(token["sub"])
        except (ValueError, TypeError, KeyError) as erro:
            raise HTTPException(
                status_code=401,
                detail="Identificação de usuário inválida."
            ) from erro

        if id_vaga <= 0:
            raise HTTPException(
                status_code=404,
                detail="Vaga não encontrada."
            )

        conexao = conectar()
        conexao.start_transaction()
        cursor = conexao.cursor(dictionary=True)

        # Verifica se o usuário possui uma empresa ativa.
        cursor.execute(
            """
            SELECT
                u.tipo_usuario,
                u.ativo,
                u.deletado_em,
                e.id_empresa
            FROM usuarios AS u
            LEFT JOIN empresas AS e
                ON e.id_usuario = u.id_usuario
            WHERE u.id_usuario = %s
            """,
            (id_usuario,)
        )

        empresa = cursor.fetchone()

        if (
            not empresa
            or not empresa["ativo"]
            or empresa["deletado_em"] is not None
        ):
            raise HTTPException(
                status_code=401,
                detail="Conta inexistente ou indisponível."
            )

        if empresa["tipo_usuario"] != "Empresa":
            raise HTTPException(
                status_code=403,
                detail="Acesso permitido apenas para empresas."
            )

        if empresa["id_empresa"] is None:
            raise HTTPException(
                status_code=404,
                detail="Perfil empresarial não encontrado."
            )

        # Bloqueia o registro e verifica a propriedade da vaga.
        cursor.execute(
            """
            SELECT id_vaga, status
            FROM vagas
            WHERE id_vaga = %s
              AND id_empresa = %s
            FOR UPDATE
            """,
            (id_vaga, empresa["id_empresa"])
        )

        vaga = cursor.fetchone()

        if not vaga:
            raise HTTPException(
                status_code=404,
                detail="Vaga não encontrada."
            )


        if vaga["status"] == "Pausada":
            raise HTTPException(
                status_code=409,
                detail="Esta vaga já está pausada."
            )

        if vaga["status"] != "Aberta":
            raise HTTPException(
                status_code=409,
                detail="Somente vagas abertas podem ser pausadas."
            )

        # Pausa lógica: não exclui a vaga.
        cursor.execute(
            """
            UPDATE vagas
            SET status = 'Pausada'
            WHERE id_vaga = %s
              AND id_empresa = %s
              AND status = 'Aberta'
            """,
            (id_vaga, empresa["id_empresa"])
        )

        if cursor.rowcount != 1:
            raise HTTPException(
                status_code=409,
                detail="Não foi possível pausar a vaga."
            )

        conexao.commit()

        return {
            "mensagem": "Vaga pausada com sucesso!",
            "id_vaga": id_vaga,
            "status": "Pausada"
        }

    except HTTPException:
        if conexao is not None:
            conexao.rollback()
        raise

    except (Error, RuntimeError) as erro:
        if conexao is not None:
            conexao.rollback()

        raise HTTPException(
            status_code=503,
            detail="Não foi possível pausar a vaga."
        ) from erro

    finally:
        if cursor is not None:
            cursor.close()

        if conexao is not None:
            conexao.close()

@router.patch("/vagas/{id_vaga}/reabrir")
def reabrir_vaga_empresa(

    id_vaga: int,
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    try:
        try:
            id_usuario = int(token["sub"])
        except (ValueError, TypeError, KeyError) as erro:
            raise HTTPException(
                status_code=401,
                detail="Identificação de usuário inválida."
            ) from erro

        if id_vaga <= 0:
            raise HTTPException(
                status_code=404,
                detail="Vaga não encontrada."
            )

        conexao = conectar()
        conexao.start_transaction()
        cursor = conexao.cursor(dictionary=True)

        # Verifica se o usuário possui uma empresa ativa.
        cursor.execute(
            """
            SELECT
                u.tipo_usuario,
                u.ativo,
                u.deletado_em,
                e.id_empresa
            FROM usuarios AS u
            LEFT JOIN empresas AS e
                ON e.id_usuario = u.id_usuario
            WHERE u.id_usuario = %s
            """,
            (id_usuario,)
        )

        empresa = cursor.fetchone()

        if (
            not empresa
            or not empresa["ativo"]
            or empresa["deletado_em"] is not None
        ):
            raise HTTPException(
                status_code=401,
                detail="Conta inexistente ou indisponível."
            )

        if empresa["tipo_usuario"] != "Empresa":
            raise HTTPException(
                status_code=403,
                detail="Acesso permitido apenas para empresas."
            )

        if empresa["id_empresa"] is None:
            raise HTTPException(
                status_code=404,
                detail="Perfil empresarial não encontrado."
            )

        # Bloqueia o registro e verifica a propriedade da vaga.
        cursor.execute(
            """
            SELECT
                id_vaga,
                status,
                prazo_encerramento,
                (
                    prazo_encerramento IS NOT NULL
                    AND prazo_encerramento >= CURDATE()
                ) AS prazo_valido
            FROM vagas
            WHERE id_vaga = %s
              AND id_empresa = %s
            FOR UPDATE
            """,
            (id_vaga, empresa["id_empresa"])
        )

        vaga = cursor.fetchone()

        if not vaga:
            raise HTTPException(
                status_code=404,
                detail="Vaga não encontrada."
            )



        if vaga["status"] == "Aberta":
            raise HTTPException(
                status_code=409,
                detail="Esta vaga já está aberta."
            )

        if vaga["status"] != "Pausada":
            raise HTTPException(
                status_code=409,
                detail="Somente vagas pausadas podem ser reabertas."
            )

        if not vaga["prazo_valido"]:
            raise HTTPException(
                status_code=409,
                detail="Não é possível reabrir uma vaga com prazo vencido ou ausente."
            )


        # Encerramento lógico: não exclui a vaga.
        cursor.execute(
            """
            UPDATE vagas
            SET status = 'Aberta'
            WHERE id_vaga = %s
              AND id_empresa = %s
              AND status = 'Pausada'
              AND prazo_encerramento IS NOT NULL
              AND prazo_encerramento >= CURDATE()
            """,
            (id_vaga, empresa["id_empresa"])
        )

        if cursor.rowcount != 1:
            raise HTTPException(
                status_code=409,
                detail="Não foi possível reabrir a vaga."
            )

        conexao.commit()

        return {
            "mensagem": "Vaga reaberta com sucesso!",
            "id_vaga": id_vaga,
            "status": "Aberta"
        }

    except HTTPException:
        if conexao is not None:
            conexao.rollback()
        raise

    except (Error, RuntimeError) as erro:
        if conexao is not None:
            conexao.rollback()

        raise HTTPException(
            status_code=503,
            detail="Não foi possível reabrir a vaga."
        ) from erro

    finally:
        if cursor is not None:
            cursor.close()

        if conexao is not None:
            conexao.close()

# ============================================================
# GET /dashboard/api/empresa/candidatos/{id_vaga}
# ============================================================

@router.get("/candidatos/{id_vaga}")
def listar_candidatos_vaga_empresa(
    id_vaga: int,
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    try:
        try:
            id_usuario = int(token["sub"])
        except (ValueError, TypeError, KeyError) as erro:
            raise HTTPException(
                status_code=401,
                detail="Identificação de usuário inválida."
            ) from erro

        if id_vaga <= 0:
            raise HTTPException(
                status_code=404,
                detail="Vaga não encontrada."
            )

        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)

        # Confirma que a conta é uma empresa ativa.
        cursor.execute(
            """
            SELECT
                u.tipo_usuario,
                u.ativo,
                u.deletado_em,
                e.id_empresa
            FROM usuarios AS u
            LEFT JOIN empresas AS e
                ON e.id_usuario = u.id_usuario
            WHERE u.id_usuario = %s
            """,
            (id_usuario,)
        )

        empresa = cursor.fetchone()

        if (
            not empresa
            or not empresa["ativo"]
            or empresa["deletado_em"] is not None
        ):
            raise HTTPException(
                status_code=401,
                detail="Conta inexistente ou indisponível."
            )

        if empresa["tipo_usuario"] != "Empresa":
            raise HTTPException(
                status_code=403,
                detail="Acesso permitido apenas para empresas."
            )

        if empresa["id_empresa"] is None:
            raise HTTPException(
                status_code=404,
                detail="Perfil empresarial não encontrado."
            )

        # A vaga precisa pertencer à empresa autenticada.
        cursor.execute(
            """
            SELECT id_vaga
            FROM vagas
            WHERE id_vaga = %s
              AND id_empresa = %s
            """,
            (id_vaga, empresa["id_empresa"])
        )

        if not cursor.fetchone():
            raise HTTPException(
                status_code=404,
                detail="Vaga não encontrada."
            )

        # Consulta somente inscrições da vaga autorizada.
        cursor.execute(
            """
            SELECT
                ca.id_candidatura,
                ca.id_candidato,
                ca.status,
                ca.data_candidatura,
                c.nome_completo,
                c.nivel_carreira,
                c.cidade,
                c.uf,
                c.biografia,
                c.linkedin_url,
                c.github_url,
                (
                    SELECT GROUP_CONCAT(DISTINCT t.nome ORDER BY t.nome SEPARATOR ', ')
                    FROM candidato_tags ct
                    JOIN tags_conhecimento t ON t.id_tag = ct.id_tag
                    WHERE ct.id_candidato = ca.id_candidato
                ) AS habilidades,
                (
                    SELECT GROUP_CONCAT(DISTINCT f.nome_curso ORDER BY f.nome_curso SEPARATOR ', ')
                    FROM candidato_formacao cf
                    JOIN catalogo_formacoes f ON f.id_formacao = cf.id_formacao
                    WHERE cf.id_candidato = ca.id_candidato
                ) AS formacoes
            FROM candidaturas AS ca
            INNER JOIN candidatos AS c
                ON c.id_candidato = ca.id_candidato
            INNER JOIN usuarios AS uc
                ON uc.id_usuario = c.id_usuario
                AND uc.ativo = 1
                AND uc.deletado_em IS NULL
            INNER JOIN vagas AS v
                ON v.id_vaga = ca.id_vaga
            WHERE ca.id_vaga = %s
              AND v.id_empresa = %s
            ORDER BY
                ca.data_candidatura DESC,
                ca.id_candidatura DESC
            """,
            (id_vaga, empresa["id_empresa"])
        )

        registros = cursor.fetchall()

        # Avaliacoes reais, vinculadas apenas a candidatura da vaga da empresa.
        # Se nao houver avaliacao, o painel exibe "Nao avaliado".
        avaliacoes = {}
        if registros:
            cursor.execute(
                """
                SELECT
                    ca.id_candidatura,
                    a.match_score,
                    a.veredito_ia,
                    a.pontos_fortes,
                    a.pontos_atencao
                FROM candidaturas AS ca
                INNER JOIN candidatos AS c
                    ON c.id_candidato = ca.id_candidato
                INNER JOIN usuarios AS uc
                    ON uc.id_usuario = c.id_usuario
                    AND uc.ativo = 1
                    AND uc.deletado_em IS NULL
                INNER JOIN vagas AS v ON v.id_vaga = ca.id_vaga
                INNER JOIN avaliacoes_ia AS a
                    ON a.id_avaliacao = (
                        SELECT a2.id_avaliacao
                        FROM avaliacoes_ia AS a2
                        WHERE a2.id_candidatura = ca.id_candidatura
                        ORDER BY a2.data_analise DESC, a2.id_avaliacao DESC
                        LIMIT 1
                    )
                WHERE ca.id_vaga = %s AND v.id_empresa = %s
                """,
                (id_vaga, empresa["id_empresa"])
            )
            avaliacoes = {
                item["id_candidatura"]: item
                for item in cursor.fetchall()
            }

        candidatos = []

        for registro in registros:
            data = registro["data_candidatura"]

            candidatos.append({
                "candidatura_id": registro["id_candidatura"],
                "candidato_id": registro["id_candidato"],
                "nome": registro["nome_completo"],
                "area_interesse": (registro.get("formacoes") or "").split(", ")[0] or None,
                "formacoes": registro.get("formacoes") or "",
                "habilidades": registro.get("habilidades") or "",
                "biografia": registro.get("biografia") or "",
                "linkedin_url": registro.get("linkedin_url") or "",
                "github_url": registro.get("github_url") or "",
                "nivel_carreira": registro["nivel_carreira"],
                "cidade": registro["cidade"],
                "uf": registro["uf"],

                "status": (
                        "em_analise"
                        if registro["status"] == "Em Análise"
                        else registro["status"].lower()
                        if registro["status"]
                        else "pendente"
                ),

                "data_candidatura": (
                    data.isoformat() if data else None
                ),
                "match": (
                    {
                        "score": float(avaliacoes[registro["id_candidatura"]]["match_score"])
                        if avaliacoes[registro["id_candidatura"]]["match_score"] is not None
                        else None,
                        "veredicto": avaliacoes[registro["id_candidatura"]]["veredito_ia"],
                        "pontos_fortes": avaliacoes[registro["id_candidatura"]]["pontos_fortes"],
                        "pontos_atencao": avaliacoes[registro["id_candidatura"]]["pontos_atencao"]
                    }
                    if registro["id_candidatura"] in avaliacoes else None
                )
            })

        candidatos.sort(
            key=lambda candidato: (
                candidato["match"] is None
                or candidato["match"]["score"] is None,
                -(candidato["match"]["score"] if candidato["match"] and candidato["match"]["score"] is not None else 0)
            )
        )

        return candidatos

    except HTTPException:
        raise

    except (Error, RuntimeError) as erro:
        raise HTTPException(
            status_code=503,
            detail="Não foi possível listar os candidatos."
        ) from erro

    finally:
        if cursor is not None:
            cursor.close()

        if conexao is not None:
            conexao.close()

# ============================================================
# PATCH /dashboard/api/empresa/candidaturas/{id}/status
# ============================================================

@router.patch("/candidaturas/{id_candidatura}/status")
def atualizar_status_candidatura_empresa(
    id_candidatura: int,
    dados: AtualizarStatusCandidatura,
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    mapa_status = {
        "pendente": "Pendente",
        "em_analise": "Em Análise",
        "entrevista": "Entrevista",
        "aprovado": "Aprovado",
        "reprovado": "Reprovado"
    }

    try:
        try:
            id_usuario = int(token["sub"])
        except (ValueError, TypeError, KeyError) as erro:
            raise HTTPException(
                status_code=401,
                detail="Identificação de usuário inválida."
            ) from erro

        if id_candidatura <= 0:
            raise HTTPException(
                status_code=404,
                detail="Candidatura não encontrada."
            )

        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)

        # Verifica a conta empresarial autenticada.
        cursor.execute(
            """
            SELECT
                u.tipo_usuario,
                u.ativo,
                u.deletado_em,
                e.id_empresa
            FROM usuarios AS u
            LEFT JOIN empresas AS e
                ON e.id_usuario = u.id_usuario
            WHERE u.id_usuario = %s
            """,
            (id_usuario,)
        )

        empresa = cursor.fetchone()

        if (
            not empresa
            or not empresa["ativo"]
            or empresa["deletado_em"] is not None
        ):
            raise HTTPException(
                status_code=401,
                detail="Conta inexistente ou indisponível."
            )

        if empresa["tipo_usuario"] != "Empresa":
            raise HTTPException(
                status_code=403,
                detail="Acesso permitido apenas para empresas."
            )

        if empresa["id_empresa"] is None:
            raise HTTPException(
                status_code=404,
                detail="Perfil empresarial não encontrado."
            )

        # Confirma a propriedade da candidatura.
        # FOR UPDATE protege a linha durante a atualização.
        cursor.execute(
            """
            SELECT
                ca.id_candidatura,
                ca.id_vaga,
                ca.status
            FROM candidaturas AS ca
            INNER JOIN candidatos AS c
                ON c.id_candidato = ca.id_candidato
            INNER JOIN usuarios AS uc
                ON uc.id_usuario = c.id_usuario
                AND uc.ativo = 1
                AND uc.deletado_em IS NULL
            INNER JOIN vagas AS v
                ON v.id_vaga = ca.id_vaga
            WHERE ca.id_candidatura = %s
              AND v.id_empresa = %s
            FOR UPDATE
            """,
            (id_candidatura, empresa["id_empresa"])
        )

        candidatura = cursor.fetchone()

        if not candidatura:
            raise HTTPException(
                status_code=404,
                detail="Candidatura não encontrada."
            )

        novo_status = mapa_status[dados.status]

        # Atualização idempotente: repetir o mesmo
        # status não modifica a candidatura.
        if candidatura["status"] == novo_status:
            conexao.commit()

            return {
                "mensagem": "A candidatura já possui esse status.",
                "id_candidatura": id_candidatura,
                "id_vaga": candidatura["id_vaga"],
                "status": dados.status
            }


        # Fluxo controlado: nao pular etapas, nao retroceder e nao reabrir
        # candidaturas finalizadas. Reprovacao e possivel em qualquer etapa ativa.
        transicoes_permitidas = {
            "Pendente": {"Em Análise", "Reprovado"},
            "Em Análise": {"Entrevista", "Reprovado"},
            "Entrevista": {"Aprovado", "Reprovado"},
            "Aprovado": set(),
            "Reprovado": set(),
        }
        status_atual = candidatura["status"]
        if novo_status not in transicoes_permitidas.get(status_atual, set()):
            raise HTTPException(
                status_code=409,
                detail=f"Transição de status não permitida: {status_atual} → {novo_status}."
            )

        status_anterior = candidatura["status"]

        # Atualiza o status da candidatura autorizada.
        cursor.execute(
            """
            UPDATE candidaturas
            SET status = %s
            WHERE id_candidatura = %s
            """,
            (novo_status, id_candidatura)
        )

        # Registra a mudança na auditoria.
        # Não armazenamos dados pessoais desnecessários.
        cursor.execute(
            """
            INSERT INTO auditoria (
                id_usuario,
                acao,
                tabela,
                registro_id,
                dados_antes,
                dados_depois
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                id_usuario,
                "ALTERAR_STATUS_CANDIDATURA",
                "candidaturas",
                id_candidatura,
                json.dumps(
                    {"status": status_anterior},
                    ensure_ascii=False
                ),
                json.dumps(
                    {"status": novo_status},
                    ensure_ascii=False
                )
            )
        )

        # Confirma atualização e histórico juntos.
        conexao.commit()


        return {
            "mensagem": "Status atualizado com sucesso!",
            "id_candidatura": id_candidatura,
            "id_vaga": candidatura["id_vaga"],
            "status": dados.status
        }

    except HTTPException:
        if conexao is not None:
            conexao.rollback()
        raise

    except (Error, RuntimeError) as erro:
        if conexao is not None:
            conexao.rollback()

        raise HTTPException(
            status_code=503,
            detail="Não foi possível atualizar o status."
        ) from erro

    finally:
        if cursor is not None:
            cursor.close()

        if conexao is not None:
            conexao.close()
