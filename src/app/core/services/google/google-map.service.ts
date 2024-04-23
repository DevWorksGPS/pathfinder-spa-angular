import { EventEmitter, Injectable } from '@angular/core';
import { Loader } from '@googlemaps/js-api-loader';
import { Ruta } from '../../data/ruta.interface';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export default class GoogleMapService {
  
  map: google.maps.Map;
  //ruta real
  routeCoordinates: google.maps.LatLngLiteral[] = []; 
  startLocation!: google.maps.LatLng;
  // camino hasta el inicio de la ruta
  routeCoordinatesToRoute: google.maps.LatLngLiteral[] = []; 
  startLocationToRoute!: google.maps.LatLng;
  userMarker: google.maps.Marker | null = null; 
  loader!: Loader;
  terminado:boolean = true;
  id: number=-1;
  pos: google.maps.LatLngLiteral| null=null;
  private $userCompleteRoute: EventEmitter<boolean>;
  private tiempoEstimadoSubject: BehaviorSubject<number> = new BehaviorSubject<number>(-1);
  private distanciaEstimadaSubject: BehaviorSubject<number> = new BehaviorSubject<number>(-1);
  private iniciadaSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  // Propiedades observables
  tiempoEstimado: number = -1;
  distanciaEstimada: number = -1;
  iniciada: boolean =false;

  tiempoEstimado$: Observable<number> = this.tiempoEstimadoSubject.asObservable();
  distanciaEstimada$: Observable<number> = this.distanciaEstimadaSubject.asObservable();
  iniciada$: Observable<boolean> = this.iniciadaSubject.asObservable();

  constructor() {
    this.map = {} as google.maps.Map;
    this.$userCompleteRoute =  new EventEmitter<boolean>(false);
  }

  initMap(ruta: Ruta): void {
     this.loader = new Loader({
      apiKey: 'AIzaSyC8QdyoZDAq0MLcuCQijg-HIpVtJ3uLCmY'
    });

    this.loader.load().then(() => {
      const mapElement = document.getElementById("map");
      if (mapElement) {
        this.map = new google.maps.Map(mapElement, {
          zoom: 12
        });
        this.posicionActual().then((posicion: google.maps.LatLngLiteral) => {
         
          this.pos=posicion;
          this.drawRoute(ruta);
          if(this.userMarker!=null){
            
            this.userMarker.setMap(this.map);
            this.userMarker.setPosition(posicion)
            if(!this.ubicacionEnRango(posicion,this.routeCoordinates[0],10))
              this.drawRouteToInitPoint(posicion,this.routeCoordinates[0]);        
          }
      });
      } else {
        console.error("Elemento 'map' no encontrado en el DOM");
      }
    }).catch(error => {
      console.error("Error al cargar la API de Google Maps:", error);
    });
  }

  drawRoute(ruta: Ruta) {
    const directionsService = new google.maps.DirectionsService();
    const directionsRenderer = new google.maps.DirectionsRenderer({
      map: this.map,
      suppressMarkers: false
    });

    const request = {
      origin: { lat: ruta.origenLatitud, lng: ruta.origenLongitud },
      destination: { lat: ruta.destinoLatitud, lng: ruta.destinoLongitud },
      travelMode: google.maps.TravelMode.WALKING
    };

    directionsService.route(request, (result, status) => {
      if (status == google.maps.DirectionsStatus.OK) {
        directionsRenderer.setDirections(result);
        
        if(result != null){
          this.startLocation = result.routes[0].legs[0].start_location;
          if(result.routes[0].legs[0].distance)
            ruta.distanciaTotal = result.routes[0].legs[0].distance.value /1000;
          if(result.routes[0].legs[0].duration)
            ruta.duracionTotal = result.routes[0].legs[0].duration.value / 60;
          this.routeCoordinates = result.routes[0].overview_path.map((path: any) => {
            return { lat: path.lat(), lng: path.lng() };
          });
        } else {
          console.error("Error al obtener la ruta:", status);
        }
        }
    });

  }

iniciarRuta(ruta: Ruta) {
    let newPosition: google.maps.LatLngLiteral; // Define newPosition fuera de la función
    this.terminado=false;
    this.loader.load().then(() => {
     this.posicionActual().then((posicion: google.maps.LatLngLiteral) => {
      //let posicion: google.maps.LatLngLiteral = {lat: this.startLocation.lat(), lng: this.startLocation.lng()};  
      newPosition = posicion;
       
       if(!this.ubicacionEnRango(newPosition,this.routeCoordinates[0],10)&&!this.iniciada){
        this.drawRouteToInitPoint(this.pos!,this.routeCoordinates[0]);
       }
       else{
        this.iniciada=true;
        this.actualizarIniciada(this.iniciada);
       }
         
                     
       google.maps.event.addListenerOnce(this.map, 'idle', () => {
        this.map.setCenter(newPosition);
        if(this.userMarker!=null){
            this.userMarker!.setIcon({
            url: 'assets/images/ubi-usuario.png',
            scaledSize: new google.maps.Size(20, 20)
            });
        }
        else{
           
            this.initUserMarker(newPosition);
            this.simulateMovementAlongRoute(this.routeCoordinates, 2000); 
        }
      });
     });
    });
  }
  
  initUserMarker(currentPos: google.maps.LatLngLiteral) {
    if(this.userMarker!=null){
      this.userMarker.setMap(null);
      this.userMarker=null;
    }
    this.userMarker = new google.maps.Marker({
      position: currentPos,
      map: this.map,
      title: 'Posición actual',
      icon: {
        url: 'assets/images/ubi-usuario.png',
        scaledSize: new google.maps.Size(20, 20)
      }
    });
  }

  simulateMovementAlongRoute(routeCoordinates: google.maps.LatLngLiteral[], interval: number) {
  let index = 0;
  let previousUserPositions : google.maps.LatLngLiteral[] = []; 
  const moveMarker = async () => {
    if (!this.terminado) {
      //const newPosition = routeCoordinates[index];
      const newPosition = await this.posicionActual();
      if(this.iniciada)this.calcularPos_TiempoRestante(newPosition,routeCoordinates);
      previousUserPositions.push(newPosition);
      this.initUserMarker(newPosition);
      this.drawUserPath(previousUserPositions);
      index++;
      if(!this.ubicacionEnRango(newPosition,routeCoordinates[routeCoordinates.length-1],10)){
        setTimeout(moveMarker, interval);
      }
      else{
        // Logica del modal
        this.terminado = true;
        this.$userCompleteRoute.emit(this.terminado); //Finalizado real
        this.tiempoEstimado=-1;
        this.actualizarTiempoEstimado(this.tiempoEstimado);
        this.distanciaEstimada = -1;
        this.actualizarDistanciaEstimada(this.distanciaEstimada);
       this.iniciada=false;
       this.actualizarIniciada(this.iniciada);
        
      }
        
    }
  };
  moveMarker();
}
drawUserPath(previousUserPositions: google.maps.LatLngLiteral[]) {
  if (previousUserPositions.length > 1) {
    const path = new google.maps.Polyline({
      path: previousUserPositions,
      geodesic: true,
      strokeColor: "#FFD700",
      strokeOpacity: 1.3,
      strokeWeight: 6
    });
    path.setMap(this.map);
  }
}
updateUserMarker(position: google.maps.LatLngLiteral) {
    if (this.userMarker) {
      this.userMarker.setPosition(position);
    }
}
posicionActual(): Promise<google.maps.LatLngLiteral> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position: GeolocationPosition) => {
        const currentPos: google.maps.LatLngLiteral = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        resolve(currentPos);
      },
      (error: GeolocationPositionError) => {
        reject(error);
      }, {
        enableHighAccuracy: true
      }
    );
  });
}

finalizar():void{
  this.terminado=true;
  this.userMarker=null;
  this.tiempoEstimado = -1;
  this.actualizarTiempoEstimado(this.tiempoEstimado);
  this.distanciaEstimada = -1;
  this.actualizarDistanciaEstimada(this.distanciaEstimada);
 this.iniciada=false;
 this.actualizarIniciada(this.iniciada);
 
}


// Método para calcular el tiempo estimado restante para llegar al destino
calcularPos_TiempoRestante(newPosition: google.maps.LatLngLiteral, routeCoordinates: google.maps.LatLngLiteral[]): void {
  const directionsService = new google.maps.DirectionsService();
  const request = {
    origin: newPosition,
    destination: routeCoordinates[routeCoordinates.length-1  ] ,
    travelMode: google.maps.TravelMode.WALKING
  };
  const request2 = {
    origin:routeCoordinates[0],
    destination:newPosition,
    travelMode: google.maps.TravelMode.WALKING
  };
let tiempoRestanteMinutos : number;
  directionsService.route(request, (result, status) => {
    if (status == google.maps.DirectionsStatus.OK) {
      
      if(result != null){
        if(result.routes[0].legs[0].duration)
           this.tiempoEstimado = result.routes[0].legs[0].duration.value / 60;
        this.actualizarTiempoEstimado(this.tiempoEstimado);
       
      } else {
        console.error("Error al obtener la ruta:", status);
      }
      }
  });

  directionsService.route(request2, (result, status) => {
    if (status == google.maps.DirectionsStatus.OK) {
      if(result != null){
        if(result.routes[0].legs[0].distance)
          this.distanciaEstimada= result.routes[0].legs[0].distance.value /1000;
        this.actualizarDistanciaEstimada(this.distanciaEstimada);
      } else {
        console.error("Error al obtener la ruta:", status);
      }
     
    }
  });
}

// Calcular la distancia entre dos puntos geográficos utilizando la fórmula del haversine
calcularDistancia(punto1: google.maps.LatLngLiteral, punto2: google.maps.LatLngLiteral): number {
  const radioTierra = 6371e3; // Radio medio de la Tierra en metros
  const lat1 = punto1.lat * Math.PI / 180; // Convertir latitud a radianes
  const lat2 = punto2.lat * Math.PI / 180;
  const deltaLat = (punto2.lat - punto1.lat) * Math.PI / 180;
  const deltaLng = (punto2.lng - punto1.lng) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return radioTierra * c; // Distancia en metros
}


// Verificar si la ubicación del usuario está dentro del rango de finalización
 ubicacionEnRango(ubicacionUsuario: google.maps.LatLngLiteral, destinoFinal: google.maps.LatLngLiteral, rango: number): boolean {
  const distancia = this.calcularDistancia(ubicacionUsuario, destinoFinal);
  return distancia <= rango;
}

drawRouteToInitPoint(ubicacionUsuario: google.maps.LatLngLiteral, puntoInicial: google.maps.LatLngLiteral){
  
  const directionsService = new google.maps.DirectionsService();
  const directionsRenderer = new google.maps.DirectionsRenderer({
    map: this.map,
    suppressMarkers: true,
    polylineOptions: {
      strokeColor: '#800080', //Verde
      strokeOpacity: 0.5, 
      strokeWeight: 6, 
      geodesic: true 
    }
  });

  const request = {
    origin: { lat: ubicacionUsuario.lat, lng: ubicacionUsuario.lng },
    destination: { lat: puntoInicial.lat, lng: puntoInicial.lng },
    travelMode: google.maps.TravelMode.WALKING
  };

  directionsService.route(request, (result, status) => {
    if (status == google.maps.DirectionsStatus.OK) {
      directionsRenderer.setDirections(result);
      
      if(result != null){
        this.startLocationToRoute = result.routes[0].legs[0].start_location;
        this.routeCoordinatesToRoute = result.routes[0].overview_path.map((path: any) => {
          return { lat: path.lat(), lng: path.lng() };
        });
      } else {
        console.error("Error al obtener la ruta:", status);
      }
      }
  });
}

centrar() {
  this.map.setCenter(this.pos!);
  this.map.setZoom(17);
}

 public userEndRouteEmmiter(): EventEmitter<boolean>{
  return this.$userCompleteRoute;
 }
 public destroyEndRouteEmitter(): void {
    this.$userCompleteRoute.emit(false);
 }
 // Métodos para actualizar los valores
  actualizarTiempoEstimado(tiempo: number): void {
    this.tiempoEstimadoSubject.next(tiempo);
  }

  actualizarDistanciaEstimada(distancia: number): void {
    this.distanciaEstimadaSubject.next(distancia);
  }

  actualizarIniciada(iniciada: boolean): void {
    this.iniciadaSubject.next(iniciada);
  }

}



