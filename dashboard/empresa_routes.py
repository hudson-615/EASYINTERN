from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
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

class NovaVaga(BaseModel):
    titulo: str = Field(min_length=3, max_length=150)
    descricao: str = Field(min_length=10)
    nivel: Literal["estagiario", "junior"]
    modalidade: Literal["presencial", "remoto", "hibrido"]

    requisitos: str | None = None
    beneficios: str | None = None
    tags: str | None = None
    cidade: str | None = Field(default=None, max_length=100)
    estado: str | None = Field(default=None, max_length=2)
    salario_min: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)

    prazo_encerramento: date

    @field_validator("titulo", "descricao")
    @classmethod
    def validar_texto(cls, valor: str):
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


@router.get("/stats")
def estatisticas_empresa(
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    try:
        # Identifica o usuário por meio do JWT.
        id_usuario = int(token["sub"])

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
                    DISTINCT ca.id_candidato
                ) AS total_candidatos,

                COALESCE(
                    SUM(
                        ca.status = 'Aprovado'
                    ),
                    0
                ) AS aprovados

            FROM vagas AS v
            LEFT JOIN candidaturas AS ca
                ON ca.id_vaga = v.id_vaga

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
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identificação de usuário inválida."
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
        id_usuario = int(token["sub"])

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
            status_code=401,
            detail="Identificação de usuário inválida."
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
                bolsa,
                prazo_encerramento,
                status
            )
            VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, 'Aberta'
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
                dados.salario_min,
                dados.prazo_encerramento
            )
        )

        id_vaga = cursor.lastrowid

        # Cadastra ou recupera cada habilidade.
        for nome in tags:
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
                VALUES (%s, %s, 0, 1)
                """,
                (id_vaga, id_tag)
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
            SELECT t.nome
            FROM vaga_tags AS vt
            JOIN tags_conhecimento AS t
                ON t.id_tag = vt.id_tag
            WHERE vt.id_vaga = %s
            ORDER BY t.nome
            """,
            (id_vaga,)
        )

        tags = [item["nome"] for item in cursor.fetchall()]

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
            "tags": ", ".join(tags)
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
            SELECT id_vaga
            FROM vagas
            WHERE id_vaga = %s
              AND id_empresa = %s
            FOR UPDATE
            """,
            (id_vaga, empresa["id_empresa"])
        )

        if not cursor.fetchone():
            raise HTTPException(
                status_code=404,
                detail="Vaga não encontrada."
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

        for nome in tags:
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
                VALUES (%s, %s, 0, 1)
                """,
                (id_vaga, id_tag)
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
                c.uf
            FROM candidaturas AS ca
            INNER JOIN candidatos AS c
                ON c.id_candidato = ca.id_candidato
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

        candidatos = []

        for registro in registros:
            data = registro["data_candidatura"]

            candidatos.append({
                "candidatura_id": registro["id_candidatura"],
                "candidato_id": registro["id_candidato"],
                "nome": registro["nome_completo"],
                "area_interesse": None,
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
                "match": None
            })

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
