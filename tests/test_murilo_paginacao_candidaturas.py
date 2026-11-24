from datetime import date
from unittest.mock import MagicMock, patch

import pytest

from dashboard.routes import listar_candidaturas_candidato


def preparar_banco(total):
    conn = MagicMock()
    cursor = conn.cursor.return_value

    cursor.fetchone.side_effect = [
        {
            "tipo_usuario": "Candidato",
            "ativo": 1,
            "deletado_em": None,
        },
        {"id_candidato": 6},
        {"total": total},
    ]

    cursor.fetchall.return_value = []

    return conn, cursor


@pytest.mark.parametrize(
    "total,pagina,limite,paginas,proxima",
    [
        (45, 1, 20, 3, True),
        (45, 2, 20, 3, True),
        (45, 3, 20, 3, False),
        (0, 1, 20, 0, False),
        (45, 4, 20, 3, False),
        (40, 2, 20, 2, False),
    ]
)
def test_metadados_paginacao(
    total, pagina, limite, paginas, proxima
):
    conn, cursor = preparar_banco(total)

    with patch(
        "dashboard.routes.conectar",
        return_value=conn
    ):
        resultado = listar_candidaturas_candidato(
            token={"sub": "17"},
            situacao=None,
            data_inicio=None,
            data_fim=None,
            pagina=pagina,
            limite=limite,
            com_metadados=True,
        )

    assert resultado == {
        "items": [],
        "total": total,
        "pagina": pagina,
        "limite": limite,
        "total_paginas": paginas,
        "tem_proxima": proxima,
    }

    assert cursor.execute.call_args.args[1] == (
        6, limite, (pagina - 1) * limite
    )


def test_total_respeita_filtros_e_proprietario():
    conn, cursor = preparar_banco(25)

    inicio = date(2026, 11, 1)
    fim = date(2026, 11, 30)

    with patch(
        "dashboard.routes.conectar",
        return_value=conn
    ):
        resultado = listar_candidaturas_candidato(
            token={"sub": "17"},
            situacao="entrevista",
            data_inicio=inicio,
            data_fim=fim,
            pagina=2,
            limite=10,
            com_metadados=True,
        )

    sql, params = cursor.execute.call_args_list[2].args

    assert "COUNT(*) AS total" in sql
    assert "ca.id_candidato = %s" in sql
    assert "ca.status = %s" in sql
    assert "ca.data_candidatura >= %s" in sql
    assert "DATE_ADD" in sql
    assert params == (6, "Entrevista", inicio, fim)

    assert resultado["total"] == 25
    assert resultado["total_paginas"] == 3
    assert resultado["tem_proxima"] is True


def test_preserva_contrato_antigo():
    conn, cursor = preparar_banco(0)

    with patch(
        "dashboard.routes.conectar",
        return_value=conn
    ):
        resultado = listar_candidaturas_candidato(
            token={"sub": "17"},
            situacao=None,
            data_inicio=None,
            data_fim=None,
            pagina=1,
            limite=20,
        )

    assert resultado == []
    assert cursor.execute.call_count == 3
