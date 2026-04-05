export const URUGUAY_LOCATIONS: Record<string, string[]> = {
  "Artigas": ["Artigas", "Bella Unión", "Tomás Gomensoro", "Baltasar Brum", "Pintadito", "Sequeira"],
  "Canelones": [
    "Barros Blancos", "Canelones", "Ciudad de Canelones", "Ciudad de la Costa", "Colinas de Carrasco", 
    "El Pinar", "Joaquín Suárez", "La Paz", "Lagomar", "Las Piedras", "Lomas de Solymar", "Pando", 
    "Parque Carrasco", "Paso de Carrasco", "Progreso", "Salinas", "San Ramón", "Santa Lucía", 
    "Sauce", "Shangrilá", "Solymar", "Tala", "Toledo"
  ],
  "Cerro Largo": ["Melo", "Río Branco", "Fraile Muerto", "Isidoro Noblía", "Aceguá", "Tupambaé"],
  "Colonia": ["Colonia del Sacramento", "Carmelo", "Juan Lacaze", "Nueva Helvecia", "Rosario", "Tarariras", "Nueva Palmira", "Florencio Sánchez", "Ombúes de Lavalle"],
  "Durazno": ["Durazno", "Sarandí del Yí", "Villa del Carmen", "La Paloma", "Blanquillo", "Centenario"],
  "Flores": ["Trinidad", "Ismael Cortinas", "Andresito"],
  "Florida": ["Florida", "Sarandí Grande", "Casupá", "Fray Marcos", "25 de Mayo", "25 de Agosto", "Cardal"],
  "Lavalleja": ["Minas", "José Pedro Varela", "Solís de Mataojo", "Mariscala", "Pirarajá"],
  "Maldonado": ["Maldonado", "San Carlos", "Punta del Este", "Piriápolis", "Pan de Azúcar", "Aiguá", "Punta Ballena", "Balneario Buenos Aires"],
  "Montevideo": [
    "Abayubá", "Aguada", "Aires Puros", "Arroyo Seco", "Atahualpa", "Bañados de Carrasco", 
    "Barrio Sur", "Bella Italia", "Bella Vista", "Belvedere", "Bolívar", "Brazo Oriental", 
    "Buceo", "Capurro", "Carrasco", "Carrasco Norte", "Casabó", "Casavalle", "Castro", "Centro", 
    "Cerrito", "Cerro", "Chacarita", "Ciudad Vieja", "Colón", "Conciliación", "Cordón", "Cuchilla Pereira", 
    "Flor de Maroñas", "Goes", "Ituzaingó", "Jacinto Vera", "Jardines Hipódromo", "La Blanqueada", 
    "La Comercial", "La Figurita", "La Paloma", "La Teja", "Larrañaga", "Las Acacias", "Las Canteras", 
    "Lavalleja", "Lezica", "Malvín", "Malvín Norte", "Manga", "Marconi", "Maroñas", "Melilla", 
    "Nuevo París", "Pajas Blancas", "Palermo", "Parque Batlle", "Parque Rodó", "Paso Molino", 
    "Paso de la Arena", "Paso de las Duranas", "Peñarol", "Piedras Blancas", "Playa Verde", "Pocitos", 
    "Pocitos Nuevo", "Prado", "Puerto Buceo", "Punta Carretas", "Punta Espinillo", "Punta Gorda", 
    "Punta Rieles", "Reducto", "Santiago Vázquez", "Sayago", "Toledo Chico", "Tres Cruces", "Tres Ombúes", 
    "Unión", "Victoria", "Villa Biarritz", "Villa Dolores", "Villa Española", "Villa García", "Villa Muñoz", 
    "Villa del Cerro"
  ],
  "Paysandú": ["Paysandú", "Guichón", "Quebracho", "Piedras Coloradas", "Tambores", "San Félix"],
  "Río Negro": ["Fray Bentos", "Young", "Nuevo Berlín", "San Javier", "Algorta"],
  "Rivera": ["Rivera", "Tranqueras", "Minas de Corrales", "Vichadero", "Masoller"],
  "Rocha": ["Rocha", "Chuy", "Castillos", "Lascano", "La Paloma", "Cebollatí", "Punta del Diablo"],
  "Salto": ["Salto", "Constitución", "Belén", "San Antonio", "Colonia Lavalleja"],
  "San José": ["San José de Mayo", "Ciudad del Plata", "Libertad", "Rodríguez", "Ecilda Paullier", "Puntas de Valdez"],
  "Soriano": ["Mercedes", "Dolores", "Cardona", "Palmitas", "José Enrique Rodó", "Villa Soriano"],
  "Tacuarembó": ["Tacuarembó", "Paso de los Toros", "San Gregorio de Polanco", "Ansina", "Tambores"],
  "Treinta y Tres": ["Treinta y Tres", "Ejido de Treinta y Tres", "Vergara", "Santa Clara de Olimar", "Cerro Chato", "General Enrique Martínez"]
};

export const DEPARTAMENTOS = Object.keys(URUGUAY_LOCATIONS).sort();

export function calculateShipping(city: string, department: string, total: number): number {
  if (!city || !department) return 350; // default unknown

  const c = city.trim();

  const flexNear = [
    'Buceo','Carrasco','Carrasco Norte','Flor de Maroñas','Las Canteras','Malvín','Malvín Norte','Maroñas','Playa Verde','Pocitos Nuevo','Puerto Buceo','Punta Gorda','Unión',
    'Aguada','Barrio Sur','Centro','Ciudad Vieja','Cordón','Goes','Jacinto Vera','La Blanqueada','La Comercial','La Figurita','Larrañaga','Palermo','Parque Batlle','Parque Rodó','Pocitos','Punta Carretas','Reducto','Tres Cruces','Villa Biarritz','Villa Dolores','Villa Muñoz',
    'Aires Puros','Arroyo Seco','Atahualpa','Bella Vista','Belvedere','Bolívar','Brazo Oriental','Capurro','Casavalle','Castro','Cerrito','Ituzaingó','Jardines Hipódromo','La Teja','Las Acacias','Lavalleja','Marconi','Paso de las Duranas','Paso Molino','Peñarol','Piedras Blancas','Prado','Sayago','Villa Española'
  ];

  const flexMedium = [
    'Casabó','Cerro','La Paloma','Nuevo París','Pajas Blancas','Paso de la Arena','Punta Espinillo','Santiago Vázquez','Tres Ombúes','Victoria','Villa del Cerro',
    'Abayubá','Colón','Conciliación','Cuchilla Pereira','Lezica','Melilla',
    'Manga','Toledo Chico','Villa García',
    'Bañados de Carrasco','Bella Italia','Chacarita','Punta Rieles',
    'Ciudad de la Costa','Colinas de Carrasco','El Pinar','Lagomar','Lomas de Solymar','Parque Carrasco','Paso de Carrasco','Shangrilá','Solymar'
  ];

  const flexFar = [
    'La Paz','Las Piedras','Progreso',
    'Barros Blancos','Joaquín Suárez','Pando','Toledo',
    'Ciudad de Canelones', 'Canelones'
  ];

  let price = 350; // base (interior)

  if (flexNear.includes(c)) {
    price = 169;
  } else if (flexMedium.includes(c)) {
    price = 200;
  } else if (flexFar.includes(c)) {
    price = 290;
  } else if (department === 'Montevideo') {
    // If it's in Montevideo but somehow not in the list, fallback to medium
    price = 200;
  }

  // Free shipping logic
  if (total >= 4000) {
    return 0;
  }

  return price;
}
