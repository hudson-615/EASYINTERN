from unittest.mock import MagicMock, patch

from ia import ia_eazyintern as motor


def requisito(nivel=None):
    return {
        "id_tag": 1,
        "nome": "Python",
        "obrigatorio": 1,
        "peso": 5,
        "nivel_candidato": nivel,
    }


def test_ia05_habilidade_basica():
    reqs = [requisito("Básico")]
    score = motor.calcular_score_ponderado({1}, reqs)
    parecer = motor._parecer_objetivo(
        {1}, reqs, "Habilidades: Python", score
    )

    assert score == 100
    assert "Python (nível informado: Básico)" in parecer["pontos_fortes"]


def test_ia05_habilidade_avancada():
    reqs = [requisito("Avançado")]
    score = motor.calcular_score_ponderado({1}, reqs)
    parecer = motor._parecer_objetivo(
        {1}, reqs, "Habilidades: Python", score
    )

    assert score == 100
    assert "nível informado: Avançado" in parecer["pontos_fortes"]


def test_ia05_nao_inventa_nivel():
    reqs = [{
        "id_tag": 1,
        "nome": "Python",
        "obrigatorio": 1,
        "peso": 5,
    }]
    parecer = motor._parecer_objetivo(
        {1}, reqs, "Habilidades: Python", 100
    )

    assert "Python" in parecer["pontos_fortes"]
    assert "nível informado" not in parecer["pontos_fortes"]


def test_ia05_consulta_nivel_no_mysql():
    conn = MagicMock()
    cursor = conn.cursor.return_value
    cursor.fetchall.side_effect = [
        [{"id_tag": 1}],
        [requisito("Intermediário")],
    ]

    with patch.object(
        motor, "conectar_banco", return_value=conn
    ):
        tags, reqs = motor.obter_habilidades_para_score(10, 20)

    sql, parametros = cursor.execute.call_args_list[-1].args

    assert tags == {1}
    assert reqs[0]["nivel_candidato"] == "Intermediário"
    assert "LEFT JOIN candidato_tags" in sql
    assert "ct.id_candidato = %s" in sql
    assert parametros == (10, 20)
