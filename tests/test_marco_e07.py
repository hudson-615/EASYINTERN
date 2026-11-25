from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from dashboard.empresa_routes import (
    listar_candidatos_vaga_empresa,
    atualizar_status_candidatura_empresa,
    AtualizarStatusCandidatura,
)


def empresa_ativa():
    return {
        "tipo_usuario": "Empresa",
        "ativo": 1,
        "deletado_em": None,
        "id_empresa": 1
    }


def verificar_filtros(sql):
    assert "uc.ativo = 1" in sql
    assert "uc.deletado_em IS NULL" in sql
    assert "uc.id_usuario = c.id_usuario" in sql


def test_e07_listagem_filtra_candidatos_indisponiveis():
    conexao = MagicMock()
    cursor = conexao.cursor.return_value

    cursor.fetchone.side_effect = [
        empresa_ativa(),
        {"id_vaga": 5}
    ]

    cursor.fetchall.return_value = []

    with patch(
        "dashboard.empresa_routes.conectar",
        return_value=conexao
    ):
        resultado = listar_candidatos_vaga_empresa(
            5, {"sub": "18"}
        )

    assert resultado == []

    sql = cursor.execute.call_args.args[0]
    verificar_filtros(sql)


def test_e07_status_bloqueia_candidato_indisponivel():
    conexao = MagicMock()
    cursor = conexao.cursor.return_value

    cursor.fetchone.side_effect = [
        empresa_ativa(),
        None
    ]

    dados = AtualizarStatusCandidatura(
        status="aprovado"
    )

    with patch(
        "dashboard.empresa_routes.conectar",
        return_value=conexao
    ):
        with pytest.raises(HTTPException) as erro:
            atualizar_status_candidatura_empresa(
                3, dados, {"sub": "18"}
            )

    assert erro.value.status_code == 404

    sql = cursor.execute.call_args.args[0]
    verificar_filtros(sql)

    conexao.commit.assert_not_called()
    conexao.rollback.assert_called_once()


def test_e07_empresa_nao_acessa_vaga_de_terceiros():
    conexao = MagicMock()
    cursor = conexao.cursor.return_value

    cursor.fetchone.side_effect = [
        empresa_ativa(),
        None
    ]

    with patch(
        "dashboard.empresa_routes.conectar",
        return_value=conexao
    ):
        with pytest.raises(HTTPException) as erro:
            listar_candidatos_vaga_empresa(
                99, {"sub": "18"}
            )

    assert erro.value.status_code == 404
    cursor.fetchall.assert_not_called()
