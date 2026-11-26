from ia.ia_eazyintern import (
    _parecer_objetivo,
    calcular_score_ponderado,
)


def requisito(id_tag, nome, obrigatorio=0, peso=1):
    return {
        "id_tag": id_tag,
        "nome": nome,
        "obrigatorio": obrigatorio,
        "peso": peso,
    }


def test_requisito_obrigatorio_ausente():
    requisitos = [
        requisito(1, "Python", 1, 5),
        requisito(2, "Docker", 1, 5),
    ]
    score = calcular_score_ponderado({1}, requisitos)
    parecer = _parecer_objetivo(
        {1}, requisitos, "Habilidades: Python", score
    )

    assert score == 50
    assert "Python" in parecer["pontos_fortes"]
    assert "Docker (obrigatorio)" in parecer["pontos_atencao"]
    assert "Docker" not in parecer["pontos_fortes"]


def test_requisito_desejavel_ausente():
    requisitos = [
        requisito(1, "Python", 1, 5),
        requisito(2, "Git", 0, 1),
    ]
    score = calcular_score_ponderado({1}, requisitos)
    parecer = _parecer_objetivo(
        {1}, requisitos, "Habilidades: Python", score
    )

    assert "Git (desejavel)" in parecer["pontos_atencao"]
    assert "Git" not in parecer["pontos_fortes"]


def test_nota_zero():
    requisitos = [requisito(1, "Docker", 1, 5)]
    score = calcular_score_ponderado(set(), requisitos)
    parecer = _parecer_objetivo(
        set(), requisitos, "Habilidades: Nenhuma cadastrada", score
    )

    assert score == 0
    assert "Docker (obrigatorio)" in parecer["pontos_atencao"]
    assert "Nenhum requisito" in parecer["pontos_fortes"]


def test_todos_requisitos_atendidos():
    requisitos = [
        requisito(1, "Python", 1, 5),
        requisito(2, "Docker", 1, 5),
    ]
    score = calcular_score_ponderado({1, 2}, requisitos)
    parecer = _parecer_objetivo(
        {1, 2}, requisitos, "Habilidades: Python, Docker", score
    )

    assert score == 100
    assert "Python" in parecer["pontos_fortes"]
    assert "Docker" in parecer["pontos_fortes"]
    assert "Nenhuma lacuna" in parecer["pontos_atencao"]


def test_requisito_sem_nome_nao_e_inventado():
    requisitos = [
        requisito(1, "", 1, 1),
        requisito(2, "Python", 1, 1),
    ]
    score = calcular_score_ponderado({2}, requisitos)
    parecer = _parecer_objetivo(
        {2}, requisitos, "Habilidades: Python", score
    )

    assert score == 50
    assert "Python" in parecer["pontos_fortes"]
    assert "1 requisito(s)" in parecer["pontos_atencao"]
