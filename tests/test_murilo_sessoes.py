from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from seguranca.token import criar_token_acesso
from usuarios.routes import obter_usuario_autenticado, gerar_resposta_login
from usuarios import recuperacao_routes


def credencial(versao):
    dados = {"sub": "17", "tipo_usuario": "candidato"}

    if versao is not None:
        dados["versao_sessao"] = versao

    return HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials=criar_token_acesso(dados)
    )


def conexao_mock(usuario):
    conexao = MagicMock()
    conexao.cursor.return_value.fetchone.return_value = usuario
    return conexao


def test_sessao_atual_permitida():
    conexao = conexao_mock((2, 1, None))

    with patch("usuarios.routes.conectar", return_value=conexao):
        dados = obter_usuario_autenticado(credencial(2))

    assert dados["versao_sessao"] == 2
    conexao.close.assert_called_once()


@pytest.mark.parametrize("usuario,versao", [
    ((2, 1, None), 1),
    ((1, 0, None), 1),
    ((1, 1, "2026-11-01"), 1),
    (None, 1),
])
def test_sessao_revogada(usuario, versao):
    conexao = conexao_mock(usuario)

    with patch("usuarios.routes.conectar", return_value=conexao):
        with pytest.raises(HTTPException) as erro:
            obter_usuario_autenticado(credencial(versao))

    assert erro.value.status_code == 401


@pytest.mark.parametrize("versao", [None, 0, -1, "1", True])
def test_versao_invalida(versao):
    with patch("usuarios.routes.conectar") as conectar:
        with pytest.raises(HTTPException) as erro:
            obter_usuario_autenticado(credencial(versao))

    assert erro.value.status_code == 401
    conectar.assert_not_called()


def test_login_emite_versao_da_sessao():
    with patch("usuarios.routes.criar_token_acesso") as criar:
        gerar_resposta_login(17, "Teste", "Candidato", 3)

    assert criar.call_args.args[0]["versao_sessao"] == 3


def test_redefinicao_incrementa_versao():
    conexao = conexao_mock((17,))
    cursor = conexao.cursor.return_value
    cursor.rowcount = 1

    with patch.object(recuperacao_routes, "conectar", return_value=conexao):
        with patch.object(recuperacao_routes.password_hash, "hash", return_value="hash"):
            recuperacao_routes.redefinir_senha(
                recuperacao_routes.NovaSenha(
                    token="x" * 43,
                    nova_senha="NovaSenha123"
                )
            )

    sql = cursor.execute.call_args.args[0]

    assert "versao_sessao = versao_sessao + 1" in sql
    conexao.commit.assert_called_once()


def test_banco_indisponivel_bloqueia_autenticacao():
    with patch("usuarios.routes.conectar", side_effect=RuntimeError):
        with pytest.raises(HTTPException) as erro:
            obter_usuario_autenticado(credencial(1))

    assert erro.value.status_code == 503
