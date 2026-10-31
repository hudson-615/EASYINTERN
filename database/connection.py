import os

import mysql.connector
from dotenv import load_dotenv
from mysql.connector import Error


load_dotenv()


def conectar():
    configuracoes = {
        "DB_HOST": os.getenv("DB_HOST"),
        "DB_PORT": os.getenv("DB_PORT"),
        "DB_USER": os.getenv("DB_USER"),
        "DB_PASSWORD": os.getenv("DB_PASSWORD"),
        "DB_NAME": os.getenv("DB_NAME"),
    }

    campos_ausentes = [
        campo
        for campo, valor in configuracoes.items()
        if valor is None or valor.strip() == ""
    ]

    if campos_ausentes:
        raise RuntimeError(
            "Configurações ausentes no arquivo .env: "
            + ", ".join(campos_ausentes)
        )

    try:
        porta = int(configuracoes["DB_PORT"])
    except ValueError:
        raise RuntimeError("DB_PORT precisa ser um número inteiro.")

    try:
        conexao = mysql.connector.connect(
            host=configuracoes["DB_HOST"],
            port=porta,
            user=configuracoes["DB_USER"],
            password=configuracoes["DB_PASSWORD"],
            database=configuracoes["DB_NAME"],
            connection_timeout=10,
        )

        return conexao

    except Error as erro:
        raise RuntimeError(
            "Não foi possível conectar ao banco de dados MySQL."
        ) from erro
