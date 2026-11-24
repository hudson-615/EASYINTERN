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
