
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from mysql.connector import Error

from database.connection import conectar
from usuarios.routes import obter_usuario_autenticado
from dashboard.formacoes_routes import _id_usuario


router = APIRouter(
    prefix="/dashboard/api",
    tags=["Feedback privado"]
)


class FeedbackCadastro(BaseModel):
    mensagem: str = Field(min_length=3, max_length=2000)

    @field_validator("mensagem")
    @classmethod
    def validar_mensagem(cls, valor):
        valor = valor.strip()

        if len(valor) < 3:
            raise ValueError("Informe um feedback valido.")

        return valor


def _autorizar(cursor, token, id_candidatura, tipo):
    id_usuario = _id_usuario(token)

    if id_candidatura <= 0:
        raise HTTPException(422, "Candidatura invalida.")

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
        raise HTTPException(401, "Conta indisponivel.")

    if usuario["tipo_usuario"] != tipo:
        raise HTTPException(403, "Acesso nao permitido.")

    if tipo == "Empresa":
        sql = """
            SELECT ca.id_candidatura
            FROM candidaturas ca
            JOIN vagas v ON v.id_vaga = ca.id_vaga
            JOIN empresas e ON e.id_empresa = v.id_empresa
            JOIN candidatos c ON c.id_candidato = ca.id_candidato
            JOIN usuarios u ON u.id_usuario = c.id_usuario
            WHERE ca.id_candidatura = %s
              AND e.id_usuario = %s
              AND u.ativo = 1
              AND u.deletado_em IS NULL
        """
    else:
        sql = """
            SELECT ca.id_candidatura
            FROM candidaturas ca
            JOIN candidatos c
                ON c.id_candidato = ca.id_candidato
            WHERE ca.id_candidatura = %s
              AND c.id_usuario = %s
        """

    cursor.execute(sql, (id_candidatura, id_usuario))

    if not cursor.fetchone():
        raise HTTPException(404, "Candidatura nao encontrada.")


def _executar(token, id_candidatura, tipo, mensagem=None):
    conexao = cursor = None

    try:
        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)

        _autorizar(
            cursor, token, id_candidatura, tipo
        )

        if mensagem is not None:
            cursor.execute(
                """
                INSERT INTO feedbacks_candidatura
                    (id_candidatura, mensagem)
                VALUES (%s, %s)
                ON DUPLICATE KEY UPDATE mensagem = %s
                """,
                (id_candidatura, mensagem, mensagem)
            )

            conexao.commit()

            return {
                "mensagem": "Feedback salvo com sucesso."
            }

        cursor.execute(
            """
            SELECT mensagem, atualizado_em
            FROM feedbacks_candidatura
            WHERE id_candidatura = %s
            """,
            (id_candidatura,)
        )

        feedback = cursor.fetchone()

        return {
            "feedback": feedback["mensagem"] if feedback else None,
            "atualizado_em": (
                feedback["atualizado_em"].isoformat()
                if feedback and feedback["atualizado_em"]
                else None
            )
        }

    except HTTPException:
        if conexao is not None and mensagem is not None:
            conexao.rollback()
        raise

    except (Error, RuntimeError) as exc:
        if conexao is not None and mensagem is not None:
            conexao.rollback()

        raise HTTPException(
            503, "Servico temporariamente indisponivel."
        ) from exc

    finally:
        if cursor is not None:
            cursor.close()

        if conexao is not None:
            conexao.close()


@router.get("/empresa/candidaturas/{id_candidatura}/feedback")
def consultar_feedback_empresa(
    id_candidatura: int,
    token: dict = Depends(obter_usuario_autenticado)
):
    return _executar(token, id_candidatura, "Empresa")


@router.put("/empresa/candidaturas/{id_candidatura}/feedback")
def salvar_feedback_empresa(
    id_candidatura: int,
    dados: FeedbackCadastro,
    token: dict = Depends(obter_usuario_autenticado)
):
    return _executar(
        token, id_candidatura, "Empresa", dados.mensagem
    )


@router.get("/candidato/candidaturas/{id_candidatura}/feedback")
def consultar_feedback_candidato(
    id_candidatura: int,
    token: dict = Depends(obter_usuario_autenticado)
):
    return _executar(token, id_candidatura, "Candidato")
