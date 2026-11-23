from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from mysql.connector import Error

from dashboard.empresa_routes import encerrar_vaga_empresa


EMPRESA = {
    "tipo_usuario": "Empresa",
    "ativo": 1,
    "deletado_em": None,
    "id_empresa": 5
}


def preparar_conexao(respostas):
    conexao = MagicMock()
    cursor = MagicMock()
    conexao.cursor.return_value = cursor
    cursor.fetchone.side_effect = respostas
    cursor.rowcount = 1
    return conexao, cursor


def executar(conexao):
    with patch(
        "dashboard.empresa_routes.conectar",
        return_value=conexao
    ):
        return encerrar_vaga_empresa(
            id_vaga=10,
            token={"sub": "18"}
        )


def test_encerrar_vaga_propria():
    conexao, cursor = preparar_conexao([
        EMPRESA,
        {"id_vaga": 10, "status": "Aberta"}
    ])

    resultado = executar(conexao)

    assert resultado["status"] == "Encerrada"
    assert resultado["id_vaga"] == 10
    conexao.commit.assert_called_once()
    conexao.rollback.assert_not_called()

    sqls = [
        chamada.args[0]
        for chamada in cursor.execute.call_args_list
    ]

    assert any("UPDATE vagas" in sql for sql in sqls)


@pytest.mark.parametrize(
    "nome,usuario,vaga,codigo",
    [
        ("outra_empresa", EMPRESA, None, 404),
        (
            "ja_encerrada",
            EMPRESA,
            {"id_vaga": 10, "status": "Encerrada"},
            409
        ),
        (
            "candidato",
            {
                "tipo_usuario": "Candidato",
                "ativo": 1,
                "deletado_em": None,
                "id_empresa": None
            },
            None,
            403
        )
    ]
)
def test_bloqueios(nome, usuario, vaga, codigo):
    conexao, cursor = preparar_conexao([
        usuario,
        vaga
    ])

    with pytest.raises(HTTPException) as erro:
        executar(conexao)

    assert erro.value.status_code == codigo

    conexao.commit.assert_not_called()
    conexao.rollback.assert_called_once()

    sqls = [
        chamada.args[0]
        for chamada in cursor.execute.call_args_list
    ]

    assert not any("UPDATE vagas" in sql for sql in sqls)


def test_erro_mysql():
    with patch(
        "dashboard.empresa_routes.conectar",
        side_effect=Error("Falha simulada")
    ):
        with pytest.raises(HTTPException) as erro:
            encerrar_vaga_empresa(
                id_vaga=10,
                token={"sub": "18"}
            )

    assert erro.value.status_code == 503
    assert "Falha simulada" not in erro.value.detail
