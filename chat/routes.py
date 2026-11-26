from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query

from usuarios.routes import obter_usuario_autenticado
from chat.schemas import CriarConversa, EnviarMensagem
from chat.service import (
    banco_chat,
    identificar_usuario,
    obter_candidatura_autorizada,
)

router = APIRouter(prefix="/api/chat", tags=["Chat"])


@router.post("/conversas")
def criar_conversa(
    dados: CriarConversa,
    token: dict = Depends(obter_usuario_autenticado)
):
    id_usuario = identificar_usuario(token)

    with banco_chat() as (conn, cursor):
        candidatura = obter_candidatura_autorizada(
            cursor, dados.id_candidatura, id_usuario
        )

        cursor.execute('''
            SELECT id_chat, status, expira_em
            FROM chats
            WHERE id_candidatura = %s
            FOR UPDATE
        ''', (dados.id_candidatura,))

        existente = cursor.fetchone()

        if existente:
            return {**existente, "criado": False}

        if candidatura["status"] == "Reprovado":
            raise HTTPException(409, "Candidatura encerrada.")

        cursor.execute('''
            INSERT INTO chats (
                id_candidatura, status, expira_em
            )
            VALUES (
                %s, 'Aberto',
                DATE_ADD(NOW(), INTERVAL 30 DAY)
            )
        ''', (dados.id_candidatura,))

        id_chat = cursor.lastrowid

        cursor.executemany('''
            INSERT INTO chat_participantes (
                id_chat, id_usuario
            )
            VALUES (%s, %s)
        ''', [
            (id_chat, candidatura["usuario_candidato"]),
            (id_chat, candidatura["usuario_empresa"]),
        ])

        cursor.execute('''
            SELECT id_chat, status, expira_em
            FROM chats
            WHERE id_chat = %s
        ''', (id_chat,))

        resultado = cursor.fetchone()
        conn.commit()

        return {**resultado, "criado": True}


@router.get("/conversas")
def listar_conversas(
    token: dict = Depends(obter_usuario_autenticado),
    pagina: Annotated[int, Query(ge=1)] = 1,
    limite: Annotated[int, Query(ge=1, le=100)] = 20
):
    id_usuario = identificar_usuario(token)

    with banco_chat() as (conn, cursor):
        base_sql = '''
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
            JOIN usuarios uc
                ON uc.id_usuario = c.id_usuario
                AND uc.ativo = 1
                AND uc.deletado_em IS NULL
            JOIN usuarios ue
                ON ue.id_usuario = e.id_usuario
                AND ue.ativo = 1
                AND ue.deletado_em IS NULL
            WHERE p.id_usuario = %s
              AND (
                  c.id_usuario = %s
                  OR e.id_usuario = %s
              )
        '''

        parametros = (
            id_usuario, id_usuario, id_usuario
        )

        cursor.execute(
            "SELECT COUNT(*) AS total " + base_sql,
            parametros
        )

        total = int(cursor.fetchone()["total"])

        cursor.execute('''
            SELECT
                ch.id_chat,
                ch.id_candidatura,
                ch.status,
                ch.expira_em,
                ch.expira_em <= NOW() AS expirado,
                ch.criado_em,
                ca.status AS status_candidatura,
                v.titulo AS vaga_titulo,
                (
                    SELECT COUNT(*)
                    FROM notificacoes_ws n
                    JOIN mensagens m
                        ON m.id_mensagem = n.referencia_id
                    WHERE m.id_chat = ch.id_chat
                      AND n.id_usuario = p.id_usuario
                      AND n.tipo_evento = 'NOVA_MENSAGEM'
                      AND n.lida = 0
                ) AS nao_lidas,
                CASE
                    WHEN c.id_usuario = p.id_usuario
                    THEN COALESCE(
                        NULLIF(e.nome_fantasia, ''),
                        e.razao_social
                    )
                    ELSE c.nome_completo
                END AS participante_nome
        ''' + base_sql + '''
            ORDER BY COALESCE(
                (
                    SELECT MAX(m.enviada_em)
                    FROM mensagens m
                    WHERE m.id_chat = ch.id_chat
                ),
                ch.criado_em
            ) DESC, ch.id_chat DESC
            LIMIT %s OFFSET %s
        ''', (
            *parametros,
            limite,
            (pagina - 1) * limite
        ))

        return {
            "items": cursor.fetchall(),
            "total": total,
            "pagina": pagina,
            "limite": limite,
            "total_paginas": (total + limite - 1) // limite,
            "tem_proxima": pagina * limite < total,
        }



from mysql.connector import IntegrityError
from chat.service import (
    obter_chat_autorizado,
    verificar_chat_aberto,
)


@router.post("/conversas/{id_chat}/mensagens")
def enviar_mensagem(
    id_chat: int,
    dados: EnviarMensagem,
    token: dict = Depends(obter_usuario_autenticado)
):
    id_usuario = identificar_usuario(token)
    uuid = str(dados.uuid_cliente)

    with banco_chat() as (conn, cursor):
        chat = obter_chat_autorizado(
            cursor, id_chat, id_usuario, bloquear=True
        )

        cursor.execute('''
            SELECT id_mensagem, id_chat, id_remetente,
                   conteudo, tipo, enviada_em
            FROM mensagens
            WHERE uuid_cliente = %s
              AND id_chat = %s
              AND id_remetente = %s
        ''', (uuid, id_chat, id_usuario))

        existente = cursor.fetchone()

        if existente:
            if existente["conteudo"] != dados.conteudo:
                raise HTTPException(409, "UUID ja utilizado.")

            return {**existente, "criado": False}

        verificar_chat_aberto(chat)

        destinatario = (
            chat["usuario_empresa"]
            if id_usuario == chat["usuario_candidato"]
            else chat["usuario_candidato"]
        )

        cursor.execute('''
            SELECT u.id_usuario
            FROM usuarios u
            JOIN chat_participantes p
                ON p.id_usuario = u.id_usuario
            WHERE p.id_chat = %s
              AND u.id_usuario = %s
              AND u.ativo = 1
              AND u.deletado_em IS NULL
            FOR UPDATE
        ''', (id_chat, destinatario))

        if not cursor.fetchone():
            raise HTTPException(409, "Destinatario indisponivel.")

        try:
            cursor.execute('''
                INSERT INTO mensagens (
                    id_chat, id_remetente, conteudo,
                    tipo, uuid_cliente
                )
                VALUES (%s, %s, %s, 'texto', %s)
            ''', (
                id_chat,
                id_usuario,
                dados.conteudo,
                uuid
            ))

        except IntegrityError as erro:
            if erro.errno == 1062:
                raise HTTPException(409, "UUID ja utilizado.")
            raise

        id_mensagem = cursor.lastrowid

        cursor.execute('''
            INSERT INTO notificacoes_ws (
                id_usuario, tipo_evento,
                referencia_id, mensagem
            )
            VALUES (
                %s, 'NOVA_MENSAGEM',
                %s, 'Voce recebeu uma nova mensagem.'
            )
        ''', (destinatario, id_mensagem))

        cursor.execute('''
            SELECT id_mensagem, id_chat,
                   id_remetente, conteudo,
                   tipo, enviada_em
            FROM mensagens
            WHERE id_mensagem = %s
        ''', (id_mensagem,))

        resultado = cursor.fetchone()

        conn.commit()

        return {**resultado, "criado": True}


@router.get("/conversas/{id_chat}/mensagens")
def listar_mensagens(
    id_chat: int,
    token: dict = Depends(obter_usuario_autenticado),
    antes_de: Annotated[int | None, Query(gt=0)] = None,
    depois_de: Annotated[int | None, Query(ge=0)] = None,
    limite: Annotated[int, Query(ge=1, le=100)] = 50
):
    id_usuario = identificar_usuario(token)

    if antes_de is not None and depois_de is not None:
        raise HTTPException(422, "Cursores incompat?veis.")

    with banco_chat() as (conn, cursor):
        obter_chat_autorizado(cursor, id_chat, id_usuario)

        sql = '''
            SELECT id_mensagem, id_chat,
                   id_remetente, conteudo,
                   tipo, enviada_em
            FROM mensagens
            WHERE id_chat = %s
        '''

        parametros = [id_chat]

        if antes_de is not None:
            sql += " AND id_mensagem < %s"
            parametros.append(antes_de)

        if depois_de is not None:
            sql += " AND id_mensagem > %s"
            parametros.append(depois_de)

        if depois_de is not None:
            sql += " ORDER BY id_mensagem ASC"
        else:
            sql += " ORDER BY id_mensagem DESC"

        sql += " LIMIT %s"
        parametros.append(limite + 1)

        cursor.execute(sql, tuple(parametros))
        registros = cursor.fetchall()

        tem_mais = len(registros) > limite
        registros = registros[:limite]

        if depois_de is None:
            registros.reverse()

        for registro in registros:
            registro["minha"] = (
                registro["id_remetente"] == id_usuario
            )

        return {
            "items": registros,
            "tem_mais": tem_mais,
            "primeiro_id": (
                registros[0]["id_mensagem"]
                if registros else None
            ),
            "ultimo_id": (
                registros[-1]["id_mensagem"]
                if registros else None
            ),
        }


@router.patch("/conversas/{id_chat}/leitura")
def marcar_leitura(
    id_chat: int,
    ate_id: Annotated[int, Query(gt=0)],
    token: dict = Depends(obter_usuario_autenticado)
):
    id_usuario = identificar_usuario(token)

    with banco_chat() as (conn, cursor):
        obter_chat_autorizado(
            cursor, id_chat, id_usuario, bloquear=True
        )

        cursor.execute('''
            SELECT id_mensagem
            FROM mensagens
            WHERE id_chat = %s
              AND id_mensagem = %s
        ''', (id_chat, ate_id))

        if not cursor.fetchone():
            raise HTTPException(404, "Mensagem nao encontrada.")

        cursor.execute('''
            UPDATE notificacoes_ws n
            JOIN mensagens m
                ON m.id_mensagem = n.referencia_id
            SET n.lida = 1,
                n.lida_em = NOW()
            WHERE n.id_usuario = %s
              AND n.tipo_evento = 'NOVA_MENSAGEM'
              AND n.lida = 0
              AND m.id_chat = %s
              AND m.id_mensagem <= %s
        ''', (id_usuario, id_chat, ate_id))

        quantidade = cursor.rowcount

        cursor.execute('''
            UPDATE chat_participantes
            SET ultima_leitura_em = NOW()
            WHERE id_chat = %s
              AND id_usuario = %s
        ''', (id_chat, id_usuario))

        conn.commit()

        return {
            "mensagem": "Leitura registrada.",
            "notificacoes_lidas": quantidade
        }


@router.get("/notificacoes")
def listar_notificacoes(
    token: dict = Depends(obter_usuario_autenticado),
    apenas_nao_lidas: bool = True,
    limite: Annotated[int, Query(ge=1, le=100)] = 50
):
    id_usuario = identificar_usuario(token)

    with banco_chat() as (conn, cursor):
        sql = '''
            SELECT
                n.id_notificacao,
                n.referencia_id AS id_mensagem,
                m.id_chat,
                n.mensagem,
                n.lida,
                n.criado_em
            FROM notificacoes_ws n
            JOIN mensagens m
                ON m.id_mensagem = n.referencia_id
            JOIN chats ch
                ON ch.id_chat = m.id_chat
            JOIN chat_participantes p
                ON p.id_chat = ch.id_chat
                AND p.id_usuario = n.id_usuario
            JOIN candidaturas ca
                ON ca.id_candidatura = ch.id_candidatura
            JOIN candidatos c
                ON c.id_candidato = ca.id_candidato
            JOIN vagas v ON v.id_vaga = ca.id_vaga
            JOIN empresas e ON e.id_empresa = v.id_empresa
            JOIN usuarios uc
                ON uc.id_usuario = c.id_usuario
                AND uc.ativo = 1
                AND uc.deletado_em IS NULL
            JOIN usuarios ue
                ON ue.id_usuario = e.id_usuario
                AND ue.ativo = 1
                AND ue.deletado_em IS NULL
            WHERE n.id_usuario = %s
              AND n.tipo_evento = 'NOVA_MENSAGEM'
              AND (
                  c.id_usuario = n.id_usuario
                  OR e.id_usuario = n.id_usuario
              )
        '''

        if apenas_nao_lidas:
            sql += " AND n.lida = 0"

        sql += " ORDER BY n.id_notificacao DESC LIMIT %s"

        cursor.execute(sql, (id_usuario, limite))

        return cursor.fetchall()


from typing import Literal
from pydantic import BaseModel, ConfigDict


class AlterarStatusChat(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["bloqueado", "encerrado"]


@router.patch("/conversas/{id_chat}/status")
def alterar_status_chat(
    id_chat: int,
    dados: AlterarStatusChat,
    token: dict = Depends(obter_usuario_autenticado)
):
    id_usuario = identificar_usuario(token)

    with banco_chat() as (conn, cursor):
        chat = obter_chat_autorizado(
            cursor, id_chat, id_usuario, bloquear=True
        )

        novo_status = {
            "bloqueado": "Bloqueado",
            "encerrado": "Encerrado"
        }[dados.status]

        atual = chat["status"]

        if atual == novo_status:
            return {
                "id_chat": id_chat,
                "status": atual,
                "alterado": False
            }

        if atual == "Encerrado":
            raise HTTPException(
                409, "Conversa ja encerrada."
            )

        if novo_status == "Bloqueado":
            cursor.execute('''
                UPDATE chats
                SET status = 'Bloqueado',
                    bloqueado_em = NOW(),
                    motivo_bloqueio = 'Bloqueado por participante'
                WHERE id_chat = %s
            ''', (id_chat,))

        else:
            cursor.execute('''
                UPDATE chats
                SET status = 'Encerrado'
                WHERE id_chat = %s
            ''', (id_chat,))

        conn.commit()

        return {
            "id_chat": id_chat,
            "status": novo_status,
            "alterado": True
        }
