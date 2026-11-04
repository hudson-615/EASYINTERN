
from fastapi import APIRouter, Depends, HTTPException, status
from mysql.connector import Error

from database.connection import conectar
from usuarios.routes import obter_usuario_autenticado

from datetime import date


router = APIRouter(
    prefix="/dashboard/api/empresa",
    tags=["Dashboard Empresa"]
)


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
