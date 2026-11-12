from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from dashboard.routes import (
    NovaCandidatura,
    candidatar_a_vaga,
    listar_vagas_recomendadas,
)


def criar_conexao(respostas):
    conexao = MagicMock()
    cursor = MagicMock()
    conexao.cursor.return_value = cursor
    cursor.fetchone.side_effect = respostas
    cursor.fetchall.return_value = []
    cursor.lastrowid = 99
    return conexao, cursor


def verificar_filtro_empresa(sql):
    assert "JOIN usuarios AS u" in sql
    assert "u.tipo_usuario = 'Empresa'" in sql
    assert "u.ativo = 1" in sql
    assert "u.deletado_em IS NULL" in sql


def test_listagem_filtra_empresas_inativas():
    conexao, cursor = criar_conexao([
        {
            "tipo_usuario": "Candidato",
            "ativo": 1,
            "deletado_em": None,
        },
        {"id_candidato": 7},
    ])

    with patch("dashboard.routes.conectar", return_value=conexao):
        resultado = listar_vagas_recomendadas(
            token={"sub": "18"}
        )

    assert resultado == []

    sql = cursor.execute.call_args.args[0]
    verificar_filtro_empresa(sql)
    conexao.close.assert_called_once()


@pytest.mark.parametrize("disponivel", [0, None])
def test_bloqueia_candidatura_indisponivel(disponivel):
    conexao, cursor = criar_conexao([
        {
            "tipo_usuario": "Candidato",
            "ativo": 1,
            "deletado_em": None,
        },
        {"id_candidato": 7},
        {
            "id_vaga": 10,
            "titulo": "Estagio Python",
            "status": "Aberta",
        },
        (
            {"disponivel": disponivel}
            if disponivel is not None
            else None
        ),
    ])

    with patch("dashboard.routes.conectar", return_value=conexao):
        with pytest.raises(HTTPException) as erro:
            candidatar_a_vaga(
                dados=NovaCandidatura(id_vaga=10),
                token={"sub": "18"},
            )

    assert erro.value.status_code == 409
    conexao.commit.assert_not_called()
    conexao.rollback.assert_called_once()

    consultas = cursor.execute.call_args_list
    sql_disponibilidade = consultas[3].args[0]

    verificar_filtro_empresa(sql_disponibilidade)

    assert not any(
        "INSERT INTO candidaturas" in chamada.args[0]
        for chamada in consultas
    )
