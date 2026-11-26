from uuid import uuid4
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from chat.schemas import CriarConversa, EnviarMensagem
from chat.service import (
    identificar_usuario,
    verificar_chat_aberto,
    obter_chat_autorizado,
)


@pytest.mark.parametrize("conteudo", ["", "   ", "a" * 4001])
def test_mensagem_invalida(conteudo):
    with pytest.raises(ValidationError):
        EnviarMensagem(
            conteudo=conteudo,
            uuid_cliente=uuid4()
        )


def test_mensagem_valida():
    dados = EnviarMensagem(
        conteudo="  Ola, tudo bem?  ",
        uuid_cliente=uuid4()
    )

    assert dados.conteudo == "Ola, tudo bem?"


def test_nao_permite_remetente_informado():
    with pytest.raises(ValidationError):
        EnviarMensagem(
            conteudo="Teste",
            uuid_cliente=uuid4(),
            id_remetente=99
        )


@pytest.mark.parametrize("id_candidatura", [0, -1])
def test_candidatura_invalida(id_candidatura):
    with pytest.raises(ValidationError):
        CriarConversa(id_candidatura=id_candidatura)


@pytest.mark.parametrize("token", [
    {},
    {"sub": "invalido"},
    {"sub": "0"},
    {"sub": "-1"}
])
def test_usuario_invalido(token):
    with pytest.raises(HTTPException) as erro:
        identificar_usuario(token)

    assert erro.value.status_code == 401


@pytest.mark.parametrize("status,expirado,candidatura", [
    ("Bloqueado", 0, "Pendente"),
    ("Encerrado", 0, "Pendente"),
    ("Aberto", 1, "Pendente"),
    ("Aberto", 0, "Reprovado"),
])
def test_chat_indisponivel(status, expirado, candidatura):
    with pytest.raises(HTTPException) as erro:
        verificar_chat_aberto({
            "status": status,
            "expirado": expirado,
            "status_candidatura": candidatura
        })

    assert erro.value.status_code == 409


def test_chat_aberto():
    verificar_chat_aberto({
        "status": "Aberto",
        "expirado": 0,
        "status_candidatura": "Pendente"
    })


def test_bloqueia_acesso_de_terceiros():
    cursor = MagicMock()
    cursor.fetchone.return_value = None

    with pytest.raises(HTTPException) as erro:
        obter_chat_autorizado(cursor, 3, 99)

    assert erro.value.status_code == 404

    sql, parametros = cursor.execute.call_args.args

    assert "p.id_usuario = %s" in sql
    assert parametros == (3, 99, 99, 99)


def test_rotas_chat_registradas():
    from app import app

    rotas = app.openapi()["paths"]

    esperadas = {
        "/api/chat/conversas": ["get", "post"],
        "/api/chat/conversas/{id_chat}/mensagens": ["get", "post"],
        "/api/chat/conversas/{id_chat}/leitura": ["patch"],
        "/api/chat/notificacoes": ["get"],
    }

    for rota, metodos in esperadas.items():
        assert rota in rotas

        for metodo in metodos:
            assert metodo in rotas[rota]
