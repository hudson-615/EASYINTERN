from unittest.mock import MagicMock, patch

from dashboard.empresa_routes import (
    listar_vagas_empresa_paginadas
)


def preparar_conexao(total, vagas, id_empresa=5):
    conexao = MagicMock()
    cursor = MagicMock()
    conexao.cursor.return_value = cursor

    cursor.fetchone.side_effect = [
        {
            "tipo_usuario": "Empresa",
            "ativo": 1,
            "deletado_em": None
        },
        {"id_empresa": id_empresa},
        {"total": total}
    ]

    cursor.fetchall.return_value = vagas
    return conexao, cursor


def consultar(conexao, **filtros):
    with patch(
        "dashboard.empresa_routes.conectar",
        return_value=conexao
    ):
        return listar_vagas_empresa_paginadas(
            token={"sub": "18"},
            **filtros
        )


def test_empresa_sem_vagas():
    conexao, cursor = preparar_conexao(0, [])

    resultado = consultar(
        conexao,
        pagina=1,
        limite=10,
        status_vaga=None,
        modalidade=None
    )

    assert resultado["vagas"] == []
    assert resultado["total"] == 0
    assert resultado["total_paginas"] == 0
    assert resultado["pagina"] == 1
    conexao.close.assert_called_once()


def test_paginacao_segunda_pagina():
    conexao, cursor = preparar_conexao(12, [])

    resultado = consultar(
        conexao,
        pagina=2,
        limite=10,
        status_vaga=None,
        modalidade=None
    )

    assert resultado["pagina"] == 2
    assert resultado["total"] == 12
    assert resultado["total_paginas"] == 2

    sql, parametros = cursor.execute.call_args.args

    assert "LIMIT %s OFFSET %s" in sql
    assert parametros == (5, 10, 10)


def test_filtro_status_e_modalidade():
    conexao, cursor = preparar_conexao(1, [
        {
            "id": 10,
            "titulo": "Estagio Python",
            "nivel": "Estagiario",
            "modalidade": "Remoto",
            "status_exibicao": "aberta",
            "total_candidatos": 2
        }
    ])

    resultado = consultar(
        conexao,
        pagina=1,
        limite=10,
        status_vaga="aberta",
        modalidade="remoto"
    )

    assert resultado["total"] == 1
    assert len(resultado["vagas"]) == 1
    assert resultado["vagas"][0]["status"] == "aberta"
    assert resultado["vagas"][0]["nivel"] == "estagiario"

    sql, parametros = cursor.execute.call_args.args

    assert "LOWER(v.modalidade) = %s" in sql
    assert "CURDATE()" in sql
    assert parametros == (5, "aberta", "remoto", 10, 0)


def test_isolamento_por_empresa():
    conexao, cursor = preparar_conexao(
        0, [], id_empresa=77
    )

    consultar(
        conexao,
        pagina=1,
        limite=10,
        status_vaga=None,
        modalidade=None
    )

    consultas = cursor.execute.call_args_list

    sql_contagem, parametros_contagem = consultas[2].args
    sql_listagem, parametros_listagem = consultas[3].args

    assert "v.id_empresa = %s" in sql_contagem
    assert "v.id_empresa = %s" in sql_listagem
    assert parametros_contagem == (77,)
    assert parametros_listagem == (77, 10, 0)
