/**
 * What the assistant says when an organizer declines to answer something.
 *
 * Kept here rather than in either action file because both need it and a
 * "use server" module can only export async functions — and because the guest's
 * message and the assistant's stored fact must say the same thing.
 */
export const NOT_PUBLIC = "Esa información no está disponible al público.";
