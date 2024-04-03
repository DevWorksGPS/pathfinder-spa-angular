export interface Ruta {
    id: number;
    name: string;
    ubicacion: string;
    origenLatitud: number;
    origenLongitud: number;
    destinoLatitud: number;
    destinoLongitud: number;
    image: string;
    distanciaTotal: number;
    duracionTotal: number;
};