import pytest
from pydantic import ValidationError
from dashboard.empresa_routes import EdicaoPerfilEmpresa


@pytest.mark.parametrize("cep", [
    "01001000",
    "01001-000"
])
def test_e09_cep_valido(cep):
    perfil = EdicaoPerfilEmpresa(
        nome_fantasia="Empresa Teste",
        cep=cep
    )
    assert perfil.cep == "01001-000"


@pytest.mark.parametrize("cep", [
    "123",
    "123456789",
    "abcdefgh",
    "12345-abc"
])
def test_e09_cep_invalido(cep):
    with pytest.raises(ValidationError):
        EdicaoPerfilEmpresa(
            nome_fantasia="Empresa Teste",
            cep=cep
        )


@pytest.mark.parametrize("campo,valor", [
    ("logradouro", "a" * 151),
    ("numero", "a" * 21),
    ("bairro", "a" * 101),
    ("complemento", "a" * 101),
    ("uf", "ZZ")
])
def test_e09_campos_invalidos(campo, valor):
    with pytest.raises(ValidationError):
        EdicaoPerfilEmpresa(
            nome_fantasia="Empresa Teste",
            **{campo: valor}
        )


def test_e09_endereco_opcional():
    perfil = EdicaoPerfilEmpresa(
        nome_fantasia="Empresa Teste"
    )
    assert perfil.cep is None
    assert "cep" not in perfil.model_fields_set
