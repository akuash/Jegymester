export const MAX_HALL_CAPACITY = 50;
export const RESERVATIONS_KEY = 'jegymester_reservations_v2';
export const HALL_CONFIG_KEY = 'jegymester_hall_config_v2';
export const SCHEDULE_META_KEY = 'jegymester_schedule_meta_v2';
export const PROFILE_OVERRIDES_KEY = 'jegymester_profile_overrides_v2';
export const LOCAL_MOVIES_KEY = 'jegymester_local_movies_v3';
export const LOCAL_SCREENINGS_KEY = 'jegymester_local_screenings_v3';
export const DELETED_SCREENING_OCCURRENCES_KEY = 'jegymester_deleted_screening_occurrences_v1';
export const AUTO_SCREENING_ID_BASE = 8700000;
export const PUBLIC_DAYS_AHEAD = 365;

export const moviePosterByTitle = [
  { src: '/movie-posters/avatar.jpg', titles: ['avatar'] },
  { src: '/movie-posters/banana-joe.jpg', titles: ['banana joe', 'bananos joe', 'banános joe', 'bannanos joe'] },
  { src: '/movie-posters/batman.jpg', titles: ['batman'] },
  { src: '/movie-posters/boomerang.jpg', titles: ['boomerang'] },
  { src: '/movie-posters/dune.jpg', titles: ['dune', 'dűne'] },
  { src: '/movie-posters/forever-my-girl.jpg', titles: ['forever my girl'] },
  { src: '/movie-posters/superman.jpg', titles: ['superman'] },
  { src: '/movie-posters/kincs-ami-nincs.jpeg', titles: ['kincs ami nincs', 'kincs, ami nincs', 'kincs ami nincsen', 'kincs, ami nincsen'] },
  { src: '/movie-posters/ovizsaru.jpg', titles: ['ovizsaru', 'ovi zsaru', 'óvizsaru', 'óvi zsaru', 'kindergarten cop'] },
];

export const ticketCategories = {
  adult: { label: 'Felnőtt', price: 2500 },
  student: { label: 'Diák', price: 1900 },
  senior: { label: 'Nyugdíjas', price: 1800 },
  child: { label: 'Gyerek', price: 1500 },
  family: { label: 'Családi', price: 2100, familyBase: 8500, familyExtra: 1900 },
};

export const defaultScheduleMeta = {
  movieRuntime: 120,
  ads: 15,
  trailers: 10,
  cleaning: 20,
};

export const resources = {
  movies: {
    label: 'Filmek',
    endpoint: '/movie/',
    idField: 'id',
    columns: [
      ['id', 'ID'],
      ['name', 'Név'],
      ['description', 'Leírás'],
      ['image_url', 'Film képe'],
    ],
    emptyForm: { name: '', description: '', image_url: '' },
    fields: [
      ['name', 'Film neve', 'text'],
      ['description', 'Leírás', 'textarea'],
      ['image_url', 'Film képe URL vagy feltöltött kép', 'text'],
    ],
    search: {
      placeholder: 'Keresés film címe vagy leírása alapján, pl. Dune...',
      fields: ['name', 'description'],
    },
  },
  halls: {
    label: 'Termek',
    endpoint: '/hall/',
    idField: 'id',
    columns: [
      ['id', 'ID'],
      ['name', 'Név'],
      ['capacity', 'Backend férőhely'],
    ],
    emptyForm: { name: '', capacity: '' },
    fields: [
      ['name', 'Terem neve', 'text'],
      ['capacity', 'Férőhely, max. 50', 'number'],
    ],
  },
  screenings: {
    label: 'Vetítések',
    endpoint: '/screening/',
    idField: 'id',
    columns: [
      ['id', 'ID'],
      ['time', 'Idő'],
      ['movie.name', 'Film'],
      ['hall.name', 'Terem'],
      ['movie_id', 'Film ID'],
      ['hall_id', 'Terem ID'],
    ],
    emptyForm: { time: '', movie_id: '', hall_id: '' },
    fields: [
      ['time', 'Idő, pl. 1800', 'number'],
      ['movie_id', 'Film ID', 'number'],
      ['hall_id', 'Terem ID', 'number'],
    ],
  },
  tickets: {
    label: 'Jegyek',
    endpoint: '/ticket/',
    idField: 'id',
    columns: [
      ['id', 'ID'],
      ['cost', 'Ár'],
      ['available', 'Elérhető'],
      ['screening_id', 'Vetítés ID'],
      ['user_id', 'Felhasználó ID'],
      ['user.name', 'Tulajdonos'],
    ],
    emptyForm: { cost: '', screening_id: '', user_id: '' },
    fields: [
      ['cost', 'Ár', 'number'],
      ['screening_id', 'Vetítés ID', 'number'],
      ['user_id', 'Felhasználó ID (üresen hagyható)', 'number'],
    ],
    createOnly: true,
    noDelete: true,
  },
  users: {
    label: 'Felhasználók',
    endpoint: '/user/',
    idField: 'id',
    columns: [
      ['id', 'ID'],
      ['name', 'Név'],
      ['email', 'E-mail'],
      ['phone', 'Telefon'],
      ['role.name', 'Szerepkör'],
    ],
    readOnly: true,
  },
};


export const publicDemoData = {
  movies: [
    { id: 9001, name: 'Dune: Második rész', description: 'Sci-fi kalandfilm, homokféreggel és látványos csatákkal.', image_url: '/movie-posters/dune.jpg' },
    { id: 9002, name: 'Avatar', description: 'Látványos fantasy/sci-fi film családoknak és fiataloknak.', image_url: '/movie-posters/avatar.jpg' },
    { id: 9003, name: 'Batman', description: 'Akciófilm a sötét lovaggal.', image_url: '/movie-posters/batman.jpg' },
    { id: 9004, name: 'Banana Joe', description: 'Klasszikus vígjáték.', image_url: '/movie-posters/banana-joe.jpg' },
    { id: 9005, name: 'Boomerang', description: 'Romantikus vígjáték.', image_url: '/movie-posters/boomerang.jpg' },
    { id: 9006, name: 'Forever My Girl', description: 'Romantikus dráma.', image_url: '/movie-posters/forever-my-girl.jpg' },
    { id: 9007, name: 'Superman', description: 'Szuperhősfilm.', image_url: '/movie-posters/superman.jpg' },
    { id: 9008, name: 'Ovizsaru', description: 'Klasszikus családi vígjáték.', image_url: '/movie-posters/ovizsaru.jpg' },
  ],
  halls: [
    { id: 9101, name: '1. terem', capacity: 50 },
    { id: 9102, name: 'VIP terem', capacity: 30 },
  ],
  screenings: [
    { id: 9201, time: 1600, movie_id: 9001, hall_id: 9101 },
    { id: 9202, time: 1830, movie_id: 9002, hall_id: 9102 },
    { id: 9203, time: 2000, movie_id: 9003, hall_id: 9101 },
    { id: 9204, time: 1730, movie_id: 9004, hall_id: 9102 },
    { id: 9205, time: 1930, movie_id: 9005, hall_id: 9101 },
    { id: 9206, time: 2100, movie_id: 9006, hall_id: 9102 },
    { id: 9207, time: 2200, movie_id: 9007, hall_id: 9101 },
    { id: 9208, time: 1845, movie_id: 9008, hall_id: 9101 },
  ],
};
