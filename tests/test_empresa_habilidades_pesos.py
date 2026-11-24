import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from dashboard.empresa_routes import NovaVaga, preparar_habilidades

BASE = dict(titulo="Estágio Python", descricao="Desenvolvimento de sistemas Python",
            nivel="estagiario", modalidade="remoto", prazo_encerramento="2099-12-31")

def test_p2_habilidades_estruturadas():
    dados = NovaVaga(**BASE, habilidades=[
        {"nome": "Python", "obrigatorio": True, "peso": 5},
        {"nome": "Git", "obrigatorio": False, "peso": 2}])
    assert preparar_habilidades(dados) == [
        {"nome": "Python", "obrigatorio": True, "peso": 5},
        {"nome": "Git", "obrigatorio": False, "peso": 2}]

def test_p2_tags_antigas_compativeis():
    dados = NovaVaga(**BASE, tags="Python, Git")
    assert preparar_habilidades(dados)[0] == {"nome": "Python", "obrigatorio": False, "peso": 1}

def test_p2_peso_invalido():
    with pytest.raises(ValidationError):
        NovaVaga(**BASE, habilidades=[{"nome": "Python", "peso": 6}])

def test_p2_duplicadas():
    dados = NovaVaga(**BASE, habilidades=[{"nome": "Python"}, {"nome": "python"}])
    with pytest.raises(HTTPException) as erro:
        preparar_habilidades(dados)
    assert erro.value.status_code == 422

def test_p2_formato_misto():
    dados = NovaVaga(**BASE, tags="Git", habilidades=[{"nome": "Python"}])
    with pytest.raises(HTTPException) as erro:
        preparar_habilidades(dados)
    assert erro.value.status_code == 422
