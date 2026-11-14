from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from dashboard.formacoes_routes import (
    FormacaoCadastro,
    cadastrar_formacao,
    listar_formacoes,
    remover_formacao,
)

USUARIO = {
    "tipo_usuario": "Candidato",
    "ativo": 1,
    "deletado_em": None,
    "id_candidato": 7,
}
TOKEN = {"sub": "18"}


def preparar(respostas):
    conexao = MagicMock()
    cursor = conexao.cursor.return_value
    cursor.fetchone.side_effect = respostas
    cursor.fetchall.return_value = []
    return conexao, cursor


def test_listar_formacoes():
    conexao, cursor = preparar([USUARIO])

    with patch("dashboard.formacoes_routes.conectar", return_value=conexao):
        resultado = listar_formacoes(token=TOKEN)

    assert resultado == {"total": 0, "formacoes": []}
    assert cursor.execute.call_args.args[1] == (7,)


def test_cadastrar_formacao():
    conexao, cursor = preparar([
        USUARIO,
        {"id_formacao": 3},
    ])

    with patch("dashboard.formacoes_routes.conectar", return_value=conexao):
        resultado = cadastrar_formacao(
            dados=FormacaoCadastro(id_formacao=3),
            token=TOKEN,
        )

    assert resultado["id_formacao"] == 3
    conexao.commit.assert_called_once()


def test_bloquear_empresa():
    conexao, cursor = preparar([{
        **USUARIO,
        "tipo_usuario": "Empresa",
    }])

    with patch("dashboard.formacoes_routes.conectar", return_value=conexao):
        with pytest.raises(HTTPException) as erro:
            listar_formacoes(token=TOKEN)

    assert erro.value.status_code == 403


def test_remocao_de_formacao_inexistente():
    conexao, cursor = preparar([USUARIO])
    cursor.rowcount = 0

    with patch("dashboard.formacoes_routes.conectar", return_value=conexao):
        with pytest.raises(HTTPException) as erro:
            remover_formacao(id_formacao=3, token=TOKEN)

    assert erro.value.status_code == 404
    conexao.rollback.assert_called_once()
    conexao.commit.assert_not_called()
