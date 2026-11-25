from contextlib import contextmanager
from fastapi import HTTPException
from mysql.connector import Error
from database.connection import conectar


@contextmanager
def banco_chat():
    conn = cursor = None

    try:
        conn = conectar()
        cursor = conn.cursor(dictionary=True)
        yield conn, cursor

    except HTTPException:
        if conn is not None:
            conn.rollback()
        raise

    except (Error, RuntimeError) as erro:
        if conn is not None:
            conn.rollback()

        raise HTTPException(
            status_code=503,
            detail="Servico de chat indisponivel."
        ) from erro

    finally:
        if cursor is not None:
            cursor.close()

        if conn is not None:
            conn.close()


def identificar_usuario(token):
    try:
        usuario = int(token["sub"])

        if usuario <= 0:
            raise ValueError()

        return usuario

    except (KeyError, ValueError, TypeError):
        raise HTTPException(401, "Usuario invalido.")


def obter_candidatura_autorizada(
    cursor, id_candidatura, id_usuario
):
    cursor.execute('''
        SELECT
            ca.id_candidatura,
            ca.status,
            c.id_usuario AS usuario_candidato,
            e.id_usuario AS usuario_empresa
        FROM candidaturas ca
        JOIN candidatos c
            ON c.id_candidato = ca.id_candidato
        JOIN vagas v
            ON v.id_vaga = ca.id_vaga
        JOIN empresas e
            ON e.id_empresa = v.id_empresa
        JOIN usuarios uc
            ON uc.id_usuario = c.id_usuario
        JOIN usuarios ue
            ON ue.id_usuario = e.id_usuario
        WHERE ca.id_candidatura = %s
          AND (c.id_usuario = %s OR e.id_usuario = %s)
          AND uc.ativo = 1
          AND ue.ativo = 1
          AND uc.deletado_em IS NULL
          AND ue.deletado_em IS NULL
        FOR UPDATE
    ''', (id_candidatura, id_usuario, id_usuario))

    candidatura = cursor.fetchone()

    if not candidatura:
        raise HTTPException(404, "Candidatura indisponivel.")

    return candidatura


def obter_chat_autorizado(
    cursor, id_chat, id_usuario, bloquear=False
):
    sql = '''
        SELECT
            ch.id_chat,
            ch.id_candidatura,
            ch.status,
            ch.expira_em,
            ch.expira_em <= NOW() AS expirado,
            ca.status AS status_candidatura,
            c.id_usuario AS usuario_candidato,
            e.id_usuario AS usuario_empresa
        FROM chats ch
        JOIN chat_participantes p
            ON p.id_chat = ch.id_chat
        JOIN candidaturas ca
            ON ca.id_candidatura = ch.id_candidatura
        JOIN candidatos c
            ON c.id_candidato = ca.id_candidato
        JOIN vagas v
            ON v.id_vaga = ca.id_vaga
        JOIN empresas e
            ON e.id_empresa = v.id_empresa
        JOIN usuarios u
            ON u.id_usuario = p.id_usuario
        JOIN usuarios uc
            ON uc.id_usuario = c.id_usuario
            AND uc.ativo = 1
            AND uc.deletado_em IS NULL
        JOIN usuarios ue
            ON ue.id_usuario = e.id_usuario
            AND ue.ativo = 1
            AND ue.deletado_em IS NULL
        WHERE ch.id_chat = %s
          AND p.id_usuario = %s
          AND (c.id_usuario = %s OR e.id_usuario = %s)
          AND u.ativo = 1
          AND u.deletado_em IS NULL
    '''

    if bloquear:
        sql += " FOR UPDATE"

    cursor.execute(
        sql,
        (id_chat, id_usuario, id_usuario, id_usuario)
    )

    chat = cursor.fetchone()

    if not chat:
        raise HTTPException(404, "Conversa nao encontrada.")

    return chat


def verificar_chat_aberto(chat):
    if (
        chat["status"] != "Aberto"
        or chat["expirado"]
        or chat["status_candidatura"] == "Reprovado"
    ):
        raise HTTPException(
            409, "Conversa indisponivel para mensagens."
        )
