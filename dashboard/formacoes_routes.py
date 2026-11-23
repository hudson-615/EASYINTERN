"""Formacoes academicas do candidato autenticado.

Rotas:
GET    /dashboard/api/formacoes/catalogo
GET    /dashboard/api/candidato/formacoes
POST   /dashboard/api/candidato/formacoes
PATCH  /dashboard/api/candidato/formacoes/{id_formacao}
DELETE /dashboard/api/candidato/formacoes/{id_formacao}
"""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from mysql.connector import Error, IntegrityError
from pydantic import BaseModel, Field, model_validator

from database.connection import conectar
from usuarios.routes import obter_usuario_autenticado

router = APIRouter(prefix="/dashboard/api", tags=["Formacoes do candidato"])

StatusFormacao = Literal["Cursando", "Concluído", "Trancado"]


class FormacaoCadastro(BaseModel):
    id_formacao: int = Field(gt=0)
    status: StatusFormacao = "Cursando"
    semestre_atual: int | None = Field(default=None, ge=1, le=12)
    ano_conclusao: int | None = Field(default=None, ge=1901, le=2155)

    @model_validator(mode="after")
    def validar_campos(self):
        if self.status == "Concluído" and self.ano_conclusao is None:
            raise ValueError("Informe o ano de conclusão para formações concluídas.")
        return self


class FormacaoAtualizacao(BaseModel):
    status: StatusFormacao | None = None
    semestre_atual: int | None = Field(default=None, ge=1, le=12)
    ano_conclusao: int | None = Field(default=None, ge=1901, le=2155)

    @model_validator(mode="after")
    def validar_campos(self):
        if not self.model_fields_set:
            raise ValueError("Informe pelo menos um campo para atualização.")
        return self


def _id_usuario(token: dict) -> int:
    try:
        id_usuario = int(token["sub"])
        if id_usuario <= 0:
            raise ValueError()
        return id_usuario
    except (ValueError, TypeError, KeyError) as exc:
        raise HTTPException(401, "Identificação de usuário inválida.") from exc


def _candidato_autorizado(cursor, token: dict) -> int:
    cursor.execute(
        """SELECT u.tipo_usuario, u.ativo, u.deletado_em, c.id_candidato
           FROM usuarios AS u
           LEFT JOIN candidatos AS c ON c.id_usuario = u.id_usuario
           WHERE u.id_usuario = %s""",
        (_id_usuario(token),),
    )
    usuario = cursor.fetchone()
    if not usuario or not usuario["ativo"] or usuario["deletado_em"] is not None:
        raise HTTPException(401, "Conta inexistente ou indisponível.")
    if usuario["tipo_usuario"] != "Candidato":
        raise HTTPException(403, "Acesso permitido apenas para candidatos.")
    if usuario["id_candidato"] is None:
        raise HTTPException(404, "Perfil de candidato não encontrado.")
    return usuario["id_candidato"]


def _executar(operacao, token: dict, *, grava: bool = False):
    conexao = None
    cursor = None
    try:
        # Valida token antes de estabelecer conexão.
        _id_usuario(token)
        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)
        id_candidato = _candidato_autorizado(cursor, token)
        resultado = operacao(cursor, id_candidato)
        if grava:
            conexao.commit()
        return resultado
    except HTTPException:
        if grava and conexao is not None:
            conexao.rollback()
        raise
    except IntegrityError as exc:
        if grava and conexao is not None:
            conexao.rollback()
        if exc.errno == 1062:
            raise HTTPException(409, "Formação já cadastrada.") from exc
        if exc.errno == 1452:
            raise HTTPException(404, "Formação inexistente no catálogo.") from exc
        raise HTTPException(503, "Erro ao salvar formação.") from exc
    except Error as exc:
        if grava and conexao is not None:
            conexao.rollback()
        raise HTTPException(503, "Erro de acesso às formações.") from exc
    finally:
        if cursor is not None:
            cursor.close()
        if conexao is not None:
            conexao.close()


@router.get("/formacoes/catalogo")
def catalogo_formacoes(token: dict = Depends(obter_usuario_autenticado)):
    def op(cursor, _):
        cursor.execute(
            """SELECT id_formacao, eixo_area, tipo, nome_curso
               FROM catalogo_formacoes ORDER BY nome_curso, tipo, id_formacao"""
        )
        itens = cursor.fetchall()
        return {"total": len(itens), "formacoes": itens}
    return _executar(op, token)


@router.get("/candidato/formacoes")
def listar_formacoes(token: dict = Depends(obter_usuario_autenticado)):
    def op(cursor, candidato):
        cursor.execute(
            """SELECT cf.id_formacao, f.eixo_area, f.tipo, f.nome_curso,
                      cf.status, cf.semestre_atual, cf.ano_conclusao
               FROM candidato_formacao AS cf
               JOIN catalogo_formacoes AS f ON f.id_formacao = cf.id_formacao
               WHERE cf.id_candidato = %s
               ORDER BY f.nome_curso, f.tipo""",
            (candidato,),
        )
        itens = cursor.fetchall()
        return {"total": len(itens), "formacoes": itens}
    return _executar(op, token)


@router.post("/candidato/formacoes", status_code=201)
def cadastrar_formacao(
    dados: FormacaoCadastro,
    token: dict = Depends(obter_usuario_autenticado),
):
    def op(cursor, candidato):
        cursor.execute(
            "SELECT id_formacao FROM catalogo_formacoes WHERE id_formacao = %s",
            (dados.id_formacao,),
        )
        if cursor.fetchone() is None:
            raise HTTPException(404, "Formação inexistente no catálogo.")
        cursor.execute(
            """INSERT INTO candidato_formacao
               (id_candidato, id_formacao, status, semestre_atual, ano_conclusao)
               VALUES (%s, %s, %s, %s, %s)""",
            (candidato, dados.id_formacao, dados.status,
             dados.semestre_atual, dados.ano_conclusao),
        )
        return {"mensagem": "Formação cadastrada.", "id_formacao": dados.id_formacao}
    return _executar(op, token, grava=True)


@router.patch("/candidato/formacoes/{id_formacao}")
def atualizar_formacao(
    id_formacao: int,
    dados: FormacaoAtualizacao,
    token: dict = Depends(obter_usuario_autenticado),
):
    if id_formacao <= 0:
        raise HTTPException(422, "ID da formação inválido.")

    def op(cursor, candidato):
        cursor.execute(
            """SELECT status, semestre_atual, ano_conclusao
               FROM candidato_formacao WHERE id_candidato = %s
               AND id_formacao = %s FOR UPDATE""",
            (candidato, id_formacao),
        )
        atual = cursor.fetchone()
        if atual is None:
            raise HTTPException(404, "Formação não cadastrada no seu perfil.")
        alteracoes = dados.model_dump(exclude_unset=True)
        estado = {**atual, **alteracoes}
        if estado["status"] == "Concluído" and estado["ano_conclusao"] is None:
            raise HTTPException(422, "Informe o ano de conclusão.")
        colunas = ", ".join(f"{campo} = %s" for campo in alteracoes)
        valores = tuple(alteracoes.values()) + (candidato, id_formacao)
        cursor.execute(
            f"UPDATE candidato_formacao SET {colunas} "
            "WHERE id_candidato = %s AND id_formacao = %s",
            valores,
        )
        return {"mensagem": "Formação atualizada.", "id_formacao": id_formacao}
    return _executar(op, token, grava=True)


@router.delete("/candidato/formacoes/{id_formacao}")
def remover_formacao(
    id_formacao: int,
    token: dict = Depends(obter_usuario_autenticado),
):
    if id_formacao <= 0:
        raise HTTPException(422, "ID da formação inválido.")

    def op(cursor, candidato):
        cursor.execute(
            """DELETE FROM candidato_formacao
               WHERE id_candidato = %s AND id_formacao = %s""",
            (candidato, id_formacao),
        )
        if cursor.rowcount != 1:
            raise HTTPException(404, "Formação não cadastrada no seu perfil.")
        return {"mensagem": "Formação removida.", "id_formacao": id_formacao}
    return _executar(op, token, grava=True)
