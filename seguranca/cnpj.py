
import re


def validar_cnpj(valor: str) -> bool:
    if not isinstance(valor, str):
        return False

    cnpj = re.sub(
        r"[./-]",
        "",
        valor.strip().upper()
    )

    # 12 caracteres alfanuméricos + 2 verificadores.
    if not re.fullmatch(r"[A-Z0-9]{12}[0-9]{2}", cnpj):
        return False

    # Rejeita sequências repetidas.
    if len(set(cnpj)) == 1:
        return False

    def calcular_digito(parte: str) -> str:
        if len(parte) == 12:
            pesos = [
                5, 4, 3, 2, 9, 8,
                7, 6, 5, 4, 3, 2
            ]
        else:
            pesos = [
                6, 5, 4, 3, 2, 9, 8,
                7, 6, 5, 4, 3, 2
            ]

        soma = sum(
            (ord(caractere) - 48) * peso
            for caractere, peso in zip(parte, pesos)
        )

        resto = soma % 11

        return str(
            0 if resto < 2 else 11 - resto
        )

    primeiro = calcular_digito(cnpj[:12])
    segundo = calcular_digito(
        cnpj[:12] + primeiro
    )

    return cnpj[-2:] == primeiro + segundo
