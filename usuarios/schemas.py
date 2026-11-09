from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator
import re


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class CandidatoCadastro(BaseModel):
    nome_completo: str = Field(min_length=3, max_length=150)
    email: EmailStr
    nivel: Literal["estagiario", "junior"] = "estagiario"
    area_interesse: str | None = Field(default=None, max_length=150)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("nome_completo")
    @classmethod
    def validar_nome(cls, valor: str) -> str:
        valor = valor.strip()

        if len(valor) < 3:
            raise ValueError("Informe seu nome completo.")

        return valor

    @field_validator("area_interesse", mode="before")
    @classmethod
    def tratar_area_vazia(cls, valor):
        if valor is None:
            return None

        if isinstance(valor, str):
            valor = valor.strip()
            return valor or None

        return valor

    @field_validator("password")
    @classmethod
    def validar_senha(cls, valor: str) -> str:
        if not re.search(r"[A-Z]", valor):
            raise ValueError("A senha deve conter pelo menos uma letra maiúscula.")

        if not re.search(r"\d", valor):
            raise ValueError("A senha deve conter pelo menos um número.")

        return valor


class EmpresaCadastro(BaseModel):
    razao_social: str = Field(min_length=2, max_length=150)
    nome_fantasia: str | None = Field(default=None, max_length=150)
    cnpj: str | None = Field(default=None, max_length=18)
    setor: Literal[
        "Tecnologia",
        "Saúde",
        "Educação",
        "Financeiro",
        "E-commerce",
        "Varejo",
        "Indústria",
        "Consultoria",
        "Marketing",
        "Outros",
    ] | None = None
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("razao_social")
    @classmethod
    def validar_razao_social(cls, valor: str) -> str:
        valor = valor.strip()

        if len(valor) < 2:
            raise ValueError("Informe a razão social da empresa.")

        return valor

    @field_validator("nome_fantasia", mode="before")
    @classmethod
    def tratar_nome_fantasia(cls, valor):
        if isinstance(valor, str):
            valor = valor.strip()
            return valor or None

        return valor

    @field_validator("cnpj", mode="before")
    @classmethod
    def tratar_cnpj(cls, valor):
        if valor is None:
            return None

        if not isinstance(valor, str):
            return valor

        valor = valor.strip()

        if not valor:
            return None

        numeros = re.sub(r"\D", "", valor)

        if len(numeros) != 14:
            raise ValueError("O CNPJ deve conter 14 números.")

        return (
            f"{numeros[:2]}.{numeros[2:5]}."
            f"{numeros[5:8]}/{numeros[8:12]}-{numeros[12:]}"
        )

    @field_validator("password")
    @classmethod
    def validar_senha(cls, valor: str) -> str:
        if not re.search(r"[A-Z]", valor):
            raise ValueError("A senha deve conter pelo menos uma letra maiúscula.")

        if not re.search(r"\d", valor):
            raise ValueError("A senha deve conter pelo menos um número.")

        return valor

class CandidatoPerfilAtualizacao(BaseModel):
    nome_completo: str | None = Field(
        default=None, max_length=150
    )
    telefone: str | None = Field(
        default=None, max_length=20
    )
    cidade: str | None = Field(
        default=None, max_length=100
    )
    uf: str | None = Field(default=None)
    nivel_carreira: Literal[
        "Estagiário", "Júnior", "Pleno"
    ] | None = None
    linkedin_url: str | None = Field(
        default=None, max_length=255
    )
    github_url: str | None = Field(
        default=None, max_length=255
    )
    biografia: str | None = Field(
        default=None, max_length=2000
    )

    @field_validator("nome_completo")
    @classmethod
    def validar_nome(cls, valor):
        if valor is None:
            raise ValueError(
                "O nome completo não pode ser nulo."
            )

        valor = valor.strip()

        if len(valor) < 3:
            raise ValueError(
                "O nome deve ter pelo menos 3 caracteres."
            )

        return valor

    @field_validator("uf")
    @classmethod
    def validar_uf(cls, valor):
        if valor is None:
            return None

        valor = valor.strip().upper()

        estados = {
            "AC", "AL", "AP", "AM", "BA", "CE",
            "DF", "ES", "GO", "MA", "MT", "MS",
            "MG", "PA", "PB", "PR", "PE", "PI",
            "RJ", "RN", "RS", "RO", "RR", "SC",
            "SP", "SE", "TO"
        }

        if valor not in estados:
            raise ValueError("UF inválida.")

        return valor

    @field_validator("linkedin_url", "github_url")
    @classmethod
    def validar_links(cls, valor):
        if valor is None:
            return None

        valor = valor.strip()

        if not valor:
            return None

        from urllib.parse import urlsplit

        try:
            partes = urlsplit(valor)
            host = partes.hostname
        except ValueError:
            raise ValueError("URL inválida.")

        if (
            partes.scheme not in ("http", "https")
            or not host
            or partes.username is not None
            or partes.password is not None
        ):
            raise ValueError(
                "Informe uma URL HTTP ou HTTPS válida."
            )

        if host in ("localhost", "127.0.0.1"):
            raise ValueError("URL não permitida.")

        return valor

    @field_validator("telefone", "cidade", "biografia")
    @classmethod
    def normalizar_texto(cls, valor):
        if valor is None:
            return None

        return valor.strip() or None