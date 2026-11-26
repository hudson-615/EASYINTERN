from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator


class CriarConversa(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id_candidatura: int = Field(gt=0)


class EnviarMensagem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conteudo: str = Field(min_length=1, max_length=4000)
    uuid_cliente: UUID

    @field_validator("conteudo")
    @classmethod
    def validar_conteudo(cls, valor):
        valor = valor.strip()

        if not valor:
            raise ValueError("Mensagem vazia.")

        return valor
