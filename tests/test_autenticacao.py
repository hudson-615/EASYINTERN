from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from usuarios.routes import (
    login,
    LoginRequest,
    obter_usuario_autenticado,
)

DADOS = LoginRequest(
    email="teste@example.com",
    password="Senha123"
)


def preparar(usuario, perfil=None):
    conexao = MagicMock()
    cursor = conexao.cursor.return_value
    cursor.fetchone.side_effect = [usuario, perfil]
    return conexao


@pytest.mark.parametrize("usuario", [
    None,
    (1, "hash", "Candidato", 0, None, 0),
    (1, "hash", "Candidato", 1, "2026-01-01", 0),
    (1, "hash", "Candidato", 1, None, 1),
])
def test_login_conta_indisponivel(usuario):
    conexao = preparar(usuario)

    with patch("usuarios.routes.conectar", return_value=conexao):
        with pytest.raises(HTTPException) as erro:
            login(DADOS)

    assert erro.value.status_code == 401
    conexao.commit.assert_not_called()


def test_login_senha_incorreta():
    conexao = preparar(
        (1, "hash", "Candidato", 1, None, 0)
    )

    with patch("usuarios.routes.conectar", return_value=conexao):
        with patch("usuarios.routes.password_hash.verify", return_value=False):
            with pytest.raises(HTTPException) as erro:
                login(DADOS)

    assert erro.value.status_code == 401
    conexao.commit.assert_not_called()


def test_login_valido():
    conexao = preparar(
        (1, "hash", "Candidato", 1, None, 0),
        ("Candidato Teste",)
    )

    with patch("usuarios.routes.conectar", return_value=conexao):
        with patch("usuarios.routes.password_hash.verify", return_value=True):
            with patch("usuarios.routes.criar_token_acesso", return_value="token-teste"):
                resultado = login(DADOS)

    assert resultado["access_token"] == "token-teste"
    assert resultado["tipo_usuario"] == "candidato"
    assert resultado["nome"] == "Candidato Teste"
    conexao.commit.assert_called_once()


def test_rota_protegida_sem_token():
    with pytest.raises(HTTPException) as erro:
        obter_usuario_autenticado(credenciais=None)

    assert erro.value.status_code == 401
