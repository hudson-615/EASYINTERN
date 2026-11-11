from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from dashboard.empresa_routes import listar_vagas_empresa


def criar_conexao(resposta_usuario, resposta_empresa=None):
    conexao = MagicMock()
    cursor = MagicMock()
    conexao.cursor.return_value = cursor
    cursor.fetchone.side_effect = [
        resposta_usuario,
        resposta_empresa
    ]
    return conexao


def verificar_erro(conexao, token, esperado):
    with patch(
        "dashboard.empresa_routes.conectar",
        return_value=conexao
    ):
        with pytest.raises(HTTPException) as erro:
            listar_vagas_empresa(token=token)

    assert erro.value.status_code == esperado
    conexao.commit.assert_not_called()


def test_token_invalido():
    with patch(
        "dashboard.empresa_routes.conectar",
        side_effect=AssertionError(
            "Nao deveria conectar ao MySQL"
        )
    ):
        with pytest.raises(HTTPException) as erro:
            listar_vagas_empresa(token={"sub": "abc"})

    assert erro.value.status_code == 401


def test_empresa_inativa():
    conexao = criar_conexao({
        "tipo_usuario": "Empresa",
        "ativo": 0,
        "deletado_em": None
    })

    verificar_erro(conexao, {"sub": "18"}, 401)


def test_candidato_sem_permissao():
    conexao = criar_conexao({
        "tipo_usuario": "Candidato",
        "ativo": 1,
        "deletado_em": None
    })

    verificar_erro(conexao, {"sub": "18"}, 403)


def test_empresa_sem_perfil():
    conexao = criar_conexao({
        "tipo_usuario": "Empresa",
        "ativo": 1,
        "deletado_em": None
    })

    verificar_erro(conexao, {"sub": "18"}, 404)
