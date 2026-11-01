# activity-success-probability Specification

## Purpose
Define cómo el sistema obtiene el pronóstico horario de cada visita y calcula, para cada actividad, una probabilidad de realización (idoneidad del clima para su franja horaria) que se persiste y se expone con una banda tipo semáforo.

## Requirements

### Requirement: Pronóstico horario por visita
El sistema SHALL guardar en cada visita con pronóstico disponible los datos horarios de su fecha (hora local de la ubicación): código de clima, precipitación, nubosidad, viento y probabilidad de precipitación, junto con el desfase UTC de la ubicación.

#### Scenario: Visita dentro de la ventana de pronóstico
- **WHEN** el refresco de clima procesa una visita planificada cuya fecha está dentro de la ventana de pronóstico
- **THEN** la visita queda con los datos de las 24 horas de su fecha y el desfase UTC de su ubicación

#### Scenario: Visita fuera de la ventana de pronóstico
- **WHEN** la fecha de la visita queda fuera de la ventana de pronóstico del proveedor
- **THEN** la visita no conserva pronóstico horario y la probabilidad de sus actividades es nula

### Requirement: Probabilidad de realización de actividades al aire libre
El sistema SHALL calcular para cada actividad OUTDOOR una probabilidad entera de 0 a 100 como el promedio, sobre las horas de su franja, de un puntaje por hora: 1 si se cumplen las condiciones de cielo y viento elegidas y 0 si no, multiplicado por un factor de precipitación.

#### Scenario: Condiciones de cielo cumplidas toda la franja
- **GIVEN** una actividad OUTDOOR de 15:00 a 17:00 que pide "soleado"
- **WHEN** en ambas horas el cielo cumple la condición y la probabilidad de precipitación es 10% y 30%
- **THEN** la probabilidad es 80

#### Scenario: Una hora no cumple las condiciones
- **GIVEN** una actividad OUTDOOR de 15:00 a 18:00 que pide "soleado"
- **WHEN** la hora 17:00 no cumple la condición de cielo
- **THEN** esa hora aporta 0 al promedio

### Requirement: Factor de precipitación según lo pedido
El sistema SHALL usar como factor de precipitación `1 - p/100` cuando las condiciones elegidas no incluyen lluvia, llovizna ni nieve, y `p/100` cuando incluyen al menos una de ellas, donde `p` es la probabilidad de precipitación de esa hora.

#### Scenario: El usuario pidió un día seco
- **WHEN** las condiciones elegidas son solo "nublado" y la probabilidad de precipitación de la hora es 40%
- **THEN** el factor de esa hora es 0.6

#### Scenario: El usuario pidió lluvia
- **WHEN** las condiciones elegidas incluyen "lluvia" y la probabilidad de precipitación de la hora es 80%
- **THEN** el factor de esa hora es 0.8

### Requirement: Probabilidad de actividades de interior
El sistema SHALL asignar probabilidad 100 a las actividades INDOOR, salvo que alguna hora de su franja tenga nieve o viento fuerte, caso en que el máximo es 70.

#### Scenario: Interior con clima normal
- **WHEN** ninguna hora de la franja de una actividad INDOOR tiene nieve ni viento fuerte
- **THEN** su probabilidad es 100

#### Scenario: Interior con clima severo
- **WHEN** alguna hora de la franja de una actividad INDOOR tiene nieve o viento fuerte
- **THEN** su probabilidad es 70

### Requirement: Probabilidad nula sin datos
El sistema SHALL dejar la probabilidad en nulo cuando no existan datos horarios para alguna hora de la franja de una actividad OUTDOOR, y MUST NOT inventar un valor.

#### Scenario: Visita sin pronóstico horario
- **WHEN** la visita de una actividad OUTDOOR no tiene pronóstico horario
- **THEN** la probabilidad y su banda son nulas

### Requirement: Banda de probabilidad
El sistema SHALL exponer junto a la probabilidad una banda: verde si es 70 o más, amarilla de 40 a 69 y roja si es menor de 40; la banda es nula cuando la probabilidad es nula.

#### Scenario: Probabilidad en el límite de verde
- **WHEN** la probabilidad es 70
- **THEN** la banda es verde

#### Scenario: Probabilidad baja
- **WHEN** la probabilidad es 39
- **THEN** la banda es roja

### Requirement: Recalcular la probabilidad ante cambios relevantes
El sistema SHALL recalcular y persistir la probabilidad de una actividad cuando cambie el pronóstico de su visita, la fecha o ubicación de la visita, o el horario, tipo o condiciones de la actividad, incluidas la reactivación y el reagendado.

#### Scenario: El pronóstico se actualiza
- **WHEN** el refresco de clima actualiza el pronóstico horario de una visita
- **THEN** la probabilidad de sus actividades planificadas se recalcula con los datos nuevos

#### Scenario: El usuario cambia el horario
- **WHEN** el usuario edita la hora de inicio o fin de una actividad
- **THEN** la respuesta incluye la probabilidad recalculada para la nueva franja
