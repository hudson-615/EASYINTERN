from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from mysql.connector import Error

from dashboard.empresa_routes import listar_candidatos_vaga_empresa


EMPRESA = {
    "tipo_usuario": "Empresa",
    "ativo": 1,
    "deletado_em": None,
    "id_empresa": 5
}


def preparar_conexao(respostas, registros=None):
    conexao = MagicMock()
    cursor = MagicMock()
    conexao.cursor.return_value = cursor
    cursor.fetchone.side_effect = respostas
    cursor.fetchall.return_value = registros or []
    return conexao, cursor


def executar(conexao):
    with patch(
        "dashboard.empresa_routes.conectar",
        return_value=conexao
    ):
        return listar_candidatos_vaga_empresa(
            id_vaga=10,
            token={"sub": "18"}
        )


def test_vaga_sem_candidatos():
    conexao, cursor = preparar_conexao([
        EMPRESA,
        {"id_vaga": 10}
    ])

    resultado = executar(conexao)

    assert resultado == []
    assert cursor.execute.call_count == 3
    conexao.close.assert_called_once()


def test_vaga_de_outra_empresa():
    conexao, cursor = preparar_conexao([
        EMPRESA,
        None
    ])

    with pytest.raises(HTTPException) as erro:
        executar(conexao)

    assert erro.value.status_code == 404
    assert cursor.execute.call_count == 2
    conexao.commit.assert_not_called()


def test_candidato_sem_permissao():
    conexao, cursor = preparar_conexao([
        {
            "tipo_usuario": "Candidato",
            "ativo": 1,
            "deletado_em": None,
            "id_empresa": None
        }
    ])

    with pytest.raises(HTTPException) as erro:
        executar(conexao)

    assert erro.value.status_code == 403
    assert cursor.execute.call_count == 1


def test_erro_mysql():
    with patch(
        "dashboard.empresa_routes.conectar",
        side_effect=Error("Falha simulada")
    ):
        with pytest.raises(HTTPException) as erro:
            listar_candidatos_vaga_empresa(
                id_vaga=10,
                token={"sub": "18"}
            )

    assert erro.value.status_code == 503
    assert "Falha simulada" not in erro.value.detail
