from fastapi import APIRouter, Depends, HTTPException, status
from mysql.connector import Error

from database.connection import conectar
from usuarios.routes import obter_usuario_autenticado
from pydantic import BaseModel, Field
from mysql.connector import IntegrityError
from usuarios.schemas import CandidatoPerfilAtualizacao


router = APIRouter(
    prefix="/dashboard/api",
    tags=["Dashboard"]
)


# ============================================================
# ESTATÍSTICAS DO CANDIDATO
# GET /dashboard/api/candidato/stats
# ============================================================

@router.get("/candidato/stats")
def estatisticas_candidato(
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    try:
        # Identifica o usuário pelo JWT validado.
        id_usuario = int(token["sub"])

        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)

        # Confirma que a conta existe, está ativa
        # e pertence a um candidato.
        cursor.execute(
            """
            SELECT
                id_usuario,
                tipo_usuario,
                ativo,
                deletado_em
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
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Conta inexistente ou indisponível."
            )

        if usuario["tipo_usuario"] != "Candidato":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso permitido apenas para candidatos."
            )

        # Busca as informações do perfil e
        # uma formação vinculada ao candidato.
        cursor.execute(
            """
            SELECT
                c.id_candidato,
                c.nome_completo,
                c.nivel_carreira,
                c.cidade,
                c.uf,
                c.linkedin_url,
                c.github_url,
                (
                    SELECT f.nome_curso
                    FROM candidato_formacao AS cf
                    JOIN catalogo_formacoes AS f
                        ON f.id_formacao = cf.id_formacao
                    WHERE cf.id_candidato = c.id_candidato
                    ORDER BY cf.id_formacao
                    LIMIT 1
                ) AS area_interesse
            FROM candidatos AS c
            WHERE c.id_usuario = %s
            """,
            (id_usuario,)
        )

        candidato = cursor.fetchone()

        if not candidato:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perfil de candidato não encontrado."
            )

        id_candidato = candidato["id_candidato"]

        # Calcula os indicadores diretamente
        # a partir das candidaturas reais.
        cursor.execute(
            """
            SELECT
                COUNT(*) AS total_candidaturas,

                COALESCE(
                    SUM(status = 'Aprovado'),
                    0
                ) AS aprovadas,

                COALESCE(
                    SUM(status = 'Em Análise'),
                    0
                ) AS em_analise

            FROM candidaturas
            WHERE id_candidato = %s
            """,
            (id_candidato,)
        )

        indicadores = cursor.fetchone()

        # Consulta a média existente na view do banco.
        # A fórmula da view será revisada na etapa da IA.
        cursor.execute(
            """
            SELECT score_medio
            FROM vw_dashboard_candidato
            WHERE id_candidato = %s
            """,
            (id_candidato,)
        )

        resultado_match = cursor.fetchone()

        taxa_match = 0.0

        if resultado_match:
            taxa_match = float(
                resultado_match["score_medio"] or 0
            )

        nivel = (
            "junior"
            if candidato["nivel_carreira"] == "Júnior"
            else "estagiario"
        )

        return {
            "nome": candidato["nome_completo"],
            "nivel": nivel,
            "area_interesse": candidato["area_interesse"],
            "cidade": candidato["cidade"],
            "estado": candidato["uf"],
            "linkedin": candidato["linkedin_url"],
            "github": candidato["github_url"],
            "total_candidaturas": int(
                indicadores["total_candidaturas"]
            ),
            "aprovadas": int(
                indicadores["aprovadas"]
            ),
            "em_analise": int(
                indicadores["em_analise"]
            ),
            "taxa_match": taxa_match
        }

    except HTTPException:
        raise

    except (ValueError, TypeError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identificação de usuário inválida."
        )

    except (Error, RuntimeError) as erro:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível consultar o dashboard."
        ) from erro

    finally:
        if cursor is not None:
            cursor.close()

        if conexao is not None:
            conexao.close()


# ============================================================
# LISTAR CANDIDATURAS DO CANDIDATO
# GET /dashboard/api/candidato/candidaturas
# ============================================================

@router.get("/candidato/candidaturas")
def listar_candidaturas_candidato(
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    try:
        # Identifica o usuário pelo token JWT.
        id_usuario = int(token["sub"])

        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)

        # Verifica se a conta está ativa e é de candidato.
        cursor.execute(
            """
            SELECT
                id_usuario,
                tipo_usuario,
                ativo,
                deletado_em
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
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Conta inexistente ou indisponível."
            )

        if usuario["tipo_usuario"] != "Candidato":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso permitido apenas para candidatos."
            )

        # Descobre o ID do candidato autenticado.
        cursor.execute(
            """
            SELECT id_candidato
            FROM candidatos
            WHERE id_usuario = %s
            """,
            (id_usuario,)
        )

        candidato = cursor.fetchone()

        if not candidato:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perfil de candidato não encontrado."
            )

        id_candidato = candidato["id_candidato"]

        # Consulta as candidaturas reais do MySQL.
        cursor.execute(
            """
            SELECT
                ca.id_candidatura AS id,
                ca.status,
                ca.data_candidatura AS created_at,

                v.titulo AS vaga_titulo,
                v.modalidade,
                v.cidade,
                v.uf AS estado,

                COALESCE(
                    NULLIF(e.nome_fantasia, ''),
                    e.razao_social
                ) AS empresa_nome,

                ia.match_score,
                ia.veredito_ia

            FROM candidaturas AS ca

            JOIN vagas AS v
                ON v.id_vaga = ca.id_vaga

            JOIN empresas AS e
                ON e.id_empresa = v.id_empresa

            LEFT JOIN avaliacoes_ia AS ia
                ON ia.id_candidatura = ca.id_candidatura

            WHERE ca.id_candidato = %s

            ORDER BY
                ca.data_candidatura DESC,
                ca.id_candidatura DESC
            """,
            (id_candidato,)
        )

        registros = cursor.fetchall()

        # Converte os dados do MySQL para o formato
        # esperado pelo JavaScript do dashboard.
        mapa_status = {
            "Pendente": "pendente",
            "Em Análise": "em_analise",
            "Entrevista": "em_analise",
            "Aprovado": "aprovado",
            "Reprovado": "reprovado"
        }

        mapa_modalidade = {
            "Presencial": "presencial",
            "Remoto": "remoto",
            "Híbrido": "hibrido"
        }

        resultado = []

        for registro in registros:
            avaliacao_disponivel = (
                registro["match_score"] is not None
            )

            score = (
                float(registro["match_score"])
                if avaliacao_disponivel
                else 0.0
            )

            score = max(0.0, min(100.0, score))

            if not avaliacao_disponivel:
                cor = "#6b7280"
            elif score >= 80:
                cor = "#20b479"
            elif score >= 60:
                cor = "#3b82f6"
            elif score >= 40:
                cor = "#f59e0b"
            else:
                cor = "#6b7280"

            data_candidatura = registro["created_at"]

            if data_candidatura is not None:
                data_candidatura = (
                    data_candidatura.isoformat()
                )

            resultado.append({
                "id": registro["id"],
                "vaga_titulo": registro["vaga_titulo"],
                "empresa_nome": registro["empresa_nome"],
                "modalidade": mapa_modalidade.get(
                    registro["modalidade"],
                    "presencial"
                ),
                "cidade": registro["cidade"],
                "estado": registro["estado"],
                "status": mapa_status.get(
                    registro["status"],
                    "pendente"
                ),
                "created_at": data_candidatura,
                "match": {
                    "score": score,
                    "cor": cor,
                    "avaliado": avaliacao_disponivel,
                    "veredicto": registro["veredito_ia"]
                }
            })

        return resultado

    except HTTPException:
        raise

    except (ValueError, TypeError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identificação de usuário inválida."
        )

    except (Error, RuntimeError) as erro:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível consultar as candidaturas."
        ) from erro

    finally:
        if cursor is not None:
            cursor.close()

        if conexao is not None:
            conexao.close()


# ============================================================
# VAGAS DISPONÍVEIS PARA O CANDIDATO
# GET /dashboard/api/candidato/vagas-recomendadas
# ============================================================

@router.get("/candidato/vagas-recomendadas")
def listar_vagas_recomendadas(
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    try:
        # Obtém o ID do usuário autenticado.
        id_usuario = int(token["sub"])

        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)

        # Verifica se o usuário está ativo
        # e possui uma conta de candidato.
        cursor.execute(
            """
            SELECT
                id_usuario,
                tipo_usuario,
                ativo,
                deletado_em
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
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Conta inexistente ou indisponível."
            )

        if usuario["tipo_usuario"] != "Candidato":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso permitido apenas para candidatos."
            )

        # Busca o perfil do candidato.
        cursor.execute(
            """
            SELECT id_candidato
            FROM candidatos
            WHERE id_usuario = %s
            """,
            (id_usuario,)
        )

        candidato = cursor.fetchone()

        if not candidato:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perfil de candidato não encontrado."
            )

        id_candidato = candidato["id_candidato"]

        # Busca vagas abertas e verifica se
        # o candidato já se inscreveu em cada uma.
        cursor.execute(
            """
            SELECT
                v.id_vaga AS id,
                v.titulo,
                v.nivel,
                v.descricao,
                v.beneficios,
                v.modalidade,
                v.cidade,
                v.uf AS estado,
                v.bolsa AS salario_min,

                COALESCE(
                    NULLIF(e.nome_fantasia, ''),
                    e.razao_social
                ) AS empresa,

                EXISTS (
                    SELECT 1
                    FROM candidaturas AS ca
                    WHERE ca.id_vaga = v.id_vaga
                      AND ca.id_candidato = %s
                ) AS ja_candidatou

            FROM vagas AS v

            JOIN empresas AS e
                ON e.id_empresa = v.id_empresa

            WHERE v.status = 'Aberta'
              AND (
                  v.prazo_encerramento IS NULL
                  OR v.prazo_encerramento >= CURDATE()
              )

            ORDER BY
                v.criado_em DESC,
                v.id_vaga DESC

            LIMIT 50
            """,
            (id_candidato,)
        )

        vagas = cursor.fetchall()

        mapa_modalidade = {
            "Presencial": "presencial",
            "Remoto": "remoto",
            "Híbrido": "hibrido"
        }

        resultado = []

        for vaga in vagas:
            nivel = (
                "junior"
                if vaga["nivel"]
                and vaga["nivel"].lower() in (
                    "júnior", "junior"
                )
                else "estagio"
            )

            salario = (
                float(vaga["salario_min"])
                if vaga["salario_min"] is not None
                else None
            )

            resultado.append({
                "id": vaga["id"],
                "titulo": vaga["titulo"],
                "empresa": vaga["empresa"],
                "nivel": nivel,
                "modalidade": mapa_modalidade.get(
                    vaga["modalidade"],
                    "presencial"
                ),
                "cidade": vaga["cidade"],
                "estado": vaga["estado"],
                "salario_min": salario,
                "descricao": vaga["descricao"],
                "beneficios": vaga["beneficios"],
                "requisitos": None,
                "tags": "",
                "ja_candidatou": bool(
                    vaga["ja_candidatou"]
                ),

                # A IA ainda não foi integrada.
                # Não inventamos uma pontuação.
                "match": {
                    "score": None,
                    "cor": "#6b7280",
                    "avaliado": False,
                    "veredicto": None,
                    "motivo": None
                }
            })

        return resultado

    except HTTPException:
        raise

    except (ValueError, TypeError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identificação de usuário inválida."
        )

    except (Error, RuntimeError) as erro:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível consultar as vagas."
        ) from erro

    finally:
        if cursor is not None:
            cursor.close()

        if conexao is not None:
            conexao.close()


# ============================================================
# ENVIAR CANDIDATURA PARA UMA VAGA
# POST /dashboard/api/candidato/candidatar
# ============================================================

class NovaCandidatura(BaseModel):
    id_vaga: int = Field(gt=0)


@router.post(
    "/candidato/candidatar",
    status_code=status.HTTP_201_CREATED
)
def candidatar_a_vaga(
    dados: NovaCandidatura,
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    try:
        id_usuario = int(token["sub"])

        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)

        # 1. Verifica a conta autenticada.
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

        if usuario["tipo_usuario"] != "Candidato":
            raise HTTPException(
                status_code=403,
                detail="Apenas candidatos podem se inscrever."
            )

        # 2. Identifica o candidato.
        # O bloqueio ajuda a impedir inscrições
        # simultâneas duplicadas do mesmo candidato.
        cursor.execute(
            """
            SELECT id_candidato
            FROM candidatos
            WHERE id_usuario = %s
            FOR UPDATE
            """,
            (id_usuario,)
        )

        candidato = cursor.fetchone()

        if not candidato:
            raise HTTPException(
                status_code=404,
                detail="Perfil de candidato não encontrado."
            )

        id_candidato = candidato["id_candidato"]

        # 3. Verifica a vaga.
        cursor.execute(
            """
            SELECT
                id_vaga,
                titulo,
                status,
                prazo_encerramento
            FROM vagas
            WHERE id_vaga = %s
            FOR UPDATE
            """,
            (dados.id_vaga,)
        )

        vaga = cursor.fetchone()

        if not vaga:
            raise HTTPException(
                status_code=404,
                detail="Vaga não encontrada."
            )

        # 4. Confirma disponibilidade.
        cursor.execute(
            """
            SELECT
                status = 'Aberta'
                AND (
                    prazo_encerramento IS NULL
                    OR prazo_encerramento >= CURDATE()
                ) AS disponivel
            FROM vagas
            WHERE id_vaga = %s
            """,
            (dados.id_vaga,)
        )

        disponivel = cursor.fetchone()

        if not disponivel["disponivel"]:
            raise HTTPException(
                status_code=409,
                detail="Esta vaga não está disponível."
            )

        # 5. Impede candidatura duplicada.
        cursor.execute(
            """
            SELECT id_candidatura
            FROM candidaturas
            WHERE id_candidato = %s
              AND id_vaga = %s
            """,
            (id_candidato, dados.id_vaga)
        )

        existente = cursor.fetchone()

        if existente:
            raise HTTPException(
                status_code=409,
                detail="Você já se candidatou a esta vaga."
            )

        # 6. Registra a candidatura.
        cursor.execute(
            """
            INSERT INTO candidaturas (
                id_candidato,
                id_vaga,
                status
            )
            VALUES (%s, %s, 'Pendente')
            """,
            (id_candidato, dados.id_vaga)
        )

        id_candidatura = cursor.lastrowid

        conexao.commit()

        return {
            "mensagem": "Candidatura realizada com sucesso!",
            "id_candidatura": id_candidatura,
            "id_vaga": dados.id_vaga,
            "vaga_titulo": vaga["titulo"],
            "status": "Pendente"
        }

    except HTTPException:
        if conexao is not None:
            conexao.rollback()
        raise

    except (ValueError, TypeError, KeyError):
        if conexao is not None:
            conexao.rollback()

        raise HTTPException(
            status_code=401,
            detail="Identificação de usuário inválida."
        )

    except IntegrityError as erro:
        if conexao is not None:
            conexao.rollback()

        raise HTTPException(
            status_code=409,
            detail="Não foi possível registrar a candidatura por conflito de dados."
        ) from erro

    except (Error, RuntimeError) as erro:
        if conexao is not None:
            conexao.rollback()

        raise HTTPException(
            status_code=503,
            detail="Não foi possível registrar a candidatura."
        ) from erro

    finally:
        if cursor is not None:
            cursor.close()

        if conexao is not None:
            conexao.close()

# ============================================================
# PERFIL DO CANDIDATO
# GET /dashboard/api/candidato/perfil
# ============================================================

@router.get("/candidato/perfil")
def consultar_perfil_candidato(
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    try:
        id_usuario = int(token["sub"])

        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)

        # Confirma que a conta existe e está ativa.
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
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Conta inexistente ou indisponível."
            )

        if usuario["tipo_usuario"] != "Candidato":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso permitido apenas para candidatos."
            )

        # Busca somente o perfil do usuário autenticado.
        cursor.execute(
            """
            SELECT
                id_candidato,
                nome_completo,
                nivel_carreira,
                telefone,
                cidade,
                uf,
                linkedin_url,
                github_url,
                biografia
            FROM candidatos
            WHERE id_usuario = %s
            """,
            (id_usuario,)
        )

        candidato = cursor.fetchone()

        if not candidato:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perfil de candidato não encontrado."
            )

        return candidato

    except HTTPException:
        raise

    except (ValueError, TypeError, KeyError) as erro:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identificação de usuário inválida."
        ) from erro

    except Error as erro:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao consultar perfil do candidato."
        ) from erro

    finally:
        if cursor:
            cursor.close()

        if conexao:
            conexao.close()

# ============================================================
# ATUALIZAR PERFIL DO CANDIDATO
# PATCH /dashboard/api/candidato/perfil
# ============================================================

@router.patch("/candidato/perfil")
def atualizar_perfil_candidato(
    dados: CandidatoPerfilAtualizacao,
    token: dict = Depends(obter_usuario_autenticado)
):
    conexao = None
    cursor = None

    try:
        id_usuario = int(token["sub"])

        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)

        # Verifica a conta autenticada.
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

        if usuario["tipo_usuario"] != "Candidato":
            raise HTTPException(
                status_code=403,
                detail="Acesso permitido apenas para candidatos."
            )

        # Confirma a existência do perfil.
        cursor.execute(
            """
            SELECT id_candidato
            FROM candidatos
            WHERE id_usuario = %s
            """,
            (id_usuario,)
        )

        candidato = cursor.fetchone()

        if not candidato:
            raise HTTPException(
                status_code=404,
                detail="Perfil de candidato não encontrado."
            )

        # Considera somente os campos enviados.
        alteracoes = dados.model_dump(exclude_unset=True)

        if not alteracoes:
            raise HTTPException(
                status_code=400,
                detail="Nenhum campo enviado para atualização."
            )

        # Campos permitidos, definidos pelo servidor.
        campos_permitidos = {
            "nome_completo",
            "telefone",
            "cidade",
            "uf",
            "nivel_carreira",
            "linkedin_url",
            "github_url",
            "biografia"
        }

        if not set(alteracoes).issubset(campos_permitidos):
            raise HTTPException(
                status_code=400,
                detail="Campo não permitido."
            )

        # Monta o UPDATE usando apenas nomes
        # de colunas autorizados pelo servidor.
        colunas = ", ".join(
            f"{campo} = %s"
            for campo in alteracoes
        )

        valores = list(alteracoes.values())
        valores.append(id_usuario)

        cursor.execute(
            f"""
            UPDATE candidatos
            SET {colunas}
            WHERE id_usuario = %s
            """,
            tuple(valores)
        )

        conexao.commit()

        return {
            "mensagem": "Perfil atualizado com sucesso.",
            "id_candidato": candidato["id_candidato"]
        }

    except HTTPException:
        if conexao:
            conexao.rollback()
        raise

    except (ValueError, TypeError, KeyError) as erro:
        if conexao:
            conexao.rollback()
        raise HTTPException(
            status_code=401,
            detail="Identificação de usuário inválida."
        ) from erro

    except Error as erro:
        if conexao:
            conexao.rollback()
        raise HTTPException(
            status_code=500,
            detail="Erro ao atualizar perfil."
        ) from erro

    finally:
        if cursor:
            cursor.close()

        if conexao:
            conexao.close()