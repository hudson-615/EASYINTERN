from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app import app


ROTA = "/api/chat/ws"


def test_websocket_autenticado():
    usuario = {"sub": "17"}

    notificacoes = [{
        "id_notificacao": 1,
        "id_mensagem": 5,
        "id_chat": 3
    }]

    with patch(
        "chat.websocket.obter_usuario_autenticado",
        return_value=usuario
    ), patch(
        "chat.websocket.listar_notificacoes",
        return_value=notificacoes
    ) as listar:

        with TestClient(app) as client:
            with client.websocket_connect(ROTA) as ws:
                ws.send_json({"token": "token-teste"})

                assert ws.receive_json() == {
                    "evento": "CONECTADO"
                }

                resposta = ws.receive_json()

                assert resposta["evento"] == "ATUALIZAR_CHAT"
                assert resposta["notificacoes"] == notificacoes

    listar.assert_called_with(
        token=usuario,
        apenas_nao_lidas=True,
        limite=100
    )


def test_websocket_token_invalido():
    with patch(
        "chat.websocket.obter_usuario_autenticado",
        side_effect=HTTPException(401)
    ):
        with TestClient(app) as client:
            with client.websocket_connect(ROTA) as ws:
                ws.send_json({"token": "invalido"})

                with pytest.raises(WebSocketDisconnect) as erro:
                    ws.receive_json()

                assert erro.value.code == 1008


@pytest.mark.parametrize("dados", [
    {},
    {"token": ""},
    {"token": 123},
    {"token": "a" * 4097},
    ["token"]
])
def test_websocket_autenticacao_malformada(dados):
    with TestClient(app) as client:
        with client.websocket_connect(ROTA) as ws:
            ws.send_json(dados)

            with pytest.raises(WebSocketDisconnect) as erro:
                ws.receive_json()

            assert erro.value.code == 1008


def test_websocket_origem_invalida():
    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect) as erro:
            with client.websocket_connect(
                ROTA,
                headers={
                    "Origin": "https://outro-site.example"
                }
            ):
                pass

        assert erro.value.code == 1008


def test_websocket_sessao_revogada():
    with patch(
        "chat.websocket.obter_usuario_autenticado",
        side_effect=[
            {"sub": "17"},
            HTTPException(401)
        ]
    ):
        with TestClient(app) as client:
            with client.websocket_connect(ROTA) as ws:
                ws.send_json({"token": "token-teste"})

                assert ws.receive_json()["evento"] == "CONECTADO"

                with pytest.raises(WebSocketDisconnect) as erro:
                    ws.receive_json()

                assert erro.value.code == 1008


def test_websocket_sem_notificacoes():
    with patch(
        "chat.websocket.obter_usuario_autenticado",
        return_value={"sub": "17"}
    ), patch(
        "chat.websocket.listar_notificacoes",
        return_value=[]
    ):
        with TestClient(app) as client:
            with client.websocket_connect(ROTA) as ws:
                ws.send_json({"token": "token-teste"})

                assert ws.receive_json()["evento"] == "CONECTADO"

                resposta = ws.receive_json()

                assert resposta["evento"] == "ATUALIZAR_CHAT"
                assert resposta["notificacoes"] == []
