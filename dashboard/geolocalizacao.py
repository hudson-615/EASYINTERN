import math

from fastapi import HTTPException


UFS_VALIDAS = frozenset(
    "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR "
    "PE PI RJ RN RS RO RR SC SP SE TO".split()
)


def validar_uf(uf: str | None) -> str | None:
    if uf is None:
        return None

    uf = uf.strip().upper()

    if uf not in UFS_VALIDAS:
        raise HTTPException(422, "UF invalida.")

    return uf


def validar_coordenadas(
    latitude: float | None,
    longitude: float | None
) -> None:
    if latitude is None and longitude is None:
        return

    if latitude is None or longitude is None:
        raise HTTPException(
            422,
            "Informe latitude e longitude juntas."
        )

    if not math.isfinite(latitude) or not math.isfinite(longitude):
        raise HTTPException(422, "Coordenadas invalidas.")

    if not -90 <= latitude <= 90:
        raise HTTPException(422, "Latitude invalida.")

    if not -180 <= longitude <= 180:
        raise HTTPException(422, "Longitude invalida.")


def validar_raio(raio_km: float) -> None:
    if not math.isfinite(raio_km) or not 1 <= raio_km <= 200:
        raise HTTPException(
            422,
            "O raio deve estar entre 1 e 200 km."
        )


def distancia_km(
    latitude_origem: float,
    longitude_origem: float,
    latitude_destino: float,
    longitude_destino: float
) -> float:
    validar_coordenadas(latitude_origem, longitude_origem)
    validar_coordenadas(latitude_destino, longitude_destino)

    lat1 = math.radians(latitude_origem)
    lat2 = math.radians(latitude_destino)

    delta_lat = lat2 - lat1
    delta_lon = math.radians(
        longitude_destino - longitude_origem
    )

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1)
        * math.cos(lat2)
        * math.sin(delta_lon / 2) ** 2
    )

    a = max(0.0, min(1.0, a))

    return 6371.0088 * 2 * math.asin(math.sqrt(a))
