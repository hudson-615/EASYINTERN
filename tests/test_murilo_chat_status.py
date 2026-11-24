from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from chat.routes import (
    AlterarStatusChat,
    alterar_status_chat,
    listar_conversas,
)


@pytest.mark.parametrize("status", [
    "aberto", "invalido", ""
])
def test_status_chat_invalido(status):
    with pytest.raises(ValidationError):
        AlterarStatusChat(status=status)


@pytest.mark.parametrize("atual,novo,esperado", [
    ("Aberto", "bloqueado", "Bloqueado"),
    ("Aberto", "encerrado", "Encerrado"),
    ("Bloqueado", "encerrado", "Encerrado"),
])
def test_alteracao_status_chat(atual, novo, esperado):
    conn = MagicMock()
    cursor = conn.cursor.return_value

    @contextmanager
    def banco():
        yield conn, cursor

    with patch("chat.routes.banco_chat", banco), \
         patch(
             "chat.routes.obter_chat_autorizado",
             return_value={"status": atual}
         ) as autorizar:

        resultado = alterar_status_chat(
            id_chat=3,
            dados=AlterarStatusChat(status=novo),
            token={"sub": "17"}
        )

    assert resultado["status"] == esperado
    assert resultado["alterado"] is True

    autorizar.assert_called_once_with(
        cursor, 3, 17, bloquear=True
    )

    conn.commit.assert_called_once()


def test_chat_encerrado_nao_pode_ser_bloqueado():
    conn = MagicMock()

    @contextmanager
    def banco():
        yield conn, conn.cursor.return_value

    with patch("chat.routes.banco_chat", banco), \
         patch(
             "chat.routes.obter_chat_autorizado",
             return_value={"status": "Encerrado"}
         ):

        with pytest.raises(HTTPException) as erro:
            alterar_status_chat(
                id_chat=3,
                dados=AlterarStatusChat(
                    status="bloqueado"
                ),
                token={"sub": "17"}
            )

    assert erro.value.status_code == 409
    conn.commit.assert_not_called()


def test_status_repetido_nao_modifica_chat():
    conn = MagicMock()

    @contextmanager
    def banco():
        yield conn, conn.cursor.return_value

    with patch("chat.routes.banco_chat", banco), \
         patch(
             "chat.routes.obter_chat_autorizado",
             return_value={"status": "Bloqueado"}
         ):

        resultado = alterar_status_chat(
            id_chat=3,
            dados=AlterarStatusChat(status="bloqueado"),
            token={"sub": "17"}
        )

    assert resultado["alterado"] is False
    conn.commit.assert_not_called()


def test_terceiro_nao_pode_encerrar_chat():
    conn = MagicMock()

    @contextmanager
    def banco():
        yield conn, conn.cursor.return_value

    with patch("chat.routes.banco_chat", banco), \
         patch(
             "chat.routes.obter_chat_autorizado",
             side_effect=HTTPException(404)
         ):

        with pytest.raises(HTTPException) as erro:
            alterar_status_chat(
                id_chat=3,
                dados=AlterarStatusChat(
                    status="encerrado"
                ),
                token={"sub": "99"}
            )

    assert erro.value.status_code == 404
    conn.commit.assert_not_called()


def test_listagem_consulta_mensagens_nao_lidas():
    conn = MagicMock()
    cursor = conn.cursor.return_value

    cursor.fetchone.return_value = {"total": 1}
    cursor.fetchall.return_value = [
        {"id_chat": 3, "nao_lidas": 2}
    ]

    @contextmanager
    def banco():
        yield conn, cursor

    with patch("chat.routes.banco_chat", banco):
        resultado = listar_conversas(
            token={"sub": "17"},
            pagina=1,
            limite=20
        )

    assert resultado["items"][0]["nao_lidas"] == 2

    sql = cursor.execute.call_args.args[0]

    assert "AS nao_lidas" in sql
    assert "n.id_usuario = p.id_usuario" in sql
    assert "n.lida = 0" in sql
    assert "MAX(m.enviada_em)" in sql
