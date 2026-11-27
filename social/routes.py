
from fastapi import APIRouter, Depends, HTTPException, Query
from mysql.connector import Error
from pydantic import BaseModel

from database.connection import conectar
from usuarios.routes import obter_usuario_autenticado

router = APIRouter(prefix="/api/social", tags=["Conex?es"])


class Privacidade(BaseModel):
    perfil_publico: bool


@router.get("/candidatos")
def buscar_candidatos(
    busca: str = Query("", max_length=80),
    token: dict = Depends(obter_usuario_autenticado)
):
    if str(token.get("tipo_usuario", "")).lower() != "candidato":
        raise HTTPException(403, "Acesso exclusivo para candidatos.")

    conexao = cursor = None
    try:
        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)

        termo = busca.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        termo = f"%{termo}%"

        cursor.execute("""
            SELECT
                c.id_candidato,
                c.nome_completo AS nome,
                c.nivel_carreira,
                c.biografia,
                c.cidade,
                c.uf,
                (SELECT GROUP_CONCAT(DISTINCT f.nome_curso SEPARATOR ', ')
                 FROM candidato_formacao cf
                 JOIN catalogo_formacoes f ON f.id_formacao = cf.id_formacao
                 WHERE cf.id_candidato = c.id_candidato) AS formacao,
                (SELECT GROUP_CONCAT(DISTINCT t.nome SEPARATOR ', ')
                 FROM candidato_tags ct
                 JOIN tags_conhecimento t ON t.id_tag = ct.id_tag
                 WHERE ct.id_candidato = c.id_candidato) AS habilidades
            FROM candidatos c
            JOIN usuarios u ON u.id_usuario = c.id_usuario
            WHERE c.perfil_publico = 1
              AND u.ativo = 1
              AND u.deletado_em IS NULL
              AND c.id_usuario <> %s
              AND (
                  c.nome_completo LIKE %s
                  OR EXISTS (
                      SELECT 1 FROM candidato_tags ct
                      JOIN tags_conhecimento t ON t.id_tag = ct.id_tag
                      WHERE ct.id_candidato = c.id_candidato
                        AND t.nome LIKE %s
                  )
                  OR EXISTS (
                      SELECT 1 FROM candidato_formacao cf
                      JOIN catalogo_formacoes f ON f.id_formacao = cf.id_formacao
                      WHERE cf.id_candidato = c.id_candidato
                        AND f.nome_curso LIKE %s
                  )
              )
            ORDER BY c.nome_completo
            LIMIT 50
        """, (int(token["sub"]), termo, termo, termo))

        return {"items": cursor.fetchall()}

    except (Error, RuntimeError):
        raise HTTPException(503, "Banco indispon?vel ou migra??o pendente.")
    finally:
        if cursor:
            cursor.close()
        if conexao:
            conexao.close()


@router.patch("/meu-perfil/visibilidade")
def alterar_visibilidade(
    dados: Privacidade,
    token: dict = Depends(obter_usuario_autenticado)
):
    if str(token.get("tipo_usuario", "")).lower() != "candidato":
        raise HTTPException(403, "Acesso exclusivo para candidatos.")

    conexao = cursor = None
    try:
        conexao = conectar()
        cursor = conexao.cursor()
        cursor.execute(
            "SELECT id_candidato FROM candidatos WHERE id_usuario = %s",
            (int(token["sub"]),)
        )
        if cursor.fetchone() is None:
            raise HTTPException(404, "Candidato n?o encontrado.")

        cursor.execute(
            "UPDATE candidatos SET perfil_publico = %s WHERE id_usuario = %s",
            (int(dados.perfil_publico), int(token["sub"]))
        )
        conexao.commit()
        return {"perfil_publico": dados.perfil_publico}

    except (Error, RuntimeError):
        if conexao:
            conexao.rollback()
        raise HTTPException(503, "Banco indispon?vel ou migra??o pendente.")
    finally:
        if cursor:
            cursor.close()
        if conexao:
            conexao.close()


@router.get("/meu-perfil/visibilidade")
def consultar_visibilidade(
    token: dict = Depends(obter_usuario_autenticado)
):
    if str(token.get("tipo_usuario", "")).lower() != "candidato":
        raise HTTPException(403, "Acesso exclusivo para candidatos.")

    conexao = cursor = None
    try:
        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)

        cursor.execute("""
            SELECT perfil_publico
            FROM candidatos
            WHERE id_usuario = %s
        """, (int(token["sub"]),))

        resultado = cursor.fetchone()

        if resultado is None:
            raise HTTPException(404, "Perfil n?o encontrado.")

        return {"perfil_publico": bool(resultado["perfil_publico"])}

    except (Error, RuntimeError):
        raise HTTPException(503, "Banco temporariamente indispon?vel.")
    finally:
        if cursor:
            cursor.close()
        if conexao:
            conexao.close()


@router.get("/candidatos/{id_candidato}")
def consultar_perfil_publico(
    id_candidato: int,
    token: dict = Depends(obter_usuario_autenticado)
):
    if str(token.get("tipo_usuario", "")).lower() != "candidato":
        raise HTTPException(403, "Acesso exclusivo para candidatos.")

    conexao = cursor = None
    try:
        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                c.id_candidato,
                c.nome_completo AS nome,
                c.nivel_carreira,
                c.biografia,
                c.cidade,
                c.uf,
                (SELECT GROUP_CONCAT(DISTINCT f.nome_curso SEPARATOR ', ')
                 FROM candidato_formacao cf
                 JOIN catalogo_formacoes f ON f.id_formacao = cf.id_formacao
                 WHERE cf.id_candidato = c.id_candidato) AS formacao,
                (SELECT GROUP_CONCAT(DISTINCT t.nome SEPARATOR ', ')
                 FROM candidato_tags ct
                 JOIN tags_conhecimento t ON t.id_tag = ct.id_tag
                 WHERE ct.id_candidato = c.id_candidato) AS habilidades
            FROM candidatos c
            JOIN usuarios u ON u.id_usuario = c.id_usuario
            WHERE c.id_candidato = %s
              AND c.perfil_publico = 1
              AND u.ativo = 1
              AND u.deletado_em IS NULL
              AND c.id_usuario <> %s
        """, (id_candidato, int(token["sub"])))

        resultado = cursor.fetchone()

        if resultado is None:
            raise HTTPException(404, "Perfil p?blico indispon?vel.")

        return resultado

    except (Error, RuntimeError):
        raise HTTPException(503, "Banco temporariamente indispon?vel.")
    finally:
        if cursor:
            cursor.close()
        if conexao:
            conexao.close()
