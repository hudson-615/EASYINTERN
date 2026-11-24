"""Testes unitários sem conectar no banco ou chamar Ollama.
Coloque este arquivo em tests/test_ia_eazyintern.py no projeto.
"""
import pytest
from ia.ia_eazyintern import validar_resposta_ia, calcular_score_ponderado


def test_json_valido():
    resposta = '{"match_score":80,"pontos_fortes":"Python","pontos_atencao":"MySQL","veredito":"Compatível"}'
    assert validar_resposta_ia(resposta)["match_score"] == 80


def test_json_invalido():
    with pytest.raises(ValueError):
        validar_resposta_ia('{"match_score":150}')


def test_score_com_pesos():
    requisitos = [
        {"id_tag": 1, "obrigatorio": 1, "peso": 5},
        {"id_tag": 2, "obrigatorio": 0, "peso": 1},
    ]
    assert calcular_score_ponderado({1}, requisitos) == 83
    assert calcular_score_ponderado({1, 2}, requisitos) == 100
    assert calcular_score_ponderado(set(), requisitos) == 0


def test_vaga_sem_tags():
    assert calcular_score_ponderado(set(), []) is None

def test_ia08_parecer_sem_contradicao(monkeypatch):
    import json
    from ia import ia_eazyintern as motor

    monkeypatch.setattr(
        motor,
        "obter_candidatura",
        lambda _: {
            "id_candidatura": 1,
            "id_candidato": 10,
            "id_vaga": 20,
        },
    )

    monkeypatch.setattr(
        motor,
        "montar_perfil_candidato",
        lambda _: "Habilidades: Python, Docker",
    )

    monkeypatch.setattr(
        motor,
        "montar_perfil_vaga",
        lambda _: "Requisitos: Python, Docker",
    )

    monkeypatch.setattr(
        motor,
        "obter_habilidades_para_score",
        lambda *_: (
            {1, 2},
            [
                {"id_tag": 1, "peso": 5, "obrigatorio": 1},
                {"id_tag": 2, "peso": 5, "obrigatorio": 1},
            ],
        ),
    )

    resposta_llama = {
        "match_score": 30,
        "pontos_fortes": "Conhecimento em Python.",
        "pontos_atencao": "Docker nao foi informado pelo candidato.",
        "veredito": "Perfil necessita de analise humana.",
    }

    monkeypatch.setattr(
        motor,
        "analisar_com_llama",
        lambda *_: json.dumps(resposta_llama),
    )

    resultado = motor.avaliar_candidatura(1)

    assert resultado["match_score"] == 100
    assert "Docker nao foi informado" not in resultado["pontos_atencao"]
    assert "Docker" in resultado["pontos_fortes"]
