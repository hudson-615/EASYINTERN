from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from dashboard.routes import NovaCandidatura, candidatar_a_vaga
from dashboard.empresa_routes import listar_vagas_empresa


def preparar_candidatura(disponivel):
    conexao = MagicMock()
    cursor = MagicMock()
    conexao.cursor.return_value = cursor

    cursor.fetchone.side_effect = [
        {
            "tipo_usuario": "Candidato",
            "ativo": 1,
            "deletado_em": None
        },
        {"id_candidato": 7},
        {
            "id_vaga": 10,
            "titulo": "Estagio Python",
            "status": "Aberta",
            "prazo_encerramento": date.today()
        },
        {"disponivel": disponivel},
        None
    ]

    cursor.lastrowid = 99
    return conexao, cursor


def executar_candidatura(conexao):
    with patch(
        "dashboard.routes.conectar",
        return_value=conexao
    ):
        return candidatar_a_vaga(
            dados=NovaCandidatura(id_vaga=10),
            token={"sub": "18"}
        )


def test_bloqueia_candidatura_em_vaga_vencida():
    conexao, cursor = preparar_candidatura(0)

    with pytest.raises(HTTPException) as erro:
        executar_candidatura(conexao)

    assert erro.value.status_code == 409
    conexao.commit.assert_not_called()
    conexao.rollback.assert_called_once()

    consultas = cursor.execute.call_args_list
    sql_disponibilidade = consultas[3].args[0]

    assert "prazo_encerramento >= CURDATE()" in sql_disponibilidade
    assert not any(
        "INSERT INTO candidaturas" in chamada.args[0]
        for chamada in consultas
    )


def test_permite_candidatura_em_vaga_valida():
    conexao, cursor = preparar_candidatura(1)

    resultado = executar_candidatura(conexao)

    assert resultado["id_candidatura"] == 99
    assert resultado["status"] == "Pendente"
    conexao.commit.assert_called_once()

    assert any(
        "INSERT INTO candidaturas" in chamada.args[0]
        for chamada in cursor.execute.call_args_list
    )


def test_vaga_vencida_aparece_encerrada():
    conexao = MagicMock()
    cursor = MagicMock()
    conexao.cursor.return_value = cursor

    cursor.fetchone.side_effect = [
        {
            "tipo_usuario": "Empresa",
            "ativo": 1,
            "deletado_em": None
        },
        {"id_empresa": 5}
    ]

    cursor.fetchall.return_value = [{
        "id": 10,
        "titulo": "Estagio Python",
        "nivel": "Estagiario",
        "modalidade": "Remoto",
        "status": "Aberta",
        "prazo_encerramento": date.today() - timedelta(days=1),
        "total_candidatos": 3
    }]

    with patch(
        "dashboard.empresa_routes.conectar",
        return_value=conexao
    ):
        resultado = listar_vagas_empresa(
            token={"sub": "18"}
        )

    assert resultado[0]["status"] == "encerrada"
    assert resultado[0]["total_candidatos"] == 3
    conexao.close.assert_called_once()
