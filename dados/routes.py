from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from mysql.connector import Error

from database.connection import conectar


router = APIRouter(
    prefix="/api/data",
    tags=["Dados"]
)


TIPOS_FORMACAO = {
    "tecnico": "Técnico",
    "bacharelado": "Bacharelado",
    "licenciatura": "Licenciatura",
    "tecnologo": "Tecnólogo",
}


@router.get("/areas-de-interesse")
def listar_areas_de_interesse(
    q: str = Query(default="", max_length=100),
    tipo: Literal[
        "todos",
        "tecnico",
        "bacharelado",
        "licenciatura",
        "tecnologo"
    ] = "todos",
    limit: int = Query(default=35, ge=1, le=35)
):
    conexao = None
    cursor = None

    try:
        conexao = conectar()
        cursor = conexao.cursor(dictionary=True)

        consulta = """
            SELECT
                id_formacao,
                nome_curso,
                tipo,
                eixo_area
            FROM catalogo_formacoes
            WHERE nome_curso LIKE %s
        """

        parametros = [f"%{q.strip()}%"]

        if tipo != "todos":
            consulta += " AND tipo = %s"
            parametros.append(TIPOS_FORMACAO[tipo])

        consulta += """
            ORDER BY nome_curso ASC
            LIMIT %s
        """

        parametros.append(limit)

        cursor.execute(consulta, tuple(parametros))
        formacoes = cursor.fetchall()

        resultado = []

        for formacao in formacoes:
            tipo_codigo = next(
                (
                    codigo
                    for codigo, descricao in TIPOS_FORMACAO.items()
                    if descricao == formacao["tipo"]
                ),
                None
            )

            resultado.append({
                "id": formacao["id_formacao"],
                "nome": formacao["nome_curso"],
                "tipo": formacao["tipo"],
                "tipo_code": tipo_codigo,
                "eixo": formacao["eixo_area"],
                "area": formacao["eixo_area"]
            })

        return resultado

    except (Error, RuntimeError) as erro:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível consultar o catálogo de formações."
        ) from erro

    finally:
        if cursor is not None:
            cursor.close()

        if conexao is not None:
            conexao.close()