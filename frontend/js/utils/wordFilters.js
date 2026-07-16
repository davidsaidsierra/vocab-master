// ── Filtros de palabras compartidos (Repaso ↔ Mis Palabras) ─────────────────
// Centraliza las opciones de los filtros para que ambas vistas usen exactamente
// las mismas categorías/niveles y no se desincronicen. La categoría gramatical
// (part_of_speech) usa la MISMA lista cerrada que el backend/IA.

// Etiquetas en español para la lista cerrada de part_of_speech.
export const POS_OPTIONS = [
    { value: '',             label: 'Toda categoría gram.' },
    { value: 'noun',         label: 'Sustantivo' },
    { value: 'verb',         label: 'Verbo' },
    { value: 'adjective',    label: 'Adjetivo' },
    { value: 'adverb',       label: 'Adverbio' },
    { value: 'pronoun',      label: 'Pronombre' },
    { value: 'preposition',  label: 'Preposición' },
    { value: 'conjunction',  label: 'Conjunción / conector' },
    { value: 'determiner',   label: 'Determinante' },
    { value: 'interjection', label: 'Interjección' },
    { value: 'phrase',       label: 'Frase / expresión' },
];

export const CEFR_OPTIONS = [
    { value: '',   label: 'All levels' },
    { value: 'A1', label: '🟢 A1 · básico' },
    { value: 'A2', label: '🟢 A2 · básico' },
    { value: 'B1', label: '🟠 B1 · intermedio' },
    { value: 'B2', label: '🟠 B2 · intermedio' },
    { value: 'C1', label: '🟣 C1 · avanzado' },
    { value: 'C2', label: '🟣 C2 · avanzado' },
];

export const DAYS_OPTIONS = [
    { value: '',   label: 'All time' },
    { value: '0',  label: 'Today' },
    { value: '1',  label: 'Last 2 days' },
    { value: '2',  label: 'Last 3 days' },
    { value: '3',  label: 'Last 4 days' },
    { value: '6',  label: 'Last 7 days' },
    { value: '13', label: 'Last 2 weeks' },
    { value: '29', label: 'Last 30 days' },
    { value: '59', label: 'Last 2 months' },
    { value: '89', label: 'Last 3 months' },
];

export const MASTERY_OPTIONS = [
    { value: '',   label: 'All mastery' },
    { value: '25', label: '🔴 Worst (0–25%)' },
    { value: '50', label: '🟠 Struggling (0–50%)' },
    { value: '74', label: '🟡 Below average (0–74%)' },
];

// Genera los <option> de una lista, marcando `selected` si coincide.
export function optionsHTML(list, selected = '') {
    return list.map(o =>
        `<option value="${o.value}" ${o.value === selected ? 'selected' : ''}>${o.label}</option>`
    ).join('');
}
