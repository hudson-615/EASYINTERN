from ia import ia_eazyintern as motor
import pytest
import json


def test_ia08_vaga_sem_requisitos_nao_recebe_nota_inventada(monkeypatch):
    chamadas_llama = []

    monkeypatch.setattr(
        motor,
        "obter_candidatura",
        lambda _: {
            "id_candidatura": 101,
            "id_candidato": 10,
            "id_vaga": 20,
        },
    )

    monkeypatch.setattr(
        motor,
        "montar_perfil_candidato",
        lambda _: "Habilidades: Python",
    )

    monkeypatch.setattr(
        motor,
        "montar_perfil_vaga",
        lambda _: "Vaga: Estagio backend; Requisitos: Nenhum cadastrado",
    )

    monkeypatch.setattr(
        motor,
        "obter_habilidades_para_score",
        lambda *_: ({1}, []),
    )

    def simular_llama(*args):
        chamadas_llama.append(True)
        return json.dumps({
            "match_score": 95,
            "pontos_fortes": "Python",
            "pontos_atencao": "Nenhum",
            "veredito": "Perfil compativel",
        })

    monkeypatch.setattr(
        motor,
        "analisar_com_llama",
        simular_llama,
    )

    with pytest.raises(ValueError, match="requisitos estruturados"):
        motor.avaliar_candidatura(101)

    assert chamadas_llama == []
