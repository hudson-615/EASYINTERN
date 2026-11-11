from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from mysql.connector import Error

from dashboard.empresa_routes import (
    atualizar_status_candidatura_empresa,
    AtualizarStatusCandidatura
)


EMPRESA = {
    "tipo_usuario": "Empresa",
    "ativo": 1,
    "deletado_em": None,
    "id_empresa": 5
}


def preparar_conexao(candidatura):
    conexao = MagicMock()
    cursor = MagicMock()
    conexao.cursor.return_value = cursor

    cursor.fetchone.side_effect = [
        EMPRESA,
        candidatura
    ]

    return conexao, cursor


def executar(conexao, status="entrevista"):
    with patch(
        "dashboard.empresa_routes.conectar",
        return_value=conexao
    ):
        return atualizar_status_candidatura_empresa(
            id_candidatura=10,
            dados=AtualizarStatusCandidatura(status=status),
            token={"sub": "18"}
        )


def test_bloqueia_candidatura_outra_empresa():
    conexao, cursor = preparar_conexao(None)

    with pytest.raises(HTTPException) as erro:
        executar(conexao)

    assert erro.value.status_code == 404
    assert cursor.execute.call_count == 2
    conexao.commit.assert_not_called()
    conexao.rollback.assert_called_once()


def test_atualiza_status_e_registra_auditoria():
    conexao, cursor = preparar_conexao({
        "id_candidatura": 10,
        "id_vaga": 20,
        "status": "Pendente"
    })

    resultado = executar(conexao)

    assert resultado["status"] == "entrevista"
    assert resultado["id_candidatura"] == 10
    assert resultado["id_vaga"] == 20

    consultas = cursor.execute.call_args_list
    assert len(consultas) == 4

    sql_update, parametros_update = consultas[2].args
    assert "UPDATE candidaturas" in sql_update
    assert parametros_update == ("Entrevista", 10)

    sql_auditoria, parametros_auditoria = consultas[3].args
    assert "INSERT INTO auditoria" in sql_auditoria
    assert parametros_auditoria[1] == "ALTERAR_STATUS_CANDIDATURA"

    conexao.commit.assert_called_once()


def test_status_repetido_nao_atualiza():
    conexao, cursor = preparar_conexao({
        "id_candidatura": 10,
        "id_vaga": 20,
        "status": "Entrevista"
    })

    resultado = executar(conexao)

    assert resultado["status"] == "entrevista"
    assert cursor.execute.call_count == 2
    conexao.commit.assert_called_once()


def test_falha_mysql():
    with patch(
        "dashboard.empresa_routes.conectar",
        side_effect=Error("Falha simulada")
    ):
        with pytest.raises(HTTPException) as erro:
            atualizar_status_candidatura_empresa(
                id_candidatura=10,
                dados=AtualizarStatusCandidatura(
                    status="entrevista"
                ),
                token={"sub": "18"}
            )

    assert erro.value.status_code == 503
    assert "Falha simulada" not in erro.value.detail
