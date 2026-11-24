import pytest

from ia.ia_eazyintern import calcular_score_ponderado


REQUISITOS = [
    {"id_tag": 1, "peso": 5, "obrigatorio": 1},
    {"id_tag": 2, "peso": 3, "obrigatorio": 1},
    {"id_tag": 3, "peso": 2, "obrigatorio": 0},
]


@pytest.mark.parametrize("tags,esperado", [
    ({1, 2, 3}, 100),
    ({1, 2}, 80),
    ({1}, 50),
    ({3}, 20),
    (set(), 0),
    ({999}, 0),
    ({1, 2, 3, 999}, 100),
])
def test_compatibilidade_ponderada(tags, esperado):
    assert calcular_score_ponderado(
        tags, REQUISITOS
    ) == esperado


def test_vaga_sem_requisitos():
    assert calcular_score_ponderado({1, 2}, []) is None


def test_peso_respeita_limites():
    requisitos = [
        {"id_tag": 1, "peso": 100, "obrigatorio": 1},
        {"id_tag": 2, "peso": 1, "obrigatorio": 0}
    ]

    assert calcular_score_ponderado(
        {1}, requisitos
    ) == 83


from unittest.mock import MagicMock, patch
from dashboard.routes import listar_vagas_recomendadas


@pytest.mark.parametrize("tags,requisitos,esperado", [
    ([{"id_tag": 1}], [
        {"id_vaga": 10, "id_tag": 1, "peso": 3, "obrigatorio": 1},
        {"id_vaga": 10, "id_tag": 2, "peso": 2, "obrigatorio": 0}
    ], 60),
    ([], [
        {"id_vaga": 10, "id_tag": 1, "peso": 3, "obrigatorio": 1}
    ], 0),
    ([{"id_tag": 1}], [], None),
])
def test_match_na_resposta_da_api(tags, requisitos, esperado):
    banco = MagicMock()
    cursor = banco.cursor.return_value

    cursor.fetchone.side_effect = [
        {"tipo_usuario": "Candidato", "ativo": 1,
         "deletado_em": None},
        {"id_candidato": 6}
    ]

    vaga = {
        "id": 10,
        "titulo": "Estagio Python",
        "nivel": "Estagiario",
        "empresa": "Empresa Teste",
        "modalidade": "Remoto",
        "cidade": None,
        "estado": None,
        "salario_min": None,
        "descricao": "Desenvolvimento",
        "beneficios": None,
        "tags": "Python",
        "ja_candidatou": 0
    }

    cursor.fetchall.side_effect = [
        [vaga], tags, requisitos
    ]

    with patch("dashboard.routes.conectar", return_value=banco):
        resposta = listar_vagas_recomendadas(
            token={"sub": "17"}
        )

    match = resposta[0]["match"]

    assert match["score"] == esperado
    assert match["estimado"] is True
    assert match["avaliado"] is (esperado is not None)
    banco.close.assert_called_once()


def test_ordenacao_compatibilidade_sql():
    banco = MagicMock()
    cursor = banco.cursor.return_value

    cursor.fetchone.side_effect = [
        {"tipo_usuario": "Candidato", "ativo": 1,
         "deletado_em": None},
        {"id_candidato": 6}
    ]

    cursor.fetchall.return_value = []

    with patch("dashboard.routes.conectar", return_value=banco):
        resposta = listar_vagas_recomendadas(
            token={"sub": "17"},
            ordenar="compatibilidade",
            pagina=2,
            limite=10
        )

    assert resposta == []

    sql, parametros = cursor.execute.call_args.args

    assert "ORDER BY" in sql
    assert "SUM(" in sql
    assert "candidato_tags" in sql
    assert "NULLIF(" in sql
    assert "LIMIT %s OFFSET %s" in sql
    assert parametros == (6, 6, 10, 10)


def test_ordenacao_compatibilidade_preserva_filtros():
    banco = MagicMock()
    cursor = banco.cursor.return_value

    cursor.fetchone.side_effect = [
        {"tipo_usuario": "Candidato", "ativo": 1,
         "deletado_em": None},
        {"id_candidato": 6}
    ]

    cursor.fetchall.return_value = []

    with patch("dashboard.routes.conectar", return_value=banco):
        listar_vagas_recomendadas(
            token={"sub": "17"},
            cidade="Sao Paulo",
            ordenar="compatibilidade"
        )

    sql, parametros = cursor.execute.call_args.args

    assert "v.cidade = %s" in sql
    assert parametros == (6, "Sao Paulo", 6, 50, 0)
