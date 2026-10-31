from pydantic import BaseModel, EmailStr, Field
from typing import Literal


class UsuarioCadastro(BaseModel):
    email: EmailStr
    senha: str = Field(min_length=8)
    tipo_usuario: Literal["Candidato", "Empresa"]