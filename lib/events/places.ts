/**
 * Where an event can be.
 *
 * Country is a stored ISO code (the column has always defaulted to `MX`), so
 * the list is codes with Spanish labels rather than free text — two organizers
 * writing "México" and "Mexico" should not produce two countries. States are
 * only suggestions: the Mexican thirty-two cover almost every event, but a
 * wedding in Tuscany still needs somewhere to put "Toscana".
 */

export const countries: { value: string; label: string }[] = [
  { value: "MX", label: "México" },
  { value: "US", label: "Estados Unidos" },
  { value: "CA", label: "Canadá" },
  { value: "GT", label: "Guatemala" },
  { value: "BZ", label: "Belice" },
  { value: "SV", label: "El Salvador" },
  { value: "HN", label: "Honduras" },
  { value: "NI", label: "Nicaragua" },
  { value: "CR", label: "Costa Rica" },
  { value: "PA", label: "Panamá" },
  { value: "CU", label: "Cuba" },
  { value: "DO", label: "República Dominicana" },
  { value: "PR", label: "Puerto Rico" },
  { value: "CO", label: "Colombia" },
  { value: "VE", label: "Venezuela" },
  { value: "EC", label: "Ecuador" },
  { value: "PE", label: "Perú" },
  { value: "BO", label: "Bolivia" },
  { value: "CL", label: "Chile" },
  { value: "AR", label: "Argentina" },
  { value: "UY", label: "Uruguay" },
  { value: "PY", label: "Paraguay" },
  { value: "BR", label: "Brasil" },
  { value: "ES", label: "España" },
  { value: "PT", label: "Portugal" },
  { value: "FR", label: "Francia" },
  { value: "IT", label: "Italia" },
  { value: "GB", label: "Reino Unido" },
  { value: "DE", label: "Alemania" },
  { value: "NL", label: "Países Bajos" },
  { value: "CH", label: "Suiza" },
  { value: "GR", label: "Grecia" },
  { value: "MA", label: "Marruecos" },
  { value: "JP", label: "Japón" },
  { value: "AU", label: "Australia" },
];

export const mexicanStates = [
  "Aguascalientes",
  "Baja California",
  "Baja California Sur",
  "Campeche",
  "Chiapas",
  "Chihuahua",
  "Ciudad de México",
  "Coahuila",
  "Colima",
  "Durango",
  "Estado de México",
  "Guanajuato",
  "Guerrero",
  "Hidalgo",
  "Jalisco",
  "Michoacán",
  "Morelos",
  "Nayarit",
  "Nuevo León",
  "Oaxaca",
  "Puebla",
  "Querétaro",
  "Quintana Roo",
  "San Luis Potosí",
  "Sinaloa",
  "Sonora",
  "Tabasco",
  "Tamaulipas",
  "Tlaxcala",
  "Veracruz",
  "Yucatán",
  "Zacatecas",
];

/** The label an organizer recognises, falling back to whatever is stored. */
export function countryLabel(code: string | null): string | null {
  if (!code) return null;
  return countries.find((c) => c.value === code)?.label ?? code;
}
