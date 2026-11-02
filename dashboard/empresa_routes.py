
from fastapi import APIRouter, Depends, HTTPException, status
from mysql.connector import Error

from database.connection import conectar
from usuarios.routes import obter_usuario_autenticado


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
