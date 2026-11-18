// The design system's script, loaded on the server so the Worker computes exactly what the page does:
// the invite hash, the lattice, and each guest's P.S. line. Import order matters: window.js runs first.
import './window.js';
import '../design-system/project/components/bundle.js';

export const Q = globalThis.Qubool;
export const SENDERS = Q.senders;                 // { k: 'Kaif', j: 'Jabeen' }
export const MAX_SEATS = 4;                       // most seats one reply may ask for
